# CHEETCHAT architecture

CHEETCHAT uses feature-oriented modules with thin UI and transport layers.
Existing HTTP paths, Socket.IO event names, encryption envelopes, and database
models are compatibility contracts and must not be changed casually.

## Frontend

`frontend/src/features/<feature>` owns feature rules and exposes a small public
API through `index.js`. Pages and components import from that public API rather
than reaching into another feature's internal files.

- `chat`: message identity and scheduled-message controller
- `calls`: participant limits, media/SDP policy, layout, and invitation controller
- `location`: live-location lifecycle and message updates
- `polls`: vote API and realtime vote reducer
- `media`: recording constraints, media policies, and video-note recorder hook
- `notifications`: payload normalization and realtime subscription hook

Reusable visual components remain in `components`; route-level composition
remains in `pages`; generic infrastructure remains in `utils` and `context`.

## Backend

`backend/features/<feature>` contains transport-independent validation and state
rules. Flask blueprints and Socket.IO handlers authenticate, authorize, call a
feature service, and serialize the response. Database models remain centralized
until a dedicated repository layer is justified.

Feature-specific socket registration belongs beside the feature (for example,
`features/location/socket_handlers.py`). The root `sockets.py` remains the
composition root for cross-feature chat and call signaling and can be reduced
incrementally without changing registered event names.

## Adding a feature

1. Create a feature folder and public `index.js`/`__init__.py`.
2. Put pure rules in services and side effects behind explicit functions/hooks.
3. Keep HTTP and socket payloads backward compatible.
4. Add contract tests for payload normalization and state updates.
5. Integrate through the feature's public API; avoid cross-feature deep imports.
6. Run frontend tests/build plus backend feature tests before merging.
