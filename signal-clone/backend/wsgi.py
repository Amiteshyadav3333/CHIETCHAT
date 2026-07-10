import os
os.environ['EVENTLET_NO_GREENDNS'] = 'yes'

import eventlet
eventlet.monkey_patch()

try:
    import psycogreen.eventlet
    psycogreen.eventlet.patch_psycopg()
except ImportError:
    pass

try:
    from .app import app, socketio
except ImportError:
    from app import app, socketio

application = app
__all__ = ['app', 'application']

