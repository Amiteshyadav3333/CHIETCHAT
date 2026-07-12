import os
from datetime import timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

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
    _is_postgres = bool(database_url)
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 300,          # recycle every 5 minutes
        "pool_size": 5,
        "max_overflow": 10,
        "pool_timeout": 30,
        **(
            {
                "connect_args": {
                    "connect_timeout": 10,
                    "keepalives": 1,
                    "keepalives_idle": 30,
                    "keepalives_interval": 5,
                    "keepalives_count": 5,
                    "gssencmode": "disable",   # prevent Kerberos GSS hang
                    "sslmode": "require",       # Supabase requires SSL
                }
            } if _is_postgres else {}
        ),
    }
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'jwt-secret-key-change-this'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)
    SUPABASE_URL = (os.environ.get('SUPABASE_URL') or '').rstrip('/')
    SUPABASE_ANON_KEY = os.environ.get('SUPABASE_ANON_KEY') or ''
    FRONTEND_URL = (os.environ.get('FRONTEND_URL') or 'http://127.0.0.1:3000').rstrip('/')
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    MAX_UPLOAD_BYTES = int(os.environ.get('MAX_UPLOAD_BYTES', 100 * 1024 * 1024))
    MAX_CONTENT_LENGTH = MAX_UPLOAD_BYTES
