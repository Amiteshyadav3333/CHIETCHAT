const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const crypto = require('crypto');
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
for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
  if (process.env[key].length < 32) {
    throw new Error(`${key} must contain at least 32 characters`);
  }
}
if (process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
  throw new Error('JWT access and refresh secrets must be different');
}
if (process.env.LIVEKIT_API_SECRET.length < 32) {
  throw new Error('LIVEKIT_API_SECRET must contain at least 32 characters');
}
if ((process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') && !process.env.REDIS_URL) {
  throw new Error('REDIS_URL is required in production for shared realtime and abuse controls');
}

const app = express();

const allowedOrigins = new Set([
  'https://chat.indiasearch.site',
  'https://podlive.indiasearch.site',
  'http://localhost:3000',
  'http://localhost:5173',
]);
const corsOptions = {
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
};
app.use(cors(corsOptions));

// Trust Render's reverse proxy (required for express-rate-limit to work correctly)
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [...allowedOrigins],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Security & perf middleware
app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const createRateLimiter = ({ name, windowMs, max }) => {
  const windowSeconds = Math.ceil(windowMs / 1000);
  const localHits = new Map();
  return async (req, res, next) => {
    const identity = req.ip || req.socket.remoteAddress || 'unknown';
    let count;
    let retryAfter = windowSeconds;
    try {
      const redisClient = req.app.locals.redisClient;
      if (redisClient?.isReady) {
        const identityHash = crypto.createHash('sha256').update(identity).digest('hex');
        const result = await redisClient.eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('TTL',KEYS[1])}",
          { keys: [`podlive:rate:${name}:${identityHash}`], arguments: [String(windowSeconds)] }
        );
        count = Number(result[0]);
        retryAfter = Math.max(1, Number(result[1]));
      } else if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') {
        return res.status(503).json({ error: 'Rate limiting service unavailable' });
      } else {
        const now = Date.now();
        let entry = localHits.get(identity);
        if (!entry || entry.resetAt <= now) {
          entry = { count: 0, resetAt: now + windowMs };
          localHits.set(identity, entry);
        }
        count = ++entry.count;
        retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
        if (localHits.size > 50000) {
          for (const [key, value] of localHits) if (value.resetAt <= now) localHits.delete(key);
        }
      }
    } catch (error) {
      console.error(`[Rate limit] ${name} check failed:`, error.message);
      if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') {
        return res.status(503).json({ error: 'Rate limiting service unavailable' });
      }
      return res.status(503).json({ error: 'Rate limiting service unavailable' });
    }
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(Math.max(0, max - count)));
    if (count > max) {
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many attempts, please try again later.' });
    }
    return next();
  };
};

app.use('/api/', createRateLimiter({ name: 'api', windowMs: 60 * 1000, max: 200 }));
app.use('/api/auth/', createRateLimiter({ name: 'auth', windowMs: 15 * 60 * 1000, max: 20 }));

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

app.get('/health/live', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    status: 'ok',
    service: 'podlive-api',
    capabilities: { stageInvites: true },
    release: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || null,
  });
});

// Routes
const authRoutes = require('./routes/auth.routes');
const liveRoutes = require('./routes/live.routes');
const userRoutes = require('./routes/user.routes');
const stageRoutes = require('./routes/stage.routes');
const uploadRoutes = require('./routes/upload.routes');
const searchRoutes = require('./routes/search.routes');

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

// Real-time socket connection. With REDIS_URL configured, broadcasts, user
// rooms, invites and chat work across all Render instances instead of being
// limited to one Node process.
const socketHandler = require('./sockets/socket');

const configureRealtime = async () => {
  if (process.env.REDIS_URL) {
    const { createAdapter } = require('@socket.io/redis-adapter');
    const { createClient } = require('redis');
    const pubClient = createClient({ url: process.env.REDIS_URL });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (error) => console.error('[Redis pub]', error.message));
    subClient.on('error', (error) => console.error('[Redis sub]', error.message));
    await Promise.all([pubClient.connect(), subClient.connect()]);
    app.locals.redisClient = pubClient;
    io.redisClient = pubClient;
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[Socket] Redis adapter connected');
  } else {
    console.warn('[Socket] REDIS_URL is not set; realtime events are limited to one server instance.');
  }
  const jwt = require('jsonwebtoken');
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.data.userId = decoded.id;
      next();
    } catch {
      next(new Error('Invalid authentication token'));
    }
  });
  socketHandler(io);
};

// Global Error Handler Middleware (Ensure all errors return JSON, not HTML)
app.use((err, req, res, next) => {
  console.error('PodLive request failed:', err.message);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File size too large. Professional plans allow up to 1GB.' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }

  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 5005;
configureRealtime().then(() => {
  server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
}).catch((error) => {
  console.error('[Socket] Realtime startup failed:', error);
  process.exitCode = 1;
});
