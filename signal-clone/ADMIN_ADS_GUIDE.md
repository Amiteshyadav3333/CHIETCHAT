# Saskat AI ads and admin setup

## How users see ads

1. A free user opens **Social → Community → Saskat AI** and asks a question.
2. Saskat returns its answer, then retrieves the best matching ad from the admin catalog using the ad's keywords.
3. A video ad appears like an in-app YouTube ad. It can be skipped after 8 seconds, or the user can choose **Buy in app**.
4. Premium users never receive this ad request or ad overlay.

Questions are not saved for ad targeting. The server records only total impressions and clicks for each ad.

## First admin login

Set these five values in the backend environment (or `backend/.env` for local development):

```env
ADMIN_NAME=Your Admin Name
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PHONE=9999999999
ADMIN_PASSWORD_HASH=<generated hash>
ADMIN_ACCESS_CODE=<long random secret>
```

Generate the password hash without storing the password:

```bash
python backend/scripts/create_admin_password_hash.py
```

Copy its output to `ADMIN_PASSWORD_HASH`, restart the backend, then open `/admin/login`.
The login screen requires the same name, email, mobile number, password, and access code. The dashboard session expires after two hours.

## Add an ad

Open **Advertisements → Add New Ad**. Add a title, description, product ID, product link and detailed matching keywords. Upload a video for a YouTube-style video ad (or an image as fallback). The keywords determine which Saskat questions can show that ad.
