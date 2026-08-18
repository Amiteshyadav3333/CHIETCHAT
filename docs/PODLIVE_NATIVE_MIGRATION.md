# PodLive native migration

## Architecture

CHEETCHAT now owns the responsive PodLive user interface. Authentication is a silent, server-verified exchange:

1. The signed-in CHEETCHAT browser requests a one-time ticket from `POST /api/auth/podlive-sso`.
2. The native PodLive feature sends only that ticket to `POST <PODLIVE_API>/api/auth/sso/cheetchat`.
3. PodLive verifies the ticket with CHEETCHAT, links or creates its internal user, then issues a PodLive API token.
4. Live audio/video travels directly between the phone and LiveKit. CHEETCHAT and PodLive do not proxy or record media.

PodLive credentials are isolated under `cheetchat_podlive_*` browser keys. The old iframe and separate login/signup screens are no longer used by CHEETCHAT.

## Deployment steps for the owner

1. Deploy `Amiteshyadav3333/Podlive` with Render root empty, build command `cd podlive-backend && npm ci && npx prisma generate && npx prisma migrate deploy`, and start command `cd podlive-backend && npm start`.
2. On the PodLive Render service, set `CHEETCHAT_API_URL=https://chietchat-backend.onrender.com` and `ENABLE_LIVEKIT_HLS_EGRESS=false`.
3. On the CHEETCHAT backend, confirm `PODLIVE_SSO_SECRET` is a strong secret and deploy the backend containing `/api/auth/podlive-sso` and `/api/auth/podlive-sso/verify`.
4. On the CHEETCHAT frontend deployment, set `VITE_PODLIVE_API_URL=https://podlive-api-18as.onrender.com` (the code has this value as a safe default).
5. Deploy the CHEETCHAT frontend after both backends are live. Do not remove the old PodLive Vercel frontend until acceptance testing is complete; it is a rollback reference only.
6. Sign in to CHEETCHAT, open PodLive and verify that no PodLive login/signup appears.
7. On two HTTPS mobile devices, test viewer playback and creator broadcasting. Allow camera/microphone only when starting the studio. Verify participant join/leave, camera switching, network reconnect and explicit stream end.
8. After acceptance, the old PodLive frontend deployment may be retired. Keep the PodLive backend and LiveKit active; recording, VOD and upload flows stay disabled.

## Required production checks

- CHEETCHAT ticket endpoint returns `200` for a logged-in user.
- PodLive SSO exchange returns `200` and the same CHEETCHAT identity reconnects to the same PodLive account.
- Reusing a one-time ticket is rejected.
- LiveKit config returns a secure `wss://` URL.
- Creating or starting a room never creates HLS egress, a recording URL or a VOD entry.
- PodLive CORS permits the CHEETCHAT origin and required authorization/content-type headers.
- Mobile widths 360 px, 390 px and tablet/desktop layouts have no iframe or horizontal page overflow.
- Camera/microphone and multi-user media tests are performed on the final HTTPS domain; localhost automation cannot certify physical hardware or mobile network behavior.
