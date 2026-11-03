# Music service

Stateless domain service for iTunes music search. The public route remains
`GET /api/music/search` on the API gateway; the gateway validates the user's
token and active session, then sends a signed, short-lived identity assertion
to `POST /internal/v1/music/search`.

The service owns no user data. Its independent failure returns the existing
search warning payload instead of taking down the API or other features.

## Configuration

- `MUSIC_SERVICE_HMAC_KEY`: same private random value on the API and this
  service, at least 32 characters.
- `MUSIC_SERVICE_URL`: internal gateway target, for example
  `https://chietchat-music.onrender.com`.

Generate a production value with `openssl rand -hex 32`; set the exact same
value in both Render services. Never put it in frontend environment variables,
source code, or logs.

Health endpoints are `/health/live` and `/health/ready`. The provider's API key
is not used; iTunes search is a bounded, read-only upstream request.
