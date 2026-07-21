from flask_socketio import SocketIO
from flask_cors import CORS

# Allowed origins for CORS to support credentials
ALLOWED_ORIGINS = [
    "https://chat.indiasearch.site",
    "http://localhost:5173",
    "http://localhost:3000",
    "https://chietchat-backend.onrender.com"
]

# Initialize extensions without binding to app
socketio = SocketIO(cors_allowed_origins="*")
cors = CORS(resources={r"/*": {"origins": ALLOWED_ORIGINS}}, supports_credentials=True)

# Global states
socket_users = {}
user_connection_counts = {}
