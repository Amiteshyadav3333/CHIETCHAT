from flask_socketio import SocketIO
from flask_cors import CORS

# Initialize extensions without binding to app
socketio = SocketIO(cors_allowed_origins="*")
cors = CORS(resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# Global states
socket_users = {}
user_connection_counts = {}
