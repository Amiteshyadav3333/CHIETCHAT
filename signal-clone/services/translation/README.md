# CHEETCHAT Translation service

Stateless provider adapter for authenticated message translation. The public API
continues to serve `POST /api/translate`; when `TRANSLATION_SERVICE_URL` is set,
the API forwards the validated request to this service over a short-lived,
HMAC-signed internal request. The service stores no user data.

## Local run

```sh
cd signal-clone/services/translation
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
export TRANSLATION_SERVICE_HMAC_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
gunicorn --workers 2 --threads 8 --timeout 20 app:app --bind 127.0.0.1:5002
```

For the full local stack use `docker-compose up --build`; the API and service
share a local-only development key from `docker-compose.yml`.

## Production

The Render blueprint creates a dedicated service with its own health checks and
runtime. Render generates `TRANSLATION_SERVICE_HMAC_KEY` on that service and
references that same secret from the API service. Never put the key in source
control or expose it to the browser. Requests have a 60-second replay window,
body-bound signatures, an 8,000-character limit, language validation, and
bounded provider timeouts. `/health/live` is liveness; `/health/ready` checks
that the service credential is configured.

## Contract

- `POST /internal/v1/translate` (HMAC-authenticated):
  `{userId, text, sourceLang, targetLang}` -> `{translatedText}`
- `GET /health/live`, `GET /health/ready`

Provider failures return 502 with a safe generic message. The existing API route
keeps its public response shape and has a local/rollback provider fallback when
the service URL is not configured.
