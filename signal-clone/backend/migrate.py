"""Run the idempotent, version-recorded CHEETCHAT database migration."""

try:
    from .app import app
    from .utils import ensure_database_schema, ensure_runtime_compat_schema
except ImportError:
    from app import app
    from utils import ensure_database_schema, ensure_runtime_compat_schema


if __name__ == '__main__':
    with app.app_context():
        ensure_runtime_compat_schema()
        try:
            ensure_database_schema(force=True)
            print('Database schema is current')
        except RuntimeError as error:
            # The web release can safely start after the compatibility schema is
            # present. A legacy cleanup/index migration must not hold auth down.
            print(f'Compatibility schema applied; deferred legacy migration: {error}')
