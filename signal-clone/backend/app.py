import os
import jwt
import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from config import Config
from models import db, User, Chat, ChatParticipant, Message
from sqlalchemy import or_

app = Flask(__name__, static_folder='static')
app.config.from_object(Config)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*")
db.init_app(app)

if not os.path.exists('uploads'):
    os.makedirs('uploads')

with app.app_context():
    db.create_all()

# --- Auth Routes (Phone Based) ---
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    phone = data['phone'].strip()
    # Validate phone
    if User.query.filter_by(phone=phone).first():
        return jsonify({"error": "Phone number already registered"}), 400
    
    hashed_pw = generate_password_hash(data['password'])
    new_user = User(
        username=data['username'], 
        phone=phone,
        password_hash=hashed_pw, 
        public_key=data.get('publicKey')
    )
    db.session.add(new_user)
    db.session.commit()
    return jsonify({"message": "User created"}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    phone = data['phone'].strip()
    # Login with phone
    user = User.query.filter_by(phone=phone).first()
    if user and check_password_hash(user.password_hash, data['password']):
        token = jwt.encode({
            'user_id': user.id,
            'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
        }, app.config['JWT_SECRET_KEY'], algorithm='HS256')
        return jsonify({
            "token": token, 
            "user": {
                "id": user.id, 
                "username": user.username, 
                "phone": user.phone,
                "avatar": user.avatar,
                "publicKey": user.public_key
            }
        })
    return jsonify({"error": "Invalid credentials"}), 401

@app.route('/api/users', methods=['GET'])
def get_users():
    users = User.query.all()
    return jsonify([{
        "id": u.id, 
        "username": u.username, 
        "phone": u.phone,
        "avatar": u.avatar
    } for u in users])

@app.route('/api/user/search', methods=['POST'])
def search_user():
    data = request.json
    phone = data.get('phone').strip()
    user = User.query.filter_by(phone=phone).first()
    if user:
        return jsonify({"id": user.id, "username": user.username, "avatar": user.avatar})
    return jsonify({"error": "User not registered with this number"}), 200

@app.route('/api/users/<int:user_id>/key', methods=['GET'])
def get_user_public_key(user_id):
    user = User.query.get(user_id)
    if user:
        return jsonify({"publicKey": user.public_key})
    return jsonify({"error": "User not found"}), 404

@app.route('/api/user/key', methods=['POST'])
def update_public_key():
    auth_header = request.headers.get('Authorization')
    if not auth_header: return jsonify({"error": "Unauthorized"}), 401
    try:
        token = auth_header.split(" ")[1]
        payload = jwt.decode(token, app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        user = User.query.get(payload['user_id'])
        if user:
            user.public_key = request.json.get('publicKey')
            db.session.commit()
            return jsonify({"message": "Key updated"})
    except Exception as e:
        return jsonify({"error": "Invalid token"}), 401

# --- Static Files ---
@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# --- Chat Routes ---
@app.route('/api/chats', methods=['GET'])
def get_chats():
    auth_header = request.headers.get('Authorization')
    if not auth_header: return jsonify({"error": "Unauthorized"}), 401
    try:
        token = auth_header.split(" ")[1]
        payload = jwt.decode(token, app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        user_id = payload['user_id']
        
        participations = ChatParticipant.query.filter_by(user_id=user_id).all()
        chat_ids = [p.chat_id for p in participations]
        chats = Chat.query.filter(Chat.id.in_(chat_ids)).all()
        
        result = []
        for chat in chats:
            participants = ChatParticipant.query.filter_by(chat_id=chat.id).all()
            part_data = []
            for p in participants:
                part_data.append({
                    "id": p.user.id, 
                    "username": p.user.username, 
                    "phone": p.user.phone,
                    "avatar": p.user.avatar,
                    "publicKey": p.user.public_key
                })
            
            last_msg = Message.query.filter_by(chat_id=chat.id).order_by(Message.timestamp.desc()).first()
            
            chat_name = chat.name
            chat_avatar = None
            if not chat.is_group and len(part_data) == 2:
                other_user = next(p for p in part_data if p['id'] != user_id)
                chat_name = other_user['username']
                chat_avatar = other_user['avatar']

            result.append({
                "id": chat.id,
                "isGroup": chat.is_group,
                "name": chat_name,
                "avatar": chat_avatar,
                "participants": part_data,
                "lastMessage": {
                    "content": "Encrypted" if last_msg and last_msg.type == 'text' else (last_msg.type if last_msg else "No messages"),
                    "timestamp": last_msg.timestamp.isoformat() if last_msg else None,
                    "type": last_msg.type if last_msg else "text"
                }
            })
        return jsonify(result)
    except Exception as e:
        print(e)
        return jsonify({"error": "Invalid token"}), 401

@app.route('/api/chats/create', methods=['POST'])
def create_chat():
    data = request.json
    participant_ids = data.get('participants') 
    is_group = data.get('isGroup', False)
    name = data.get('name', None)
    
    # Check if 1:1 chat already exists
    if not is_group and len(participant_ids) == 2:
        # Find chats where both users are participants
        # Simplified: Just create new for now to avoid complex SQL in this snippet 
        pass 
        
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
    messages = Message.query.filter_by(chat_id=chat_id).order_by(Message.timestamp.asc()).all()
    return jsonify([{
        "id": m.id,
        "senderId": m.sender_id,
        "content": m.content,
        "type": m.type,
        "timestamp": m.timestamp.isoformat(),
        "ttl": m.ttl
    } for m in messages])

from werkzeug.utils import secure_filename

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selection"}), 400
    
    filename = secure_filename(file.filename)
    unique_filename = str(int(datetime.datetime.utcnow().timestamp())) + "_" + filename
    file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_filename))
    
    # Return relative URL so frontend proxy handles it (avoids CORS)
    return jsonify({"url": f"/uploads/{unique_filename}"}) 

# --- Socket Events ---
@socketio.on('join_room')
def on_join(data):
    join_room(data['room'])
    # Also join custom room for user ID for signaling
    if 'userId' in data:
         join_room(f"user_{data['userId']}")

@socketio.on('send_message')
def on_message(data):
    new_msg = Message(
        chat_id=data['chatId'], 
        sender_id=data['senderId'],
        content=data['content'],
        type=data.get('type', 'text'),
        ttl=data.get('ttl', 0)
    )
    db.session.add(new_msg)
    db.session.commit()
    
    emit('receive_message', {
        "id": new_msg.id,
        "senderId": new_msg.sender_id,
        "content": new_msg.content,
        "type": new_msg.type,
        "timestamp": new_msg.timestamp.isoformat(),
        "chatId": data['chatId']
    }, room=data['chatId'])

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
    socketio.run(app, debug=True, port=5001)
