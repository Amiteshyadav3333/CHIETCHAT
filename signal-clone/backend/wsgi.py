import os
os.environ['EVENTLET_NO_GREENDNS'] = 'yes'

import eventlet
eventlet.monkey_patch()

try:
    from .app import app, socketio
except ImportError:
    from app import app, socketio

application = app
__all__ = ['app', 'application']

