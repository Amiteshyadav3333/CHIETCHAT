# 💬 ChietChat

**ChietChat** is an all-in-one messaging and social platform that combines private end-to-end encrypted chats, voice/video calls, a social feed, reels, stories, an AI companion, payments, and live podcasting in a single app.

🌐 **Live demo:** [chietchat.vercel.app](https://chietchat.vercel.app)

---

## ✨ Highlights

| Area | What you get |
| --- | --- |
| 🔐 **Messaging** | End-to-end encrypted DMs and groups, edit/delete/reply/pin/star, reactions, polls, scheduled messages, disappearing (Snap) mode |
| 📞 **Calls** | Encrypted voice and video calls, screen sharing, call history and recording |
| 📱 **Social** | Feed with posts, likes, comments, reposts, channels, follow system, rich profiles |
| 🎬 **Reels** | Short videos with iTunes music, filters, captions, categories, view counts |
| 📖 **Stories** | 24-hour photo/video stories with music and privacy controls |
| 🤖 **Saskat AI** | AI companion with interview practice, grammar correction, camera vision, web search, image generation, text-to-speech, 11 languages |
| 💳 **Payments** | Premium membership, referrals, monetization for posts and reels |
| 🎮 **Fun** | Board games, Snake, in-chat games, virtual gifts |
| 🎨 **Creative tools** | Drawing studio, pro camera, avatar creator, photo stickers |
| 🎙️ **PodLive** | Live podcast streaming with audience interaction |
| 🛡️ **Admin** | Dashboard, content moderation, reports, ad management, analytics |

See [`FEATURES_LIST.md`](./FEATURES_LIST.md) for the complete list of 100+ features.

---

## 🧰 Tech Stack

**Backend**
- Python 3.11 with Flask, served by Gunicorn
- Socket.IO for real-time messaging
- PostgreSQL (database) and Redis (caching / real-time)
- Web Push (VAPID) notifications
- Sentry for error monitoring

**Frontend**
- React (JSX components)
- Responsive design with offline message queue support

**Integrations**
- **AI:** Google Gemini (primary), Groq / OpenAI / Grok (fallbacks), Serper (web search)
- **Media:** Cloudinary
- **Auth:** Supabase
- **Payments:** Razorpay
- **Calls:** WebRTC with TURN server
- **Music / GIFs / TTS:** iTunes API, Tenor/Giphy, Google Translate TTS

**Deployment**
- Backend on [Render](https://render.com) (`render.yaml`), frontend on [Vercel](https://vercel.com)
- Scheduled jobs on Render cron: scheduled message delivery and data-retention cleanup

---

## 📁 Project Structure

```
CHIETCHAT/
├── .github/workflows/    # CI workflows
├── docs/                 # Project documentation
├── podlive/              # Live podcast module
├── signal-clone/         # Main application
│   ├── backend/          # Flask API, migrations, scheduled scripts
│   └── frontend/         # React app
├── FEATURES_LIST.md      # Full feature list
├── Procfile              # Process definition
├── render.yaml           # Render deployment blueprint
├── runtime.txt           # Python runtime version
└── test_gemini.py        # Gemini API test script
```

---

## 🚀 Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- PostgreSQL
- Redis (optional for local development)

### 1. Clone the repository

```bash
git clone https://github.com/Amiteshyadav3333/CHIETCHAT.git
cd CHIETCHAT/signal-clone
```

### 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create the .env file (see Environment Variables below), then:
python migrate.py               # run database migrations
python wsgi.py                  # or: gunicorn -w 1 --threads 100 wsgi:app
```

### 3. Frontend setup

```bash
cd ../frontend
npm install
npm run dev
```

> Check `package.json` in the frontend folder for the exact dev and build scripts.

---

## 🔑 Environment Variables

Create a `.env` file in `signal-clone/backend/`:

```env
# Core
SECRET_KEY=your-secret-key
JWT_SECRET_KEY=your-jwt-secret
DATABASE_URL=postgresql://user:password@localhost:5432/chietchat
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5000
APP_ENV=development

# Auth
SUPABASE_URL=
SUPABASE_ANON_KEY=

# Media
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
MAX_UPLOAD_BYTES=104857600

# Payments
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Push notifications
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=

# Calls (WebRTC)
TURN_URLS=
TURN_SECRET=

# AI
GEMINI_API_KEY=
GROQ_API_KEY=
OPENAI_API_KEY=
SERPER_API_KEY=

# Monitoring & data retention
SENTRY_DSN=
PAYMENT_RETENTION_DAYS=2555
CALL_RECORD_RETENTION_DAYS=90
AI_MEMORY_RETENTION_DAYS=30
AI_MEMORY_MAX_ROWS=100
```

> ⚠️ Never commit your `.env` file or API keys to GitHub.

---

## ☁️ Deployment

The repo includes a Render blueprint (`render.yaml`) that provisions:

| Service | Type | Purpose |
| --- | --- | --- |
| `chietchat` | Web | Flask API served by Gunicorn, with health check at `/health/ready` and migrations run before each deploy |
| `chietchat-scheduled-delivery` | Cron (every minute) | Delivers scheduled messages |
| `chietchat-retention-cleanup` | Cron (every 10 minutes) | Cleans up expired data per retention policy |

Set all secret environment variables in the Render dashboard, then deploy. The frontend can be deployed to Vercel by pointing it to `signal-clone/frontend`.

---

## 🔒 Privacy & Security

- End-to-end encryption using public/private keys
- Two-factor authentication and recovery codes
- Granular privacy controls: last seen, online status, read receipts, profile photo, stories
- Session and multi-device management
- Automatic data retention and cleanup

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m "Add your feature"`
4. Push the branch: `git push origin feature/your-feature`
5. Open a Pull Request

---

## 👨‍💻 Author

**Amitesh Yadav** — [@Amiteshyadav3333](https://github.com/Amiteshyadav3333)

---

⭐ If you like this project, give it a star on GitHub!
