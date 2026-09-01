import os
import json
import logging
import uuid
import hashlib
import hmac
import re
import datetime
import threading
from dotenv import load_dotenv
load_dotenv()

import cloudinary
from flask import Flask, jsonify, request, g
from collections import defaultdict, deque
import time
try:
    import redis
except ImportError:
    redis = None

if os.environ.get('SENTRY_DSN'):
    import sentry_sdk
    from sentry_sdk.integrations.flask import FlaskIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
    from observability import sanitize_sentry_event, sanitize_sentry_transaction
    sentry_sdk.init(
        dsn=os.environ['SENTRY_DSN'],
        integrations=[FlaskIntegration(), SqlalchemyIntegration()],
        environment=os.environ.get('APP_ENV', 'production'),
        release=os.environ.get('APP_RELEASE'),
        traces_sample_rate=float(os.environ.get('SENTRY_TRACES_SAMPLE_RATE', '0.05')),
        profiles_sample_rate=float(os.environ.get('SENTRY_PROFILES_SAMPLE_RATE', '0.0')),
        send_default_pii=False,
        before_send=sanitize_sentry_event,
        before_send_transaction=sanitize_sentry_transaction,
    )

# Extensions
from extensions import socketio, cors, ALLOWED_ORIGINS
from models import db, WorkerHeartbeat

# Utils
from utils import ensure_runtime_compat_schema, utc_now

# Blueprints
from routes.auth_bp import auth_bp
from routes.users_bp import users_bp
from routes.chats_bp import chats_bp
from routes.status_bp import status_bp
from routes.reels_bp import reels_bp
from routes.music_bp import music_bp
from routes.main_bp import main_bp
from routes.notifications_bp import notifications_bp
from routes.social_bp import social_bp
from routes.ai_bp import ai_bp
from routes.business_bp import business_bp
from routes.payments_bp import payments_bp
from routes.calls_bp import calls_bp
from routes.saskat_bp import saskat_bp
from routes.admin_bp import admin_bp

# Sockets
from sockets import register_socket_events

cloudinary.config(
    cloud_name=os.environ.get('CLOUDINARY_CLOUD_NAME'),
    api_key=os.environ.get('CLOUDINARY_API_KEY'),
    api_secret=os.environ.get('CLOUDINARY_API_SECRET')
)

try:
    from config import Config
except ImportError:
    from .config import Config

static_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
app = Flask(__name__, static_folder=static_folder)
app.config.from_object(Config)

logging.basicConfig(level=os.environ.get('LOG_LEVEL', 'INFO'))
runtime_logger = logging.getLogger('cheetchat.runtime')
_app_started_at = time.monotonic()

# Process-local abuse protection for the current single-worker deployment.
# Move this state to Redis before enabling multiple workers or instances.
_rate_windows = defaultdict(deque)
_rate_windows_lock = threading.Lock()
_redis_client = redis.Redis.from_url(
    os.environ['REDIS_URL'], decode_responses=True,
    socket_connect_timeout=2, socket_timeout=2, health_check_interval=30,
) if redis and os.environ.get('REDIS_URL') else None
app.extensions['cheetchat_redis'] = _redis_client
_sensitive_limits = {
    '/api/register': (5, 15 * 60),
    '/api/register/verify-otp': (10, 15 * 60),
    '/api/login': (20, 15 * 60),
    '/api/login/request-otp': (5, 15 * 60),
    '/api/login/verify-otp': (10, 15 * 60),
    '/api/forgot-password': (5, 60 * 60),
    '/api/reset-password': (10, 60 * 60),
    '/api/reset-password/key-backup': (10, 60 * 60),
    '/api/auth/2fa/login-verify': (10, 15 * 60),
    '/api/auth/google/exchange': (20, 15 * 60),
    '/api/auth/google/complete': (5, 15 * 60),
    '/api/admin/login': (5, 15 * 60),
    '/api/ai/grammar': (30, 60),
    '/api/ai/chat': (60, 60 * 60),
    '/api/ai/chat/stream': (60, 60 * 60),
    '/api/ai/image': (10, 60 * 60),
    '/api/ai/tts': (30, 60 * 60),
    '/api/translate': (120, 60 * 60),
    '/api/upload': (60, 60 * 60),
    '/api/payments/orders': (20, 15 * 60),
    '/api/chats/:id/scheduled-messages': (30, 15 * 60),
    '/api/status/:id/reply': (20, 15 * 60),
    '/api/messages/:id': (30, 15 * 60),
}
_token_scoped_rate_paths = {
    '/api/ai/chat', '/api/ai/chat/stream', '/api/ai/image', '/api/ai/tts',
    '/api/translate', '/api/upload', '/api/payments/orders',
    '/api/chats/:id/scheduled-messages',
    '/api/status/:id/reply', '/api/messages/:id',
}

def canonical_sensitive_path():
    if request.method == 'POST' and re.fullmatch(r'/api/chats/\d+/scheduled-messages', request.path):
        return '/api/chats/:id/scheduled-messages'
    if request.method == 'POST' and re.fullmatch(r'/api/status/\d+/reply', request.path):
        return '/api/status/:id/reply'
    if request.method == 'PUT' and re.fullmatch(r'/api/messages/\d+', request.path):
        return '/api/messages/:id'
    return request.path


# These endpoints establish or recover authentication and therefore cannot
# require a CSRF token from an existing session. In particular, a stale auth
# cookie must not prevent the user from logging in and replacing that cookie.
# The authenticated logout endpoint deliberately remains protected.
_csrf_exempt_auth_paths = {
    '/api/login',
    '/api/login/request-otp',
    '/api/login/verify-otp',
    '/api/register',
    '/api/register/verify-otp',
    '/api/forgot-password',
    '/api/reset-password',
    '/api/auth/2fa/login-verify',
    '/api/auth/google/exchange',
    '/api/auth/google/complete',
}

@app.before_request
def protect_sensitive_routes():
    g.request_id = request.headers.get('X-Request-ID') or uuid.uuid4().hex
    g.request_started_at = time.monotonic()
    # CORS preflight does not perform the sensitive action and must never depend
    # on Redis availability. The browser will only send the real request after
    # this automatic OPTIONS response succeeds.
    if request.method == 'OPTIONS':
        return None
    if request.method not in ('GET', 'HEAD', 'OPTIONS') and request.path not in _csrf_exempt_auth_paths:
        cookie_name = app.config.get('AUTH_COOKIE_NAME', 'cheetchat_session')
        cookie_token = request.cookies.get(cookie_name)
        bearer = request.headers.get('Authorization', '')
        bearer_token = bearer.split(' ', 1)[1].strip() if bearer.startswith('Bearer ') else ''
        uses_real_bearer = bool(bearer_token and bearer_token not in ('null', 'undefined', 'cookie-session'))
        if cookie_token and not uses_real_bearer:
            csrf_cookie = request.cookies.get('cheetchat_csrf')
            csrf_header = request.headers.get('X-CSRF-Token')
            if not csrf_cookie or not csrf_header or not hmac.compare_digest(csrf_cookie, csrf_header):
                return jsonify({'error': 'CSRF validation failed'}), 403
    rate_path = canonical_sensitive_path()
    rule = _sensitive_limits.get(rate_path)
    if not rule:
        return None
    limit, window_seconds = rule
    client_ip = request.headers.get('X-Forwarded-For', request.remote_addr or 'unknown').split(',')[0].strip()
    identity = client_ip
    if rate_path in _token_scoped_rate_paths:
        auth_header = request.headers.get('Authorization', '')
        bearer_token = auth_header.split(' ', 1)[1].strip() if auth_header.startswith('Bearer ') else ''
        if bearer_token and bearer_token not in ('null', 'undefined', 'cookie-session'):
            identity = hashlib.sha256(bearer_token.encode()).hexdigest()[:32]
        else:
            cookie_token = request.cookies.get(app.config.get('AUTH_COOKIE_NAME', 'cheetchat_session'))
            if cookie_token:
                identity = hashlib.sha256(cookie_token.encode()).hexdigest()[:32]
    key = (rate_path, identity)
    now = time.monotonic()
    if _redis_client is not None:
        redis_key = f"cheetchat:rate:{rate_path}:{identity}"
        try:
            count = _redis_client.eval(
                "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
                1, redis_key, window_seconds
            )
            if count > limit:
                retry_after = max(1, _redis_client.ttl(redis_key))
                response = jsonify({'error': 'Too many attempts. Please try again later.'})
                response.status_code = 429
                response.headers['Retry-After'] = str(retry_after)
                return response
            return None
        except Exception:
            runtime_logger.exception('Redis rate limiter unavailable')
            # This deployment intentionally runs one Gunicorn worker. Keep the
            # endpoint available with the locked process-local limiter when the
            # managed Redis service is briefly unavailable.
    with _rate_windows_lock:
        attempts = _rate_windows[key]
        while attempts and attempts[0] <= now - window_seconds:
            attempts.popleft()
        if len(attempts) >= limit:
            retry_after = max(1, int(window_seconds - (now - attempts[0])))
            response = jsonify({'error': 'Too many attempts. Please try again later.'})
            response.status_code = 429
            response.headers['Retry-After'] = str(retry_after)
            return response
        attempts.append(now)
    return None

@app.after_request
def add_runtime_headers(response):
    request_id = getattr(g, 'request_id', uuid.uuid4().hex)
    response.headers['X-Request-ID'] = request_id
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'camera=(self), microphone=(self), geolocation=(self)'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Cross-Origin-Opener-Policy'] = 'same-origin-allow-popups'
    if request.path.startswith(('/api/auth/', '/api/account', '/api/payments/')) or request.headers.get('Authorization'):
        response.headers['Cache-Control'] = 'no-store'
    if app.config.get('IS_PRODUCTION') and response.status_code >= 500 and not request.path.startswith('/health/'):
        response.set_data(json.dumps({
            'error': 'Service temporarily unavailable' if response.status_code == 503 else 'Internal server error',
            'requestId': request_id,
        }))
        response.content_type = 'application/json'
    if request.is_secure or app.config.get('IS_PRODUCTION'):
        response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    duration_ms = round((time.monotonic() - getattr(g, 'request_started_at', time.monotonic())) * 1000, 2)
    runtime_logger.info(json.dumps({
        'event': 'http_request', 'requestId': request_id, 'method': request.method,
        'path': request.path, 'status': response.status_code, 'durationMs': duration_ms,
    }))
    return response

@app.errorhandler(413)
def payload_too_large(_error):
    return jsonify({'error': 'Upload is larger than the allowed limit', 'requestId': getattr(g, 'request_id', None)}), 413

@app.errorhandler(500)
def internal_server_error(error):
    runtime_logger.exception('Unhandled request error', exc_info=error)
    return jsonify({'error': 'Internal server error', 'requestId': getattr(g, 'request_id', None)}), 500

# Initialize extensions
cors.init_app(app, resources={r"/*": {"origins": ALLOWED_ORIGINS}}, supports_credentials=True)
db.init_app(app)
socketio.init_app(
    app,
    # A Redis pub/sub manager is only needed when multiple web workers publish
    # socket events to each other. The production command intentionally uses one
    # worker; avoiding a broken external pub/sub connection keeps chat realtime.
    message_queue=(os.environ.get('REDIS_URL') or None)
        if int(os.environ.get('WEB_CONCURRENCY', '1')) > 1 else None,
    channel='cheetchat',
)

@app.get('/health/live')
def health_live():
    return jsonify({'status': 'ok', 'service': 'cheetchat-backend'})

@app.get('/health/ready')
def health_ready():
    from sqlalchemy import text
    try:
        db.session.execute(text('SELECT 1'))
    except Exception:
        db.session.rollback()
        return jsonify({'status': 'not_ready', 'database': 'unavailable', 'redis': 'unknown'}), 503

    if _redis_client is not None:
        try:
            _redis_client.ping()
        except Exception:
            return jsonify({'status': 'not_ready', 'database': 'ok', 'redis': 'unavailable'}), 503
    elif app.config.get('IS_PRODUCTION'):
        return jsonify({'status': 'not_ready', 'database': 'ok', 'redis': 'missing'}), 503
    return jsonify({'status': 'ready', 'database': 'ok', 'redis': 'ok' if _redis_client else 'disabled'})

@app.get('/health/operations')
def health_operations():
    try:
        heartbeat = db.session.get(WorkerHeartbeat, 'scheduled-delivery')
        if not heartbeat:
            if time.monotonic() - _app_started_at <= 180:
                return jsonify({'status': 'starting', 'worker': 'starting'}), 200
            return jsonify({'status': 'unhealthy', 'worker': 'missing'}), 503
        age_seconds = max(0, int((utc_now() - heartbeat.last_run_at).total_seconds()))
        if age_seconds > 180:
            return jsonify({'status': 'unhealthy', 'worker': 'stale', 'ageSeconds': age_seconds}), 503
        if heartbeat.status != 'ok':
            return jsonify({'status': 'degraded', 'worker': heartbeat.status, 'ageSeconds': age_seconds}), 503
        return jsonify({'status': 'ok', 'worker': 'ok', 'ageSeconds': age_seconds})
    except Exception:
        db.session.rollback()
        return jsonify({'status': 'unhealthy', 'worker': 'unavailable'}), 503



if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

if not os.path.exists(static_folder):
    os.makedirs(static_folder)

# Register Blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(users_bp)
app.register_blueprint(chats_bp)
app.register_blueprint(status_bp)
app.register_blueprint(reels_bp)
app.register_blueprint(music_bp)
app.register_blueprint(main_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(social_bp)
app.register_blueprint(ai_bp)
app.register_blueprint(business_bp)
app.register_blueprint(payments_bp)
app.register_blueprint(calls_bp)
app.register_blueprint(saskat_bp)
app.register_blueprint(admin_bp)

# Always repair the small set of columns required by the running release.
# This protects production when a hosting plan skips a pre-deploy hook.
with app.app_context():
    ensure_runtime_compat_schema()

# Never run the full historical migration inside a Gunicorn worker. Some older
# Render services still have AUTO_MIGRATE_SCHEMA=1 in their dashboard; honoring
# it here performs PostgreSQL index reflection before the port is bound and can
# kill every deploy on provider statement timeouts. backend/migrate.py remains
# the only entry point for the full versioned migration.

# Register Sockets
register_socket_events(socketio)

# Database schema update should be run manually or via a separate migration script
# to prevent blocking the Gunicorn worker on startup.

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('FLASK_DEBUG') == '1'
    socketio.run(app, host='0.0.0.0', port=port, debug=debug, allow_unsafe_werkzeug=True)
