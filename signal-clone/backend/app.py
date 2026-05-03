import os
import jwt
import datetime
import json
import urllib.parse
import urllib.request
from dotenv import load_dotenv
load_dotenv()
import cloudinary
import cloudinary.uploader
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
from sqlalchemy import inspect, text
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

cloudinary.config(
    cloud_name=os.environ.get('CLOUDINARY_CLOUD_NAME'),
    api_key=os.environ.get('CLOUDINARY_API_KEY'),
    api_secret=os.environ.get('CLOUDINARY_API_SECRET')
)

def upload_to_cloudinary(file, folder='chietchat', resource_type='auto'):
    if not all([
        os.environ.get('CLOUDINARY_CLOUD_NAME'),
        os.environ.get('CLOUDINARY_API_KEY'),
        os.environ.get('CLOUDINARY_API_SECRET')
    ]):
        raise RuntimeError("Cloudinary environment variables are not configured")

    result = cloudinary.uploader.upload(
        file,
        folder=folder,
        resource_type=resource_type
    )
    return result['secure_url']

try:
    from .config import Config
    from .models import db, User, Chat, ChatParticipant, Message, Status, StatusView, Block
except ImportError:
    from config import Config
    from models import db, User, Chat, ChatParticipant, Message, Status, StatusView, Block

static_folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
app = Flask(__name__, static_folder=static_folder)
app.config.from_object(Config)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")
db.init_app(app)

socket_users = {}
user_connection_counts = {}

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

if not os.path.exists(static_folder):
    os.makedirs(static_folder)


def add_missing_columns(table_name, columns):
    inspector = inspect(db.engine)
    if table_name not in inspector.get_table_names():
        return

    existing_columns = {column['name'] for column in inspector.get_columns(table_name)}
    preparer = db.engine.dialect.identifier_preparer
    quoted_table = preparer.quote(table_name)

    for column_name, column_type in columns.items():
        if column_name in existing_columns:
            continue

        quoted_column = preparer.quote(column_name)
        compiled_type = column_type.compile(dialect=db.engine.dialect)
        db.session.execute(text(f'ALTER TABLE {quoted_table} ADD COLUMN {quoted_column} {compiled_type}'))


def ensure_database_schema():
    db.create_all()
    add_missing_columns('user', {
        'public_key': db.Text(),
        'avatar': db.String(200),
        'last_seen': db.DateTime(),
        'created_at': db.DateTime(),
    })
    add_missing_columns('chat', {
        'is_group': db.Boolean(),
        'name': db.String(100),
        'group_admin_id': db.Integer(),
        'created_at': db.DateTime(),
    })
    add_missing_columns('message', {
        'ttl': db.Integer(),
        'reply_to_id': db.Integer(),
        'reply_content': db.Text(),
        'reply_sender_name': db.String(80),
    })
    add_missing_columns('status', {
        'music_url': db.String(500),
        'music_name': db.String(200),
        'duration': db.Integer(),
    })

    inspector = inspect(db.engine)
    if 'user' in inspector.get_table_names():
        user_columns = {column['name'] for column in inspector.get_columns('user')}
        if {'last_seen', 'created_at'}.issubset(user_columns):
            db.session.execute(text('UPDATE "user" SET last_seen = created_at WHERE last_seen IS NULL'))
    db.session.commit()


with app.app_context():
    ensure_database_schema()


@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return response


@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        res = Response()
        res.headers['Access-Control-Allow-Origin'] = '*'
        res.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        res.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        return res, 200


def get_json_data():
    return request.get_json(silent=True) or {}


def get_current_user_id():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None
    try:
        token = auth_header.split(' ', 1)[1]
        payload = jwt.decode(token, app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        return payload.get('user_id')
    except Exception:
        return None


def user_is_chat_participant(user_id, chat_id):
    return ChatParticipant.query.filter_by(user_id=user_id, chat_id=chat_id).first() is not None


def get_socket_user_id():
    return socket_users.get(request.sid)


def get_chat_participant_ids(chat_id):
    return [
        participant.user_id
        for participant in ChatParticipant.query.filter_by(chat_id=chat_id).all()
    ]


def decode_socket_user_id(auth):
    if not auth:
        return None
    token = auth.get('token')
    if not token:
        return None
    try:
        payload = jwt.decode(token, app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        return payload.get('user_id')
    except Exception:
        return None


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def iso_utc(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')


def is_user_online(user_id):
    return user_connection_counts.get(user_id, 0) > 0


def serialize_user(user):
    return {
        "id": user.id,
        "username": user.username,
        "phone": user.phone,
        "avatar": user.avatar,
        "publicKey": user.public_key,
        "lastSeen": iso_utc(user.last_seen),
        "isOnline": is_user_online(user.id)
    }


def emit_to_user_chat_contacts(user_id, event, payload):
    participations = ChatParticipant.query.filter_by(user_id=user_id).all()
    notified_user_ids = set()
    for participation in participations:
        participants = ChatParticipant.query.filter_by(chat_id=participation.chat_id).all()
        for participant in participants:
            notified_user_ids.add(participant.user_id)
    notified_user_ids.add(user_id)
    for participant_id in notified_user_ids:
        socketio.emit(event, payload, room=f"user_{participant_id}")


def search_itunes_tracks(query, limit=12):
    params = urllib.parse.urlencode({
        "term": query,
        "media": "music",
        "entity": "song",
        "limit": limit,
    })
    url = f"https://itunes.apple.com/search?{params}"
    request_obj = urllib.request.Request(url, headers={"User-Agent": "CHIETCHAT/1.0"})

    with urllib.request.urlopen(request_obj, timeout=6) as response:
        payload = json.loads(response.read().decode("utf-8"))

    tracks = []
    for item in payload.get("results", []):
        preview_url = item.get("previewUrl")
        if not preview_url:
            continue
        artwork = item.get("artworkUrl100")
        if artwork:
            artwork = artwork.replace("100x100bb", "300x300bb")
        tracks.append({
            "id": str(item.get("trackId") or preview_url),
            "title": item.get("trackName") or "Unknown song",
            "artist": item.get("artistName") or "Unknown artist",
            "album": item.get("collectionName") or "",
            "previewUrl": preview_url,
            "artwork": artwork,
            "source": "itunes",
            "durationMs": item.get("trackTimeMillis"),
        })
    return tracks


# --- Auth Routes ---
@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = get_json_data()
        username = (data.get('username') or '').strip()
        phone = (data.get('phone') or '').strip()
        password = data.get('password') or ''

        if not username or not phone or not password:
            return jsonify({"error": "Username, phone, and password are required"}), 400

        if User.query.filter_by(phone=phone).first():
            return jsonify({"error": "Phone number already registered"}), 400

        hashed_pw = generate_password_hash(password)
        new_user = User(username=username, phone=phone, password_hash=hashed_pw, public_key=data.get('publicKey'))
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"message": "User created"}), 201
    except Exception as e:
        print(f"Register Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = get_json_data()
        phone = (data.get('phone') or '').strip()
        password = data.get('password') or ''

        if not phone or not password:
            return jsonify({"error": "Phone and password are required"}), 400

        user = User.query.filter_by(phone=phone).first()
        if user and check_password_hash(user.password_hash, password):
            user.last_seen = utc_now()
            db.session.commit()
            token = jwt.encode({
                'user_id': user.id,
                'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)
            }, app.config['JWT_SECRET_KEY'], algorithm='HS256')
            return jsonify({"token": token, "user": serialize_user(user)}), 200
        return jsonify({"error": "Invalid credentials"}), 401
    except Exception as e:
        print(f"Login Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    try:
        data = get_json_data()
        phone = (data.get('phone') or '').strip()
        username = (data.get('username') or '').strip()
        new_password = data.get('newPassword') or ''

        if not phone or not username or not new_password:
            return jsonify({"error": "Phone, username, and new password are required"}), 400

        if len(new_password) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400

        user = User.query.filter_by(phone=phone).first()
        if not user or user.username.strip().lower() != username.lower():
            return jsonify({"error": "No account matched this phone and username"}), 404

        user.password_hash = generate_password_hash(new_password)
        user.last_seen = utc_now()
        db.session.commit()
        return jsonify({"message": "Password reset successfully. Please login with your new password."}), 200
    except Exception as e:
        print(f"Forgot Password Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/users', methods=['GET'])
def get_users():
    users = User.query.all()
    return jsonify([serialize_user(u) for u in users])


@app.route('/api/user/search', methods=['POST'])
def search_user():
    data = get_json_data()
    phone = (data.get('phone') or '').strip()
    if not phone:
        return jsonify({"error": "Phone number is required"}), 400
    user = User.query.filter_by(phone=phone).first()
    if user:
        return jsonify(serialize_user(user))
    return jsonify({"error": "User not registered with this number"}), 200


@app.route('/api/user/avatar', methods=['POST'])
def update_avatar():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    if 'avatar' not in request.files:
        return jsonify({"error": "No avatar selected"}), 400

    file = request.files['avatar']
    if file.filename == '':
        return jsonify({"error": "No avatar selected"}), 400

    filename = secure_filename(file.filename)
    extension = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if extension not in {'jpg', 'jpeg', 'png', 'gif', 'webp'}:
        return jsonify({"error": "Please upload an image file"}), 400

    try:
        url = upload_to_cloudinary(file, folder='chietchat/avatars', resource_type='image')
    except Exception as e:
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.avatar = url
    db.session.commit()

    payload = {"user": serialize_user(user)}
    emit_to_user_chat_contacts(user_id, 'user_profile_updated', payload)
    return jsonify(payload)


@app.route('/api/users/<int:user_id>/key', methods=['GET'])
def get_user_public_key(user_id):
    user = User.query.get(user_id)
    if user:
        return jsonify({"publicKey": user.public_key})
    return jsonify({"error": "User not found"}), 404


@app.route('/api/user/key', methods=['POST'])
def update_public_key():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = get_json_data()
    public_key = data.get('publicKey')
    if not public_key:
        return jsonify({"error": "Public key is required"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.public_key = public_key
    db.session.commit()
    return jsonify({"message": "Key updated"})


@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/api/user/avatar', methods=['DELETE'])
def delete_avatar():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    user.avatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
    db.session.commit()
    payload = {"user": serialize_user(user)}
    emit_to_user_chat_contacts(user_id, 'user_profile_updated', payload)
    return jsonify(payload)


@app.route('/api/user/block', methods=['POST'])
def block_user():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    data = get_json_data()
    blocked_id = data.get('userId')
    if not blocked_id:
        return jsonify({"error": "userId required"}), 400
    existing = Block.query.filter_by(blocker_id=user_id, blocked_id=blocked_id).first()
    if not existing:
        db.session.add(Block(blocker_id=user_id, blocked_id=blocked_id))
        db.session.commit()
    return jsonify({"ok": True})


@app.route('/api/user/unblock', methods=['POST'])
def unblock_user():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    data = get_json_data()
    blocked_id = data.get('userId')
    Block.query.filter_by(blocker_id=user_id, blocked_id=blocked_id).delete()
    db.session.commit()
    return jsonify({"ok": True})


@app.route('/api/user/blocked', methods=['GET'])
def get_blocked():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    blocked = Block.query.filter_by(blocker_id=user_id).all()
    return jsonify([b.blocked_id for b in blocked])


@app.route('/api/chats/<int:chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    if not user_is_chat_participant(user_id, chat_id):
        return jsonify({"error": "Forbidden"}), 403
    Message.query.filter_by(chat_id=chat_id).delete()
    ChatParticipant.query.filter_by(chat_id=chat_id).delete()
    Chat.query.filter_by(id=chat_id).delete()
    db.session.commit()
    return jsonify({"ok": True})


# --- Music Routes ---
@app.route('/api/music/search', methods=['GET'])
def search_music():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    query = (request.args.get('q') or '').strip()
    if len(query) < 2:
        return jsonify({"tracks": []})

    try:
        limit = min(max(int(request.args.get('limit', 12)), 1), 25)
    except ValueError:
        limit = 12

    try:
        return jsonify({"tracks": search_itunes_tracks(query, limit)})
    except Exception as e:
        print(f"Music Search Error: {e}")
        return jsonify({
            "tracks": [],
            "warning": "Song search is temporarily unavailable. You can still post your status."
        }), 200


# --- Status Routes ---
@app.route('/api/status', methods=['GET'])
def get_statuses():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    now = utc_now()

    # Get only users who share a chat with current user
    my_chat_ids = [p.chat_id for p in ChatParticipant.query.filter_by(user_id=user_id).all()]
    contact_user_ids = set()
    for chat_id in my_chat_ids:
        chat = Chat.query.get(chat_id)
        if chat and not chat.is_group:
            for p in ChatParticipant.query.filter_by(chat_id=chat_id).all():
                contact_user_ids.add(p.user_id)
    contact_user_ids.add(user_id)  # apna khud ka status bhi dikhega

    statuses = Status.query.filter(
        Status.expires_at > now,
        Status.user_id.in_(contact_user_ids)
    ).order_by(Status.created_at.desc()).all()

    users_map = {}
    for s in statuses:
        uid = s.user_id
        if uid not in users_map:
            users_map[uid] = {
                "user": serialize_user(s.user),
                "statuses": []
            }
        viewed = StatusView.query.filter_by(status_id=s.id, viewer_id=user_id).first() is not None
        users_map[uid]["statuses"].append({
            "id": s.id,
            "mediaUrl": s.media_url,
            "mediaType": s.media_type,
            "caption": s.caption,
            "musicUrl": s.music_url,
            "musicName": s.music_name,
            "duration": s.duration,
            "createdAt": iso_utc(s.created_at),
            "expiresAt": iso_utc(s.expires_at),
            "viewed": viewed,
            "viewCount": len(s.views)
        })
    return jsonify(list(users_map.values()))


@app.route('/api/status', methods=['POST'])
def create_status():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    if 'media' not in request.files:
        return jsonify({"error": "No media file"}), 400

    file = request.files['media']
    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    filename = secure_filename(file.filename)
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''

    image_exts = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
    video_exts = {'mp4', 'webm', 'mov'}

    if ext in image_exts:
        media_type = 'image'
        resource_type = 'image'
    elif ext in video_exts:
        media_type = 'video'
        resource_type = 'video'
    else:
        return jsonify({"error": "Only images and videos allowed"}), 400

    try:
        media_url = upload_to_cloudinary(file, folder='chietchat/status', resource_type=resource_type)
    except Exception as e:
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

    caption = request.form.get('caption', '')
    music_url = request.form.get('musicUrl', None)
    music_name = request.form.get('musicName', None)
    try:
        duration = min(max(int(request.form.get('duration', 15)), 1), 15)
    except (TypeError, ValueError):
        duration = 15
    expires_at = utc_now() + datetime.timedelta(hours=24)

    status = Status(
        user_id=user_id,
        media_url=media_url,
        media_type=media_type,
        caption=caption,
        music_url=music_url,
        music_name=music_name,
        duration=duration,
        expires_at=expires_at
    )
    db.session.add(status)
    db.session.commit()

    socketio.emit('new_status', {"userId": user_id}, room=f"user_{user_id}")
    return jsonify({"message": "Status posted", "id": status.id}), 201


@app.route('/api/status/<int:status_id>/view', methods=['POST'])
def view_status(status_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    existing = StatusView.query.filter_by(status_id=status_id, viewer_id=user_id).first()
    if not existing:
        db.session.add(StatusView(status_id=status_id, viewer_id=user_id))
        db.session.commit()
    return jsonify({"ok": True})


@app.route('/api/status/<int:status_id>', methods=['DELETE'])
def delete_status(status_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    status = Status.query.get(status_id)
    if not status or status.user_id != user_id:
        return jsonify({"error": "Not found"}), 404

    db.session.delete(status)
    db.session.commit()
    return jsonify({"message": "Deleted"})


# --- Chat Routes ---
@app.route('/api/chats', methods=['GET'])
def get_chats():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        participations = ChatParticipant.query.filter_by(user_id=user_id).all()
        chat_ids = [p.chat_id for p in participations]
        chats = Chat.query.filter(Chat.id.in_(chat_ids)).all()

        result = []
        for chat in chats:
            participants = ChatParticipant.query.filter_by(chat_id=chat.id).all()
            part_data = [serialize_user(p.user) for p in participants]

            last_msg = Message.query.filter_by(chat_id=chat.id).order_by(Message.timestamp.desc()).first()

            chat_name = chat.name
            chat_avatar = None
            if not chat.is_group and len(part_data) == 2:
                other_user = next((p for p in part_data if p['id'] != user_id), None)
                if other_user:
                    chat_name = other_user['username']
                    chat_avatar = other_user['avatar']

            result.append({
                "id": chat.id,
                "isGroup": chat.is_group,
                "name": chat_name,
                "avatar": chat_avatar,
                "participants": part_data,
                "lastMessage": {
                    "content": last_msg.content if last_msg and last_msg.type == 'text' else (last_msg.type if last_msg else "No messages"),
                    "timestamp": iso_utc(last_msg.timestamp) if last_msg else None,
                    "type": last_msg.type if last_msg else "text"
                }
            })
        return jsonify(result)
    except Exception as e:
        print(e)
        return jsonify({"error": "Invalid token"}), 401


@app.route('/api/chats/create', methods=['POST'])
def create_chat():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = get_json_data()
    participant_ids = data.get('participants') or []
    is_group = data.get('isGroup', False)
    name = data.get('name', None)

    if not isinstance(participant_ids, list):
        return jsonify({"error": "Participants must be a list"}), 400

    try:
        participant_ids = list(dict.fromkeys(int(uid) for uid in participant_ids))
    except (TypeError, ValueError):
        return jsonify({"error": "Participant IDs must be valid numbers"}), 400

    if user_id not in participant_ids:
        return jsonify({"error": "Current user must be a participant"}), 400

    if len(participant_ids) < 2:
        return jsonify({"error": "At least two participants are required"}), 400

    users_found = User.query.filter(User.id.in_(participant_ids)).count()
    if users_found != len(participant_ids):
        return jsonify({"error": "One or more participants do not exist"}), 404

    if not is_group and len(participant_ids) == 2:
        first_user_chats = ChatParticipant.query.filter_by(user_id=participant_ids[0]).all()
        for participation in first_user_chats:
            chat = Chat.query.get(participation.chat_id)
            if not chat or chat.is_group:
                continue
            existing_ids = {p.user_id for p in ChatParticipant.query.filter_by(chat_id=chat.id).all()}
            if existing_ids == set(participant_ids):
                return jsonify({"id": chat.id, "existing": True}), 200

    new_chat = Chat(is_group=is_group, name=name)
    db.session.add(new_chat)
    db.session.commit()

    for uid in participant_ids:
        db.session.add(ChatParticipant(chat_id=new_chat.id, user_id=uid))
    db.session.commit()

    return jsonify({"id": new_chat.id}), 201


@app.route('/api/chats/<int:chat_id>/messages', methods=['GET'])
def get_messages(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    if not user_is_chat_participant(user_id, chat_id):
        return jsonify({"error": "Forbidden"}), 403

    messages = Message.query.filter_by(chat_id=chat_id).order_by(Message.timestamp.asc()).all()
    return jsonify([{
        "id": m.id,
        "senderId": m.sender_id,
        "content": m.content,
        "type": m.type,
        "timestamp": iso_utc(m.timestamp),
        "ttl": m.ttl,
        "replyToId": m.reply_to_id,
        "replyContent": m.reply_content,
        "replySenderName": m.reply_sender_name
    } for m in messages])


@app.route('/api/messages/<int:message_id>', methods=['DELETE'])
def delete_message(message_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    message = Message.query.get(message_id)
    if not message:
        return jsonify({"error": "Message not found"}), 404

    if message.sender_id != user_id:
        return jsonify({"error": "Forbidden"}), 403

    db.session.delete(message)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200


@app.route('/api/upload', methods=['POST'])
def upload_file():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    if 'file' not in request.files:
        return jsonify({"error": "No file"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selection"}), 400

    try:
        url = upload_to_cloudinary(file, folder='chietchat/uploads', resource_type='auto')
        return jsonify({"url": url})
    except Exception as e:
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500


# --- Socket Events ---
@socketio.on('connect')
def on_connect(auth):
    user_id = decode_socket_user_id(auth)
    if user_id:
        user_id = int(user_id)
        socket_users[request.sid] = user_id
        user_connection_counts[user_id] = user_connection_counts.get(user_id, 0) + 1

        user = User.query.get(user_id)
        if user:
            user.last_seen = utc_now()
            db.session.commit()

        join_room(f"user_{user_id}")
        emit_to_user_chat_contacts(user_id, 'presence_update', {
            "userId": user_id,
            "isOnline": True,
            "lastSeen": iso_utc(user.last_seen) if user else None
        })


@socketio.on('disconnect')
def on_disconnect():
    user_id = socket_users.pop(request.sid, None)
    if not user_id:
        return

    user_connection_counts[user_id] = max(user_connection_counts.get(user_id, 1) - 1, 0)
    if user_connection_counts[user_id] == 0:
        user_connection_counts.pop(user_id, None)
        user = User.query.get(user_id)
        if user:
            user.last_seen = utc_now()
            db.session.commit()
            emit_to_user_chat_contacts(user_id, 'presence_update', {
                "userId": user_id,
                "isOnline": False,
                "lastSeen": iso_utc(user.last_seen)
            })


@socketio.on('join_room')
def on_join(data):
    user_id = get_socket_user_id()
    if not user_id:
        emit('room_error', {"error": "Unauthorized"})
        return

    room = str(data.get('room', ''))
    if room == 'global':
        join_room('global')
        return

    try:
        chat_id = int(room)
    except (TypeError, ValueError):
        emit('room_error', {"error": "Invalid room"})
        return

    if not user_is_chat_participant(user_id, chat_id):
        emit('room_error', {"error": "Forbidden"})
        return

    join_room(room)


@socketio.on('send_message')
def on_message(data):
    socket_user_id = get_socket_user_id()
    if not socket_user_id:
        emit('message_error', {"error": "Unauthorized"})
        return

    chat_id = data.get('chatId')
    content = data.get('content')

    if not chat_id or content is None:
        emit('message_error', {"error": "Invalid message data"})
        return

    try:
        chat_id = int(chat_id)
    except (TypeError, ValueError):
        emit('message_error', {"error": "Invalid message data"})
        return

    if not user_is_chat_participant(socket_user_id, chat_id):
        emit('message_error', {"error": "Sender is not a chat participant"})
        return

    new_msg = Message(
        chat_id=chat_id,
        sender_id=socket_user_id,
        content=content,
        type=data.get('type', 'text'),
        ttl=data.get('ttl', 0),
        reply_to_id=data.get('replyToId'),
        reply_content=data.get('replyContent'),
        reply_sender_name=data.get('replySenderName')
    )
    db.session.add(new_msg)
    db.session.commit()

    payload = {
        "id": new_msg.id,
        "senderId": new_msg.sender_id,
        "content": new_msg.content,
        "type": new_msg.type,
        "timestamp": iso_utc(new_msg.timestamp),
        "chatId": chat_id,
        "replyToId": new_msg.reply_to_id,
        "replyContent": new_msg.reply_content,
        "replySenderName": new_msg.reply_sender_name
    }

    participants = ChatParticipant.query.filter_by(chat_id=chat_id).all()
    for participant in participants:
        emit('receive_message', payload, room=f"user_{participant.user_id}")


@socketio.on('join_call')
def on_join_call(data):
    user_id = get_socket_user_id()
    try:
        chat_id = int(data['chatId'])
    except (KeyError, TypeError, ValueError):
        emit('call_error', {"error": "Invalid call data"})
        return

    if not user_id or not user_is_chat_participant(user_id, chat_id):
        emit('call_error', {"error": "Forbidden"})
        return

    room = f"call_{chat_id}"
    join_room(room)
    emit('user_joined_call', {"userId": user_id, "socketId": request.sid}, room=room, include_self=False)


@socketio.on('leave_call')
def on_leave_call(data):
    user_id = get_socket_user_id()
    try:
        chat_id = int(data['chatId'])
    except (KeyError, TypeError, ValueError):
        return

    if not user_id or not user_is_chat_participant(user_id, chat_id):
        return

    room = f"call_{chat_id}"
    leave_room(room)
    emit('user_left_call', {"userId": user_id, "socketId": request.sid}, room=room, include_self=False)
    emit('call_ended', {"userId": user_id}, room=room, include_self=False)


@socketio.on('offer')
def on_offer(data):
    if not get_socket_user_id():
        emit('call_error', {"error": "Unauthorized"})
        return
    if not data.get('to'):
        emit('call_error', {"error": "Invalid call data"})
        return
    emit('offer', data, room=data['to'])


@socketio.on('answer')
def on_answer(data):
    if not get_socket_user_id():
        emit('call_error', {"error": "Unauthorized"})
        return
    if not data.get('to'):
        emit('call_error', {"error": "Invalid call data"})
        return
    emit('answer', data, room=data['to'])


@socketio.on('ice_candidate')
def on_ice_candidate(data):
    if not get_socket_user_id():
        emit('call_error', {"error": "Unauthorized"})
        return
    if not data.get('to'):
        emit('call_error', {"error": "Invalid call data"})
        return
    emit('ice_candidate', data, room=data['to'])


@socketio.on('notify_ring')
def on_notify_ring(data):
    caller_id = get_socket_user_id()
    try:
        chat_id = int(data['chatId'])
    except (KeyError, TypeError, ValueError):
        emit('call_error', {"error": "Invalid call data"})
        return

    if not caller_id or not user_is_chat_participant(caller_id, chat_id):
        emit('call_error', {"error": "Forbidden"})
        return

    caller = User.query.get(caller_id)
    participant_ids = get_chat_participant_ids(chat_id)
    for uid in participant_ids:
        if uid != caller_id:
            emit('incoming_call', {
                "chatId": chat_id,
                "callerName": caller.username if caller else data.get('callerName', 'Unknown'),
                "callerId": caller_id,
                "callType": data.get('callType', 'video')
            }, room=f"user_{uid}")


# --- Serve React App ---
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(static_folder, path)):
        return send_from_directory(static_folder, path)
    elif os.path.exists(os.path.join(static_folder, 'index.html')):
        return send_from_directory(static_folder, 'index.html')
    else:
        return "Signal Clone Backend Running.", 200


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('FLASK_DEBUG') == '1'
    socketio.run(app, host='0.0.0.0', port=port, debug=debug)
