# PodLive native migration

## Architecture

CHEETCHAT now owns the responsive PodLive user interface. Authentication is a silent, server-verified exchange:

1. The signed-in CHEETCHAT browser requests a one-time ticket from `POST /api/auth/podlive-sso`.
2. The native PodLive feature sends only that ticket to `POST <PODLIVE_API>/api/auth/sso/cheetchat`.
3. PodLive verifies the ticket with CHEETCHAT, links or creates its internal user, then issues a PodLive API token.
4. Video and live media travel directly between the phone and LiveKit/Bunny/S3. CHEETCHAT does not proxy media.

PodLive credentials are isolated under `cheetchat_podlive_*` browser keys. The old iframe and separate login/signup screens are no longer used by CHEETCHAT.

## Deployment steps for the owner

1. Deploy the current `podlive/podlive-backend` code to the existing Render service first. The deployed service must return a non-404 response for `POST /api/auth/sso/cheetchat`.
2. On the PodLive Render service, set `CHEETCHAT_API_URL=https://chietchat-backend.onrender.com`. Keep the existing database, JWT, LiveKit and media environment variables unchanged.
3. On the CHEETCHAT backend, confirm `PODLIVE_SSO_SECRET` is a strong secret and deploy the backend containing `/api/auth/podlive-sso` and `/api/auth/podlive-sso/verify`.
4. On the CHEETCHAT frontend deployment, set `VITE_PODLIVE_API_URL=https://podlive-api-18as.onrender.com` (the code has this value as a safe default).
5. Deploy the CHEETCHAT frontend after both backends are live. Do not remove the old PodLive Vercel frontend until acceptance testing is complete; it is a rollback reference only.
6. Sign in to CHEETCHAT, open PodLive and verify that no PodLive login/signup appears.
7. On two HTTPS mobile devices, test viewer playback and creator broadcasting. Allow camera/microphone only when starting the studio. Verify LiveKit participant audio/video, stream end, HLS playback and video upload.
8. After acceptance, the old PodLive frontend deployment may be retired. Keep the PodLive backend, LiveKit and media CDN deployments active.

## Required production checks

- CHEETCHAT ticket endpoint returns `200` for a logged-in user.
- PodLive SSO exchange returns `200` and the same CHEETCHAT identity reconnects to the same PodLive account.
- Reusing a one-time ticket is rejected.
- LiveKit config returns a secure `wss://` URL.
- PodLive CORS permits the CHEETCHAT origin and required authorization/content-type headers.
- Mobile widths 360 px, 390 px and tablet/desktop layouts have no iframe or horizontal page overflow.
- Camera/microphone and multi-user media tests are performed on the final HTTPS domain; localhost automation cannot certify physical hardware or mobile network behavior.
