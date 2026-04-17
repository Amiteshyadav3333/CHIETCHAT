try:
    from .app import app, socketio
except ImportError:
    from app import app, socketio

application = app

