# CHEETCHAT production launch checklist

The repository is configured so secrets are never committed. Complete every
unchecked external step in the hosting dashboards before opening registration.

## Required environment

- `APP_ENV=production`
- unique `SECRET_KEY` and `JWT_SECRET_KEY`
- production PostgreSQL `DATABASE_URL`
- `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- production `REDIS_URL` for distributed abuse protection and Socket.IO coordination
- Cloudinary credentials
- `FRONTEND_URL` and `BACKEND_URL`
- VAPID public/private keys and a `mailto:` VAPID subject
- optional `SENTRY_DSN` and `APP_RELEASE`
- a unique `BACKUP_SIGNING_KEY` (at least 32 random characters), stored only in
  the backup worker and restore environment
- a unique `DATA_RETENTION_PEPPER` (at least 32 random characters) used only to
  pseudonymize deleted payment parties and deleted payment-chat references
- `PAYMENT_RETENTION_DAYS`, approved by counsel/accounting for the launch
  jurisdiction; the deployment template uses 2555 days only as a configurable
  operational default, not as legal advice
- `CALL_RECORD_RETENTION_DAYS`, approved in the privacy policy; the deployment
  template defaults to 90 days and accepts only 30 through 730 days
- coturn `TURN_URLS` and shared `TURN_SECRET`; credentials sent to clients expire hourly

The backend intentionally refuses to boot in production when signing secrets
are shorter than 32 characters, PostgreSQL/Supabase/Redis are missing, public
URLs are not HTTPS, or Cloudinary, VAPID push and TURN credentials are absent or
malformed. Automated config tests cover a complete environment and representative
fail-closed URL/TURN cases.

## Browser session security

Login and registration issue the seven-day JWT only as a `Secure`, `HttpOnly`,
`SameSite=None` session cookie in production; the JWT is not returned in JSON or
stored in browser JavaScript storage. Mutating cookie-authenticated requests use
a double-submit CSRF token, session restoration fetches a fresh CSRF value, and
Socket.IO authenticates the same revocable cookie. Bearer authentication remains
available for trusted CLI/mobile compatibility and does not require CSRF.

Before production launch, serve the API from a same-site custom hostname such as
`api.indiasearch.site` and point `VITE_API_URL`/Socket.IO to it. The current
`onrender.com` hostname is cross-site to `chat.indiasearch.site`; browser
third-party-cookie blocking can otherwise prevent reliable login even with
`SameSite=None`. Verify cookie login, reload restoration, logout, CSRF rejection
and socket reconnection in Safari, Chrome, Edge, Android and installed iOS PWA.

## Razorpay go-live

1. Finish Razorpay merchant KYC and activate Live Mode.
2. Put the live Key ID in `RAZORPAY_KEY_ID` and live secret in
   `RAZORPAY_KEY_SECRET` on the backend only.
3. Generate a separate webhook secret and set `RAZORPAY_WEBHOOK_SECRET`.
4. Add the webhook URL
   `https://<backend>/api/payments/webhooks/razorpay` and subscribe to
   `payment.captured`, `payment.failed`, `order.paid`, `refund.processed` and
   `refund.failed`.
5. Run one minimum-value real payment, confirm the order becomes `verified`,
   request and approve its refund, then reconcile both records in the Razorpay
dashboard before enabling the UI publicly.

CHEETCHAT enables checkout only when the live Key ID, Key Secret and separate
webhook secret are all configured. A browser callback alone cannot mark an
order paid: the backend validates its HMAC signature, fetches the payment from
Razorpay, and reconciles the provider order ID, payment ID, amount, currency and
captured status. Refunds receive the same payment-ID and full-amount checks.
Amounts are converted with exact decimal arithmetic and values smaller than one
paise are rejected instead of rounded. Signed webhook reconciliation is
monotonic: capture replays cannot regress a refund, payment IDs cannot be claimed
by another order, incomplete `order.paid` payloads cannot mark an order paid, and
late refund-failure events cannot undo an already processed refund.
Order creation uses a payer-scoped client idempotency key, including a database
unique constraint, so retries and concurrent double-clicks return the same
provider order. Ambiguous provider timeouts remain `creation_unknown` for
reconciliation instead of creating another order. Refund submission similarly
stays `refunding` after an ambiguous timeout, preventing a second provider refund
while webhook reconciliation is pending.

The minute worker also reconciles bounded payment batches against Razorpay. It
finds ambiguous orders by the server receipt, fetches payments belonging to the
matched provider order, and fetches refunds by refund/payment ID. Local state is
changed only after provider order/payment/refund IDs, exact amount, currency and
CHEETCHAT notes match. Worker output includes checked, reconciled and error counts;
alert on any non-zero payment error count or records remaining `creation_unknown`
or `refunding` across multiple intervals. Unpaid local checkout attempts expire
after seven days. The cron service needs `RAZORPAY_KEY_ID` and
`RAZORPAY_KEY_SECRET` in addition to its existing environment.

Payments currently settle to the CHEETCHAT merchant account. Paying individual
business sellers requires Razorpay Route/linked-account onboarding, KYC,
transfer rules, refunds and settlement reconciliation. Do not market this as a
seller marketplace until that separate compliance flow is approved.

## Backup and restore drill

Run backups from a private scheduled worker with PostgreSQL client tools:

```sh
python backend/scripts/backup_database.py --output-dir /secure/backup/path
python backend/scripts/verify_backup.py /secure/backup/path/cheetchat-<timestamp>.dump
RESTORE_DATABASE_URL=postgresql://... python backend/scripts/restore_database.py \
  /secure/backup/path/cheetchat-<timestamp>.dump --confirm-disposable-target
```

Backup manifests are atomically written and HMAC-signed; database credentials
are not passed in subprocess command arguments. Copy dumps and manifests to encrypted, access-controlled object storage with a
retention policy. At least monthly, restore the dump into a disposable database
and execute the backend tests. Provider snapshots are recommended in addition
to these application-level dumps.

## Media retention worker

Run the bounded cleanup worker at least hourly from a private scheduler that has
the same database, backend URL and Cloudinary credentials as the API service:

```sh
python backend/scripts/cleanup_media.py --limit 250
```

The worker removes expired status rows and their managed media, then retries
durable deletion tasks created by reel, status, social-post, avatar and account
deletion. Alert when `media_deletion_task` has old rows or repeated attempts;
do not treat a database-row deletion alone as completion of a user erasure.

General chat uploads are owner-bound and start in a seven-day pending state.
The encrypted message socket claims the opaque asset ID atomically without
revealing message content to the server. The worker removes uploads that were
never claimed; monitor both `upload_asset` pending age and deletion-task age.

The socket boundary accepts only bounded hybrid-encryption envelopes containing
a wrapped key for every current participant, requires an idempotency ID, validates
message type/TTL/reply target, and rate-limits each sender. Client-supplied reply
preview text or names are never persisted outside the encrypted envelope.
Message edits and status replies enforce the same full-participant envelope at
their HTTP boundaries. Status emoji reactions remain status metadata and never
create a server-readable synthetic chat message.
Social, reel, channel and status list endpoints have server-enforced default and
maximum result limits while preserving their existing JSON shapes. Captions,
comments, replies, channel fields and searches are bounded to their database/UI
contracts; invalid cross-post comment parents and nested reply chains are
rejected. Reel likes require a real reel, and view/share tables retain their
per-user uniqueness guarantees. Group and channel owner request queues are also
bounded. Structured JSON values are rejected at comment, reaction and AI text
boundaries instead of being stringified or causing an internal error.
Browser offline history stores only account-scoped encrypted server envelopes;
decrypted message bodies are never written to local storage. Legacy plaintext
message caches are deleted without migration, and live socket delivery, encrypted
edits, deletions and chat deletion update the encrypted cache consistently.
The cached chat list is also account-scoped and metadata-only: decrypted
last-message previews are stripped before persistence, and the older shared
chat-list cache is deleted without migration.
The service worker caches only the public application shell and immutable build
assets, never API or Socket.IO responses. Personalized reels are session- and
account-scoped; logout removes that account's reels, encrypted message history
and chat metadata while legacy unscoped caches are discarded. Secure logout also
removes the device private key and cached public key; a later login restores the
private key only through the password-protected multi-device backup.
Group membership and call lifecycle updates are structured events, not plaintext
chat messages. Calls use content-free records for cooldown, answered/ended state
and participant-authorized history without copying names or message content.
WebRTC relaying requires both sockets to be authorized members of the same call;
SDP and ICE schemas/sizes are bounded, forwarded fields are allowlisted, signaling
is rate-limited, and ring confirmation requires a recent matching call record.
The API and Socket.IO server run on Gunicorn's supported threaded worker with
simple-websocket; deprecated Eventlet/psycogreen monkey-patching is not part of
the production runtime. In-process presence and fallback rate-limit state is
lock-protected, while production abuse protection remains Redis-backed.

## Encrypted scheduled-message worker

The deployment blueprint runs `deliver_scheduled_messages.py` every minute.
The API accepts only an E2EE envelope containing a wrapped key for every current
chat participant; plaintext is rejected. The worker publishes due envelopes
atomically, uses the normal socket/push path and records the delivered message ID
so retries cannot create a second message. Give this worker the production
`DATABASE_URL`, `REDIS_URL`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and
`FRONTEND_URL`, and alert if a pending row remains overdue for more than two
worker intervals.

Creation is token-rate-limited and bounded to 50 pending messages per chat and
250 per account. Delivery or cancellation immediately clears the duplicate
envelope from the scheduling row; the worker purges processed scheduling
metadata after seven days.

The same bounded worker finalizes unanswered ringing calls as `missed` after two
minutes, closes abandoned active calls after 24 hours, and removes finalized
content-free call records after `CALL_RECORD_RETENTION_DAYS` based on their end
time. Alert when the cron job fails; invalid retention settings stop the worker
instead of deleting records with an unsafe policy.

## AI memory privacy

AI conversation memory is server-readable by design and must be disclosed in the
privacy policy. It is isolated by authenticated user, limited to 100 rows per
account and 30 days by default, and can be cleared immediately through the AI
memory control. Active conversations prune on every saved turn; the minute worker
also removes inactive-account expiry/overflow. `AI_MEMORY_RETENTION_DAYS` and
`AI_MEMORY_MAX_ROWS` are deployment settings with production bounds. Account
deletion removes all AI memory before deleting the user.

AI chat messages are limited to 8,000 characters, image prompts to 2,000, and
camera frames to bounded JPEG/PNG/WebP data. Gender overrides are allowlisted and
credentialed streaming uses the central CORS origin allowlist, never wildcard
origin access.

## Release gates

- Backend unit/integration suite passes.
- Frontend lint and production build pass.
- Production dependency audit has no applicable unmitigated issue.
- `/health/live` and `/health/ready` return HTTP 200.
- Monitor `/health/operations` separately: it returns HTTP 503 when the minute
  worker heartbeat is missing/stale or its last run was degraded. Do not use this
  endpoint as the web traffic health check; cron failure must alert operators
  without unnecessarily removing the core chat API from service.
- Run `python backend/scripts/security_smoke.py https://<backend>`.
- Run `python backend/scripts/load_smoke.py https://<backend> --requests 500 --concurrency 25 --path /health/ready --path /api/chats --token <staging-token>` and preserve the JSON report.
- Test sign-up, password reset with recovery code, 2FA and session revocation.
- Test encrypted offline retry and two-device history recovery.
- Test push on Chrome/Edge/Android and installed iOS PWA.
- Test voice/video calls on Wi-Fi, 4G/5G and restricted NAT; deploy TURN before launch.
- Confirm the deploy pre-command runs `python backend/migrate.py` successfully before traffic moves to the new release.
- Test payment success, cancellation, failed signature, delayed webhook and refund.
- Confirm Sentry receives a staging exception without user message content/PII.
- Preserve the signed backup, verification output, disposable restore output,
  and post-restore test result as launch evidence.
- Confirm the hourly media cleanup worker runs, expired statuses disappear from
  both PostgreSQL and Cloudinary/local storage, and the deletion queue drains.
- Confirm an interrupted attachment upload remains usable through offline retry,
  while an abandoned upload older than seven days is removed by the worker.
- Confirm a scheduled encrypted message is delivered while every sender device
  is closed, appears once on a second device, and produces a recipient push.
- Confirm privacy policy, terms, support, data deletion and incident contacts.
- Conduct an independent penetration test and staged load test against staging.

## Account erasure and payment retention

Account deletion removes authentication, encryption keys, sessions, push
subscriptions, profiles, social content and managed media. Provider-verified
payment rows are not silently destroyed: the deleted party and deleted chat are
replaced by keyed pseudonymous references, while provider IDs, amount, currency,
state and timestamps remain available for refunds, reconciliation and the
configured retention period. No email, phone, username or message content is
copied into the retained payment row.

After both payment parties are deleted and the approved retention date passes,
run the confirmed bounded purge from a private scheduler:

```sh
python backend/scripts/cleanup_retention.py --limit 250 --confirm
```

Have local counsel/accounting approve the retention duration, privacy-policy
language, tax/audit requirements, chargeback/refund handling and any legal hold
process before enabling live payments.

## Local verification snapshot (2026-08-02)

This is repository-level evidence only; it does not replace staging or real-device
validation.

- Backend suite: 77 tests passed.
- Backend suite completes without SQLAlchemy legacy warnings; production routes,
  socket handlers, utilities and tests use the SQLAlchemy 2 session lookup API.
- Frontend suite: 51 tests passed; lint and production build passed.
- ChatBubble's self-contained game engine/modal is isolated in `ChatGames.jsx`,
  reducing the parent by more than 500 lines. Multiplayer socket boards are
  schema-validated before state updates; pure tests cover malformed boards,
  wins and draws.
- Home's emoji data/search/category state is isolated in
  `SidebarEmojiPicker.jsx`, removing roughly 140 lines from the page. Search now
  returns category/exact-emoji matches instead of displaying every emoji for
  every query; tests cover category, exact and empty-result behavior.
- AI Chat's waveform, markdown, typing and message presentation layer is isolated
  in `AiChatPresentation.jsx`. It safely handles non-string content, invalid
  timestamps and unsafe generated-image URLs; escaped-markdown and URL tests
  protect this rendering boundary.
- VideoCall media/control primitives are isolated in `CallMediaPrimitives.jsx`.
  Video/audio elements release `srcObject` on unmount, controls expose pressed
  state, and participant avatars use the central scheme/credential-safe URL
  renderer. Avatar tests reject executable and credential-bearing URLs app-wide.
- Threaded Gunicorn runtime booted successfully and `/health/ready` returned 200.
- Local security smoke: all header, hostile-origin and anonymous-access checks passed.
- Local readiness load smoke: 100/100 requests succeeded at concurrency 10;
  p50 5.62 ms, p95 18.91 ms and p99 21.53 ms.
- Dependency audit: no applicable known production vulnerability reported.
- Backup signing, tamper detection, secret-safe subprocess invocation and
  production-target restore refusal are covered by automated tests.
- Sentry error/transaction events are filtered through an application-side
  allowlist that removes request bodies, query strings, authorization/cookies,
  user identity, breadcrumbs, exception values and stack locals before export.
  Automated tests use a private marker to verify it cannot survive sanitization.
- Handled authentication, AI-provider/stream/TTS, chat/group/GIF, upload,
  translation, music and shared utility failures use structured safe reporting:
  logs contain only an event name, exception type and request ID, never the raw
  exception/provider response value. The same private-marker test guards this
  hosting-log boundary.
- Razorpay HTTP bodies and exception values never reach API clients; creation,
  verification and refund failures return stable generic states while safe
  telemetry and the reconciliation worker retain operational visibility.
- The scheduled worker writes a database heartbeat with `ok`/`degraded` status;
  operational health tests cover healthy, degraded and stale states independently
  from core API readiness.

Before launch, repeat security/load checks against staging, preserve their raw
JSON reports, and complete every provider/device/manual item above.

## Rollout

Start with staff accounts, then a small invite-only cohort. Monitor error rate,
ready-health failures, payment mismatches, push delivery and socket disconnects.
Keep a tested rollback release and disable registration/payments immediately if
integrity or reconciliation alarms fire.
