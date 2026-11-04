# CHEETCHAT Microservices Migration

## Goal

Move feature areas into independently deployable services so a failure or release in one domain does not take down unrelated domains. Keep the current browser routes, `/api/*` contracts, Socket.IO event names, auth tokens, and encrypted-message envelopes compatible while services are migrated.

This is a staged migration. The current Flask app is a modular monolith: it has feature blueprints, but they share one Flask process, SQLAlchemy metadata, a database, Redis state, and a Socket.IO server. Deploying the same app several times with different names would not isolate failures and would create unsafe concurrent schema ownership.

## Target topology

The browser talks only to an API gateway. The gateway validates public traffic controls and routes requests; domain services validate identity and authorization themselves. Services communicate over versioned HTTP contracts for request/response work and a durable event bus for cross-domain updates.

| Service | Owns | Public route families |
| --- | --- | --- |
| Identity | accounts, registration, sessions, profile basics, contacts, blocks, follows | `/api/login`, `/api/register`, `/api/auth/*`, `/api/users/*`, `/api/user/*` |
| Chat | direct/group chats, encrypted messages, chat membership, Socket.IO chat events, calls, collaboration, scheduled delivery | `/api/chats/*`, `/api/messages/*`, `/api/calls/*`, `/api/status/*`, `/socket.io` |
| Social | feed, posts, comments, follows/discovery, reels | `/api/social/*`, `/api/reels/*`, `/api/search` |
| Music | stateless iTunes search adapter | `/api/music/search` |
| Translation | stateless translation provider adapter | `/api/translate` |
| Commerce | business profiles, catalogs, seller onboarding, orders, affiliates, payment intents/webhooks | `/api/business/*`, `/api/marketplace/*`, `/api/payments/*`, `/api/affiliate/*` |
| AI | AI chat, AI memory, text/media generation, translation/transcription, Saskat | `/api/ai/*`, `/api/saskat/*`, `/api/translate` |
| Notifications | notification inbox, push subscriptions, fan-out and delivery | `/api/notifications/*`, push workers |
| Media | upload authorization, media processing, deletion and delivery metadata | `/api/upload`, `/uploads/*`, media workers |
| PodLive | live rooms and stage/invite lifecycle | existing `/podlive-api/*` service |
| Admin | moderation and operations console APIs | `/api/admin/*` |

The route table is an initial ownership proposal. Endpoints that currently mix domains (for example, status replies and chat messages) must be split by behavior and migrated behind compatibility adapters before routes move.

## Isolation requirements

- A domain service owns its schema and migrations. Other services must not query or write its tables.
- Cross-domain changes use versioned APIs or durable events. Event consumers are idempotent and retry from an outbox-backed queue.
- Services have separate health/readiness checks, resource limits, secrets, deployment schedules, and rollback paths.
- Auth is verified locally using issuer, audience, key id, expiry, and signature checks. Internal service credentials are separate from user tokens and rotated independently.
- Redis keys are namespaced by service. Presence, throttling, and job state cannot depend on process-local memory in production.
- Payment webhooks, chat delivery, and notification fan-out use idempotency keys and durable queues.
- Public URLs continue through the gateway; the frontend never receives internal service URLs or service secrets.

## Migration sequence

1. **Contracts and observability:** inventory endpoint and socket contracts; add request IDs, service names, latency/error metrics, dependency health, and per-domain OpenAPI/event schemas. Do not change public behavior.
2. **Service runtime foundation:** add a common health/auth/config library, gateway routing, local compose profiles, and service-specific deployment definitions. Keep the monolith as the fallback owner for every unmigrated route.
3. **Low-coupling extraction:** Music search and message translation are independently deployable stateless services behind compatible API routes. Next, extract AI provider execution. Keep user auth at the gateway and make each service independently authorize a signed, audience-bound identity assertion. Move AI conversation storage only with an explicit backfill and ownership cutover.
4. **Social and media:** extract feed/reels and media processing with service-owned schemas and object-storage references. Maintain old endpoints through gateway adapters during rollout.
5. **Commerce and payments:** extract business/catalog and payment workflows with durable events, payment idempotency, and a webhook replay plan.
6. **Chat last:** extract the chat database and Socket.IO service after membership, presence, message delivery, calls, collaboration, and scheduled messages have stable contracts. Preserve end-to-end encryption payloads byte-for-byte.
7. **Retire monolith paths:** remove old handlers only after traffic, reconciliation, rollback, and data consistency checks pass for each domain.

## Cutover and rollback

Each domain cutover is controlled by an environment-based gateway route. Rollback switches routing to the previous owner; it must not reverse-write to two databases. Before ownership moves, migration tooling performs a dry run, row-count/checksum comparison, and a write freeze or dual-write strategy with reconciliation. A service is not considered migrated until its dashboards, alerts, runbooks, and restore test exist.

## Current state

The repository still has one Flask API deployment for most stateful features, one scheduled-delivery worker, one cleanup worker, and a separate PodLive project/service. `backend/routes/*_bp.py` are feature-oriented modules, not independently deployable microservices. The `backend/models.py`, `backend/utils.py`, shared database, and `backend/sockets.py` are cross-feature coupling points. Chat and social must not be split by copying the current app into multiple Render services.

The first independently deployable domain is the stateless Music search service in `services/music`. The API retains `GET /api/music/search`, validates the active user session, and forwards a short-lived HMAC-signed identity assertion to the service. The Music service owns no persistent data and has its own health checks, container, Compose service, and Render service definition. The second is the stateless Translation adapter in `services/translation`; the API retains `POST /api/translate` and its response shape. Both have separate health checks, containers, Compose services, and Render service definitions. Render generates each service's HMAC secret and the API references it through a service environment reference, avoiding committed or browser-visible keys. Provider availability remains an external dependency; API fallbacks are retained until production cutover is verified.

The AI Generation service in `services/ai-generation` extracts bounded text-provider execution behind the same signed gateway contract. `/api/ai/grammar` routes to it when `AI_GENERATION_SERVICE_URL` is configured and falls back to the existing provider path on failure. The Render blueprint now configures the service URL and HMAC secret reference. AI conversation history, memory, and the rest of `/api/ai/*` remain in the monolith; the URL configuration alone does not establish a production canary or complete AI-domain extraction.

Social feed ranking policy lives in `backend/features/social/feed.py`, but the Social routes, storage, and authorization still run inside the monolith. This is a transport-independent code boundary, not a Social microservice. Stateful domain extraction still needs service-owned databases, migration/backfill tooling, event contracts, and gateway cutovers.


## Social Polls extraction (prepared, not cut over)

`services/social-polls` is the first stateful slice extracted from Social. It owns the `social_poll_votes` PostgreSQL table and exposes signed, versioned vote/result/import contracts. The public Social API remains the compatibility gateway and validates the authenticated user and source post before forwarding a vote. With the service URL absent, the legacy implementation remains authoritative. When configured, poll reads and writes fail closed on service errors; they do not silently dual-write to the monolith.

The Render service requests a dedicated `SOCIAL_POLLS_DATABASE_URL`; it must not use the monolith's database. The backend service URL is intentionally not wired by the Blueprint. First configure durable storage and run the service schema migration. Then freeze poll writes and run `backend/scripts/migrate_social_polls.py --apply` as a one-off process with the service URL/key in that process environment; keep the live API gateway URL unset until the row count comparison passes. The legacy table remains available for rollback/reconciliation.

**Cutover is still gated.** Account erasure currently deletes `SocialPollVote` inside the monolith transaction. Before configuring `SOCIAL_POLLS_SERVICE_URL`, add and verify an idempotent user-erasure event/outbox consumer for this service (including retries and reconciliation), plus service restore/monitoring procedures. This prevents a user deletion from leaving votes behind after ownership moves. The slice is prepared and contract-tested, but is not yet production-cut over or a completed Social microservice migration.
