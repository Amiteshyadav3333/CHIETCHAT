import os
import jwt
import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
from sqlalchemy import inspect, text
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename

try:
    from .config import Config
    from .models import db, User, Chat, ChatParticipant, Message
except ImportError:
    from config import Config
    from models import db, User, Chat, ChatParticipant, Message

app = Flask(__name__, static_folder='static')
app.config.from_object(Config)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")
db.init_app(app)
socket_users = {}
user_connection_counts = {}

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])

with app.app_context():
    db.create_all()
    inspector = inspect(db.engine)
    if 'user' in inspector.get_table_names():
        user_columns = [column['name'] for column in inspector.get_columns('user')]
        if 'last_seen' not in user_columns:
            db.session.execute(text('ALTER TABLE "user" ADD COLUMN last_seen TIMESTAMP'))
            db.session.execute(text('UPDATE "user" SET last_seen = created_at WHERE last_seen IS NULL'))
            db.session.commit()


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
    return datetime.datetime.utcnow()


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


# --- Auth Routes (Phone Based) ---
# --- Debug Route (For fixing DB schema) ---
@app.route('/api/debug/reset_db', methods=['GET'])
def reset_db():
    try:
        with app.app_context():
            db.drop_all()
            db.create_all()
        return jsonify({"message": "Database reset successfully. Schema updated."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = get_json_data()
        username = (data.get('username') or '').strip()
        phone = (data.get('phone') or '').strip()
        password = data.get('password') or ''

        if not username or not phone or not password:
            return jsonify({"error": "Username, phone, and password are required"}), 400

        # Validate phone
        if User.query.filter_by(phone=phone).first():
            return jsonify({"error": "Phone number already registered"}), 400
        
        hashed_pw = generate_password_hash(password)
        new_user = User(
            username=username, 
            phone=phone,
            password_hash=hashed_pw, 
            public_key=data.get('publicKey')
        )
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

        # Login with phone
        user = User.query.filter_by(phone=phone).first()
        if user and check_password_hash(user.password_hash, password):
            user.last_seen = utc_now()
            db.session.commit()

            token = jwt.encode({
                'user_id': user.id,
                'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
            }, app.config['JWT_SECRET_KEY'], algorithm='HS256')
            return jsonify({
                "token": token, 
                "user": serialize_user(user)
            }), 200
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
    if not filename:
        return jsonify({"error": "Invalid filename"}), 400

    extension = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if extension not in {'jpg', 'jpeg', 'png', 'gif', 'webp'}:
        return jsonify({"error": "Please upload an image file"}), 400

    unique_filename = f"avatar_{user_id}_{int(utc_now().timestamp())}_{filename}"
    file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_filename))

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.avatar = f"/uploads/{unique_filename}"
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

# --- Static Files ---
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

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
            part_data = []
            for p in participants:
                part_data.append(serialize_user(p.user))
            
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
    
    # Check if 1:1 chat already exists
    if not is_group and len(participant_ids) == 2:
        first_user_chats = ChatParticipant.query.filter_by(user_id=participant_ids[0]).all()
        for participation in first_user_chats:
            chat = Chat.query.get(participation.chat_id)
            if not chat or chat.is_group:
                continue

            existing_ids = {
                participant.user_id
                for participant in ChatParticipant.query.filter_by(chat_id=chat.id).all()
            }
            if existing_ids == set(participant_ids):
                return jsonify({"id": chat.id, "existing": True}), 200
        
    new_chat = Chat(is_group=is_group, name=name)
    db.session.add(new_chat)
    db.session.commit()
    
    for uid in participant_ids:
        cp = ChatParticipant(chat_id=new_chat.id, user_id=uid)
        db.session.add(cp)
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
        "ttl": m.ttl
    } for m in messages])

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
    
    filename = secure_filename(file.filename)
    if not filename:
        return jsonify({"error": "Invalid filename"}), 400

    unique_filename = str(int(datetime.datetime.utcnow().timestamp())) + "_" + filename
    file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_filename))
    
    # Return relative URL so frontend proxy handles it (avoids CORS)
    return jsonify({"url": f"/uploads/{unique_filename}"}) 

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
    join_room(data['room'])
    # Also join custom room for user ID for signaling
    if 'userId' in data:
         join_room(f"user_{data['userId']}")

@socketio.on('send_message')
def on_message(data):
    chat_id = data.get('chatId')
    sender_id = data.get('senderId')
    content = data.get('content')

    if not chat_id or not sender_id or content is None:
        emit('message_error', {"error": "Invalid message data"})
        return

    try:
        chat_id = int(chat_id)
        sender_id = int(sender_id)
    except (TypeError, ValueError):
        emit('message_error', {"error": "Invalid message data"})
        return

    if not user_is_chat_participant(sender_id, chat_id):
        emit('message_error', {"error": "Sender is not a chat participant"})
        return

    new_msg = Message(
        chat_id=chat_id, 
        sender_id=sender_id,
        content=content,
        type=data.get('type', 'text'),
        ttl=data.get('ttl', 0)
    )
    db.session.add(new_msg)
    db.session.commit()

    payload = {
        "id": new_msg.id,
        "senderId": new_msg.sender_id,
        "content": new_msg.content,
        "type": new_msg.type,
        "timestamp": iso_utc(new_msg.timestamp),
        "chatId": chat_id
    }

    participants = ChatParticipant.query.filter_by(chat_id=chat_id).all()
    for participant in participants:
        emit('receive_message', payload, room=f"user_{participant.user_id}")

# --- WebRTC Signaling (Mesh Manual) ---
@socketio.on('join_call')
def on_join_call(data):
    # data: { chatId, userId }
    room = f"call_{data['chatId']}"
    join_room(room)
    # Notify others in the room that a new user joined, so they can initiate offers
    # We send the sender's info so they can connect
    emit('user_joined_call', { "userId": data['userId'], "socketId": request.sid }, room=room, include_self=False)

@socketio.on('leave_call')
def on_leave_call(data):
    room = f"call_{data['chatId']}"
    leave_room(room)
    # Notify others to cleanup
    emit('user_left_call', { "userId": data.get('userId'), "socketId": request.sid }, room=room, include_self=False)

@socketio.on('offer')
def on_offer(data):
    # data: { to (socketId), offer, from (userId), fromSocket }
    emit('offer', data, room=data['to'])

@socketio.on('answer')
def on_answer(data):
    # data: { to (socketId), answer, from (userId), fromSocket }
    emit('answer', data, room=data['to'])

@socketio.on('ice_candidate')
def on_ice_candidate(data):
    # data: { to (socketId), candidate, from... }
    emit('ice_candidate', data, room=data['to'])

@socketio.on('notify_ring')
def on_notify_ring(data):
    # data: { chatId, callerName, participants: [id1, id2...], callerId }
    for uid in data['participants']:
        if uid != data['callerId']:
            emit('incoming_call', {
                "chatId": data['chatId'],
                "callerName": data['callerName'],
                "callerId": data['callerId']
            }, room=f"user_{uid}")


# --- Serve React App ---
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        if os.path.exists(os.path.join(app.static_folder, 'index.html')):
            return send_from_directory(app.static_folder, 'index.html')
        else:
            return "Signal Clone Backend Running. Use port 3000 for Frontend (Development Mode)", 200


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('FLASK_DEBUG') == '1'
    socketio.run(app, host='0.0.0.0', port=port, debug=debug)
