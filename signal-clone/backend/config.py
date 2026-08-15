import os
from datetime import timedelta
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def public_url_from_env(name, default):
    """Normalize values pasted into hosting dashboards without weakening URL checks."""
    value = (os.environ.get(name) or default).strip()
    assignment_prefix = f'{name}='
    if value.startswith(assignment_prefix):
        value = value[len(assignment_prefix):].strip()
    value = value.strip('"\'').strip().rstrip('/')
    return value

def normalized_env_value(name):
    value = (os.environ.get(name) or '').strip()
    assignment_prefix = f'{name}='
    if value.startswith(assignment_prefix):
        value = value[len(assignment_prefix):].strip()
    return value.strip('"\'').strip()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'super-secret-signal-key-change-this'
    # Production DB (PostgreSQL) or Local DB (SQLite)
    # Render provides 'postgres://' but SQLAlchemy needs 'postgresql://'
    database_url = os.environ.get('DATABASE_URL')
    if database_url and database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    SQLALCHEMY_DATABASE_URI = database_url or 'sqlite:///db.sqlite'
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # ── Fix: Supabase/PostgreSQL "server closed the connection unexpectedly" ──
    # pool_pre_ping → test connection before using it (detects stale connections)
    # pool_recycle  → recycle connections every 5 min (before Supabase kills them)
    # pool_size     → max persistent connections
    # max_overflow  → extra connections allowed under load
    # connect_args  → TCP keepalive so idle connections stay alive
    _is_postgres = bool(database_url and database_url.startswith('postgresql://'))
    SQLALCHEMY_ENGINE_OPTIONS = ({
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_size": 5,
        "max_overflow": 10,
        "pool_timeout": 30,
        "connect_args": {
            "connect_timeout": 10,
            "keepalives": 1,
            "keepalives_idle": 30,
            "keepalives_interval": 5,
            "keepalives_count": 5,
            "gssencmode": "disable",
            "sslmode": "require",
        },
    } if _is_postgres else {})
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'jwt-secret-key-change-this'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)
    SUPABASE_URL = (os.environ.get('SUPABASE_URL') or '').rstrip('/')
    SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY') or ''
    FRONTEND_URL = public_url_from_env('FRONTEND_URL', 'https://chat.indiasearch.site' if os.environ.get('RENDER') == 'true' else 'http://127.0.0.1:3000')
    BACKEND_URL = public_url_from_env('BACKEND_URL', 'https://chietchat-backend.onrender.com' if os.environ.get('RENDER') == 'true' else 'http://127.0.0.1:5000')
    PODLIVE_URL = public_url_from_env('PODLIVE_URL', 'https://podlive-sigma.vercel.app')
    PODLIVE_API_URL = public_url_from_env('PODLIVE_API_URL', 'https://podlive-api-18as.onrender.com')
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    MAX_UPLOAD_BYTES = int(os.environ.get('MAX_UPLOAD_BYTES', 100 * 1024 * 1024))
    MAX_CONTENT_LENGTH = MAX_UPLOAD_BYTES
    DATA_RETENTION_PEPPER = os.environ.get('DATA_RETENTION_PEPPER') or ''
    PAYMENT_RETENTION_DAYS = int(os.environ.get('PAYMENT_RETENTION_DAYS', '2555'))
    CALL_RECORD_RETENTION_DAYS = int(os.environ.get('CALL_RECORD_RETENTION_DAYS', '90'))
    AI_MEMORY_RETENTION_DAYS = int(os.environ.get('AI_MEMORY_RETENTION_DAYS', '30'))
    AI_MEMORY_MAX_ROWS = int(os.environ.get('AI_MEMORY_MAX_ROWS', '100'))
    AUTH_COOKIE_NAME = os.environ.get('AUTH_COOKIE_NAME', 'cheetchat_session')
    VAPID_SUBJECT = normalized_env_value('VAPID_SUBJECT')
    if VAPID_SUBJECT and '@' in VAPID_SUBJECT and ':' not in VAPID_SUBJECT:
        VAPID_SUBJECT = f'mailto:{VAPID_SUBJECT}'
    if VAPID_SUBJECT:
        # Push delivery helpers read this variable directly, so keep one canonical value.
        os.environ['VAPID_SUBJECT'] = VAPID_SUBJECT

    # Never allow deployment with development signing keys or without the OTP
    # provider. Render exposes RENDER=true automatically; APP_ENV covers other hosts.
    _is_production = os.environ.get('RENDER') == 'true' or os.environ.get('APP_ENV') == 'production'
    IS_PRODUCTION = _is_production
    AUTH_COOKIE_SECURE = _is_production
    AUTH_COOKIE_SAMESITE = 'None' if _is_production else 'Lax'
    if _is_production:
        if SECRET_KEY == 'super-secret-signal-key-change-this' or len(SECRET_KEY) < 32:
            raise RuntimeError('SECRET_KEY must contain at least 32 characters in production')
        if JWT_SECRET_KEY == 'jwt-secret-key-change-this' or len(JWT_SECRET_KEY) < 32:
            raise RuntimeError('JWT_SECRET_KEY must contain at least 32 characters in production')
        if not SUPABASE_URL or not SUPABASE_ANON_KEY:
            raise RuntimeError('SUPABASE_URL and SUPABASE_ANON_KEY must be configured in production')
        if not SUPABASE_URL.startswith('https://'):
            raise RuntimeError('SUPABASE_URL must be an HTTPS URL in production')
        if not _is_postgres:
            raise RuntimeError('DATABASE_URL must use PostgreSQL in production')
        if not os.environ.get('REDIS_URL'):
            raise RuntimeError('REDIS_URL must be configured in production for distributed abuse protection')
        for _url_name, _public_url in (('FRONTEND_URL', FRONTEND_URL), ('BACKEND_URL', BACKEND_URL)):
            _parsed_url = urlparse(_public_url)
            if _parsed_url.scheme != 'https' or not _parsed_url.netloc:
                raise RuntimeError(f'{_url_name} must be an HTTPS URL in production')
        _cloudinary_keys = (
            'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
        )
        if any(not os.environ.get(key) for key in _cloudinary_keys):
            raise RuntimeError('Cloudinary credentials must be configured in production')
        _vapid_keys = ('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT')
        if any(not os.environ.get(key) for key in _vapid_keys):
            raise RuntimeError('VAPID push credentials must be configured in production')
        if not VAPID_SUBJECT.startswith('mailto:') or '@' not in VAPID_SUBJECT[7:]:
            raise RuntimeError('VAPID_SUBJECT must use a mailto: contact in production')
        _turn_urls = [
            value.strip() for value in os.environ.get('TURN_URLS', '').split(',') if value.strip()
        ]
        if not _turn_urls or any(not value.startswith(('turn:', 'turns:')) for value in _turn_urls):
            raise RuntimeError('TURN_URLS must contain valid turn: or turns: URLs in production')
        _turn_username = os.environ.get('TURN_USERNAME', '').strip()
        _turn_credential = os.environ.get('TURN_CREDENTIAL', '').strip()
        _has_static_turn = bool(_turn_username and _turn_credential)
        if bool(_turn_username) != bool(_turn_credential):
            raise RuntimeError('TURN_USERNAME and TURN_CREDENTIAL must be configured together')
        if not _has_static_turn and len(os.environ.get('TURN_SECRET', '')) < 32:
            raise RuntimeError(
                'Configure either TURN_USERNAME with TURN_CREDENTIAL or a 32-character TURN_SECRET'
            )
        if len(DATA_RETENTION_PEPPER) < 32:
            raise RuntimeError('DATA_RETENTION_PEPPER must contain at least 32 characters in production')
        if PAYMENT_RETENTION_DAYS < 365 or PAYMENT_RETENTION_DAYS > 3650:
            raise RuntimeError('PAYMENT_RETENTION_DAYS must be between 365 and 3650')
        if CALL_RECORD_RETENTION_DAYS < 30 or CALL_RECORD_RETENTION_DAYS > 730:
            raise RuntimeError('CALL_RECORD_RETENTION_DAYS must be between 30 and 730')
        if AI_MEMORY_RETENTION_DAYS < 1 or AI_MEMORY_RETENTION_DAYS > 365:
            raise RuntimeError('AI_MEMORY_RETENTION_DAYS must be between 1 and 365')
        if AI_MEMORY_MAX_ROWS < 20 or AI_MEMORY_MAX_ROWS > 1000:
            raise RuntimeError('AI_MEMORY_MAX_ROWS must be between 20 and 1000')
