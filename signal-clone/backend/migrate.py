"""Run the idempotent, version-recorded CHEETCHAT database migration."""

try:
    from .app import app
    from .utils import ensure_database_schema
except ImportError:
    from app import app
    from utils import ensure_database_schema


if __name__ == '__main__':
    with app.app_context():
        ensure_database_schema(force=True)
        print('Database schema is current')
