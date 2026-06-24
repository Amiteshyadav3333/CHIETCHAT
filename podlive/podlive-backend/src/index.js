const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET'
];

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const app = express();

// Trust Render's reverse proxy (required for express-rate-limit to work correctly)
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Security & perf middleware
app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting — general API
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many attempts, please try again later.' } });
app.use('/api/auth/', authLimiter);

// Attach Socket.io to request object for use in controllers
app.use((req, res, next) => {
  req.io = io;
  next();
});

const path = require('path');

// Serve local uploads (fallback when S3 is unavailable)
const uploadsDir = path.join(__dirname, '../uploads');
if (!require('fs').existsSync(uploadsDir)) {
  require('fs').mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

app.get('/', (req, res) => {
  res.send({ message: 'PodLive Server is running' });
});

// Alias for LiveKit token if called directly via /get-token
const { AccessToken } = require('livekit-server-sdk');
app.get('/get-token', async (req, res) => {
  try {
    const { room, participant } = req.query;
    if (!room || !participant) {
      return res.status(400).json({ error: 'room and participant are required' });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participant,
    });
    at.addGrant({ roomJoin: true, room: room, canPublish: true, canSubscribe: true });

    const token = await at.toJwt();
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Routes
const authRoutes = require('./routes/auth.routes');
const liveRoutes = require('./routes/live.routes');
const userRoutes = require('./routes/user.routes');
const stageRoutes = require('./routes/stage.routes');
const uploadRoutes = require('./routes/upload.routes');
const searchRoutes = require('./routes/search.routes');

app.get('/api/admin/db-sync', async (req, res) => {
    try {
        const { exec } = require('child_process');
        exec('npx prisma db push --accept-data-loss', (error, stdout, stderr) => {
            if (error) {
                return res.status(500).json({ error: error.message, stderr });
            }
            res.json({ message: 'Database synced successfully', stdout });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/user', userRoutes);
app.use('/api/stage', stageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/search', searchRoutes);

// Public config endpoint — exposes only what the frontend needs (no secrets)
// API keys and secrets are NEVER sent here. Only the WebSocket URL.
app.get('/api/config', (req, res) => {
  const livekitUrl = process.env.LIVEKIT_URL;
  if (!livekitUrl) {
    return res.status(503).json({ error: 'LiveKit is not configured on this server.' });
  }
  res.json({
    livekitUrl, // e.g. wss://podlike-r0rwil4t.livekit.cloud
  });
});

// Real-time socket connection
const socketHandler = require('./sockets/socket');
socketHandler(io);

// Global Error Handler Middleware (Ensure all errors return JSON, not HTML)
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File size too large. Professional plans allow up to 1GB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }

  res.status(500).json({ 
    error: 'Internal Server Error', 
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
  });
});

const PORT = process.env.PORT || 5005;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
