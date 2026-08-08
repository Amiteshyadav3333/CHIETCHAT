import os
import threading
from flask_socketio import SocketIO
from flask_cors import CORS

# Allowed origins for CORS to support credentials
ALLOWED_ORIGINS = list(dict.fromkeys([
    os.environ.get('FRONTEND_URL', 'https://chat.indiasearch.site').rstrip('/'),
    "http://localhost:5173",
    "http://localhost:3000",
]))

# Initialize extensions without binding to app
# The supported threaded runtime uses simple-websocket for WebSocket upgrades.
# Keeping this explicit prevents an optional green-thread package from silently
# changing concurrency behavior between local, test and production installs.
socketio = SocketIO(cors_allowed_origins=ALLOWED_ORIGINS, async_mode='threading')
cors = CORS(resources={r"/*": {"origins": ALLOWED_ORIGINS}}, supports_credentials=True)

# Global states
socket_users = {}
user_connection_counts = {}
socket_presence_lock = threading.RLock()
