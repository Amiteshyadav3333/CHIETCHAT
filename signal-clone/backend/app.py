import os as _os
# Fix: Disable eventlet's buggy DNS resolver (greendns) which causes
# [Errno 2] Lookup timed out and IPv6 hangs in production.
_os.environ['EVENTLET_NO_GREENDNS'] = 'yes'

import eventlet
eventlet.monkey_patch()

import os
from dotenv import load_dotenv
load_dotenv()

import cloudinary
from flask import Flask

# Extensions
from extensions import socketio, cors
from models import db

# Utils
from utils import ensure_database_schema

# Blueprints
from routes.auth_bp import auth_bp
from routes.users_bp import users_bp
from routes.chats_bp import chats_bp
from routes.status_bp import status_bp
from routes.reels_bp import reels_bp
from routes.music_bp import music_bp
from routes.main_bp import main_bp
from routes.notifications_bp import notifications_bp
from routes.social_bp import social_bp
from routes.ai_bp import ai_bp

# Sockets
from sockets import register_socket_events

cloudinary.config(
    cloud_name=os.environ.get('CLOUDINARY_CLOUD_NAME'),
    api_key=os.environ.get('CLOUDINARY_API_KEY'),
    api_secret=os.environ.get('CLOUDINARY_API_SECRET')
)

try:
    from config import Config
except ImportError:
    from .config import Config

static_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
app = Flask(__name__, static_folder=static_folder)
app.config.from_object(Config)

# Initialize extensions
cors.init_app(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
db.init_app(app)
socketio.init_app(app)



if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

if not os.path.exists(static_folder):
    os.makedirs(static_folder)

# Register Blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(users_bp)
app.register_blueprint(chats_bp)
app.register_blueprint(status_bp)
app.register_blueprint(reels_bp)
app.register_blueprint(music_bp)
app.register_blueprint(main_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(social_bp)
app.register_blueprint(ai_bp)

# Register Sockets
register_socket_events(socketio)

# Database schema update — run in background so server starts immediately
# even if Supabase is slow or temporarily unreachable
import threading

def _run_schema_in_background():
    try:
        with app.app_context():
            ensure_database_schema()
            print("✅ Database schema check complete.")
    except Exception as e:
        print(f"⚠️  Schema update failed (non-fatal): {e}")

_schema_thread = threading.Thread(target=_run_schema_in_background, daemon=True)
_schema_thread.start()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('FLASK_DEBUG') == '1'
    socketio.run(app, host='0.0.0.0', port=port, debug=debug)
