# Social Polls service

This service owns poll vote rows in its own PostgreSQL database. The existing API
continues to authenticate the user and load the post, then calls the service over
a signed internal HMAC contract. The service has no browser-facing routes and
receives only numeric user/post IDs, the poll choices needed to validate a vote,
and vote indices.

## Deployment and safe cutover

1. Configure `SOCIAL_POLLS_DATABASE_URL` on this service to a dedicated durable
   PostgreSQL database. Do not point it at the application's shared database.
   The Render Blueprint intentionally asks for this value rather than provisioning
   a paid database automatically. A free Render Postgres instance expires after
   30 days and is not suitable for production persistence.
2. Let the service pre-deploy migration create its own `social_poll_votes` table.
   Confirm `/health/ready` reports ready.
3. Freeze poll voting briefly and take a backup of the legacy database.
4. Run the migration script as a one-off process with the service URL and signing
   key in that process environment, while leaving `SOCIAL_POLLS_SERVICE_URL` unset
   in the live API deployment. Run `python scripts/migrate_social_polls.py` for a
   dry-run count, then `python scripts/migrate_social_polls.py --apply`. The script
   imports in idempotent batches and blocks cutover unless service and legacy row
   counts match. Keep the write freeze until cutover.
5. Add `SOCIAL_POLLS_SERVICE_URL` to the backend environment and redeploy. The
   backend receives the service's generated signing key through the Blueprint.
   Verify poll reads and vote changes with two accounts. Keep the legacy vote table
   intact through the rollback window. Rollback is a gateway switch only after
   freezing writes and reconciling service votes; never dual-write both databases.

The API has no service URL configured in the Blueprint, so existing polls stay on
the monolith until the dedicated database is configured and the backfill is
verified. Once configured, service failures return `503` rather than silently
writing votes to the legacy table.
