try:
    from .app import app, socketio
except ImportError:
    from app import app, socketio

application = app
__all__ = ['app', 'application']

