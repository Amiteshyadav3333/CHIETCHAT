import os
import jwt
import datetime
import json
import uuid
import urllib.parse
import urllib.request
from flask import request, current_app
from werkzeug.utils import secure_filename
from sqlalchemy import inspect, text
from extensions import socketio, socket_users, user_connection_counts
from models import db, User, Chat, ChatParticipant, Contact, Block, Notification
import cloudinary.uploader

def upload_to_cloudinary(file, folder='chietchat', resource_type='auto'):
    if not all([
        os.environ.get('CLOUDINARY_CLOUD_NAME'),
        os.environ.get('CLOUDINARY_API_KEY'),
        os.environ.get('CLOUDINARY_API_SECRET')
    ]):
        upload_folder = current_app.config['UPLOAD_FOLDER']
        os.makedirs(upload_folder, exist_ok=True)
        filename = secure_filename(getattr(file, 'filename', None) or 'upload')
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'bin'
        local_name = f"{uuid.uuid4().hex}.{ext}"
        if isinstance(file, (bytes, bytearray)):
            with open(os.path.join(upload_folder, local_name), 'wb') as f:
                f.write(file)
        else:
            file.save(os.path.join(upload_folder, local_name))
        return f"/uploads/{local_name}"

    # If file object, read bytes first for reliable upload
    if not isinstance(file, (bytes, bytearray)):
        file_data = file.read()
    else:
        file_data = file

    result = cloudinary.uploader.upload(
        file_data,
        folder=folder,
        resource_type=resource_type
    )
    return result['secure_url']

def add_missing_columns(inspector, table_name, columns):
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
        try:
            db.session.execute(text(f'ALTER TABLE {quoted_table} ADD COLUMN {quoted_column} {compiled_type}'))
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"Error adding column {column_name} to {table_name}: {e}")

def ensure_database_schema():
    try:
        db.create_all()
        inspector = inspect(db.engine)
        
        # Notification table is created by create_all(), but we check other tables' columns
        add_missing_columns(inspector, 'notification', {
            'target_id': db.Integer(),
        })
        add_missing_columns(inspector, 'user', {
            'email': db.String(120),
            'public_key': db.Text(),
            'avatar': db.String(200),
            'last_seen': db.DateTime(),
            'created_at': db.DateTime(),
        })
        add_missing_columns(inspector, 'reel', {
            'music_url': db.String(500),
            'music_name': db.String(200),
            'music_volume': db.Float(),
            'shares_count': db.Integer(),
            'views_count': db.Integer(),
            'parent_reel_id': db.Integer(),
            'filter_name': db.String(50),
        })
        add_missing_columns(inspector, 'user', {
            'bio': db.String(200),
            'website_url': db.String(200),
            'email_verified': db.Boolean(),
            'failed_login_attempts': db.Integer(),
            'password_login_locked': db.Boolean(),
            'platform_id': db.String(30),
            'profile_setup_done': db.Boolean(),
        })
        if 'user' in inspector.get_table_names():
            user_columns = {column['name'] for column in inspector.get_columns('user')}
            updates = []
            if 'email_verified' in user_columns:
                updates.append('email_verified = COALESCE(email_verified, TRUE)')
            if 'failed_login_attempts' in user_columns:
                updates.append('failed_login_attempts = COALESCE(failed_login_attempts, 0)')
            if 'password_login_locked' in user_columns:
                updates.append('password_login_locked = COALESCE(password_login_locked, FALSE)')
            if updates:
                db.session.execute(text(f'UPDATE "user" SET {", ".join(updates)}'))
        add_missing_columns(inspector, 'chat', {
            'is_group': db.Boolean(),
            'name': db.String(100),
            'group_admin_id': db.Integer(),
            'is_public': db.Boolean(),
            'is_chat_disabled': db.Boolean(),
            'created_at': db.DateTime(),
        })
        add_missing_columns(inspector, 'message', {
            'status': db.String(20),
            'ttl': db.Integer(),
            'reply_to_id': db.Integer(),
            'reply_content': db.Text(),
            'reply_sender_name': db.String(80),
            'edited_at': db.DateTime(),
            'deleted_at': db.DateTime(),
            'read_at': db.DateTime(),
            'reactions': db.Text(),
            'is_pinned': db.Boolean(),
        })
        add_missing_columns(inspector, 'status', {
            'music_url': db.String(500),
            'music_name': db.String(200),
            'duration': db.Integer(),
        })
        add_missing_columns(inspector, 'social_post', {
            'retweet_of_id': db.Integer(),
            'share_count': db.Integer(),
        })
        add_missing_columns(inspector, 'social_post_comment', {
            'parent_id': db.Integer(),
        })
        add_missing_columns(inspector, 'reel_comment', {
            'parent_id': db.Integer(),
        })


        if 'user' in inspector.get_table_names():
            user_columns = {column['name'] for column in inspector.get_columns('user')}
            if {'last_seen', 'created_at'}.issubset(user_columns):
                db.session.execute(text('UPDATE "user" SET last_seen = created_at WHERE last_seen IS NULL'))
        db.session.commit()
    except Exception as e:
        print(f"Database schema check timed out or failed: {e}")
        db.session.rollback()

def get_json_data():
    return request.get_json(silent=True) or {}

def normalize_phone(phone):
    return ''.join(ch for ch in str(phone or '') if ch.isdigit())

def is_valid_phone(phone):
    return len(phone) == 10

def get_current_user_id():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None
    try:
        token = auth_header.split(' ', 1)[1]
        payload = jwt.decode(token, current_app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        return payload.get('user_id')
    except Exception:
        return None

def user_is_chat_participant(user_id, chat_id):
    return ChatParticipant.query.filter_by(user_id=user_id, chat_id=chat_id).first() is not None

def get_socket_user_id():
    # request in socket context
    return socket_users.get(request.sid)

def get_chat_participant_ids(chat_id):
    return [
        participant.user_id
        for participant in ChatParticipant.query.filter_by(chat_id=chat_id).all()
    ]

def find_direct_chat(user_a_id, user_b_id):
    first_user_chats = ChatParticipant.query.filter_by(user_id=user_a_id).all()
    target_ids = {user_a_id, user_b_id}
    for participation in first_user_chats:
        chat = Chat.query.get(participation.chat_id)
        if not chat or chat.is_group:
            continue
        participant_ids = {p.user_id for p in ChatParticipant.query.filter_by(chat_id=chat.id).all()}
        if participant_ids == target_ids:
            return chat
    return None

def get_or_create_direct_chat(user_a_id, user_b_id):
    existing_chat = find_direct_chat(user_a_id, user_b_id)
    if existing_chat:
        return existing_chat

    chat = Chat(is_group=False)
    db.session.add(chat)
    db.session.commit()
    db.session.add(ChatParticipant(chat_id=chat.id, user_id=user_a_id))
    db.session.add(ChatParticipant(chat_id=chat.id, user_id=user_b_id))
    db.session.commit()
    return chat

def users_share_direct_chat(user_a_id, user_b_id):
    return find_direct_chat(user_a_id, user_b_id) is not None

def has_contact(owner_id, contact_user_id):
    return Contact.query.filter_by(owner_id=owner_id, contact_user_id=contact_user_id).first() is not None

def add_contact(owner_id, contact_user_id):
    if owner_id == contact_user_id:
        return False
    if has_contact(owner_id, contact_user_id):
        return False
    db.session.add(Contact(owner_id=owner_id, contact_user_id=contact_user_id))
    db.session.commit()
    return True

def get_contact_user_ids(owner_id):
    return [
        contact.contact_user_id
        for contact in Contact.query.filter_by(owner_id=owner_id).all()
    ]

def user_can_access_chat(user_id, chat_id):
    chat = Chat.query.get(chat_id)
    return bool(chat and user_is_chat_participant(user_id, chat_id))

def is_blocked(user_a_id, user_b_id):
    blocked = Block.query.filter(
        ((Block.blocker_id == user_a_id) & (Block.blocked_id == user_b_id)) |
        ((Block.blocker_id == user_b_id) & (Block.blocked_id == user_a_id))
    ).first()
    return blocked is not None

def decode_socket_user_id(auth, secret_key):
    if not auth:
        return None
    token = auth.get('token')
    if not token:
        return None
    try:
        payload = jwt.decode(token, secret_key, algorithms=['HS256'])
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
        "bio": user.bio or "",
        "websiteUrl": user.website_url or "",
        "platformId": user.platform_id or "",
        "profileSetupDone": bool(user.profile_setup_done),
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

def create_notification(recipient_id, sender_id, n_type, content=None, target_id=None):
    if recipient_id == sender_id:
        return None
    
    # Avoid duplicate notifications for same target/type/sender (e.g. liking multiple times)
    existing = Notification.query.filter_by(
        recipient_id=recipient_id,
        sender_id=sender_id,
        type=n_type,
        target_id=target_id,
        is_read=False
    ).first()
    
    if existing:
        existing.created_at = utc_now()
        db.session.commit()
        return existing

    new_n = Notification(
        recipient_id=recipient_id,
        sender_id=sender_id,
        type=n_type,
        content=content,
        target_id=target_id
    )
    db.session.add(new_n)
    db.session.commit()
    
    # Build post preview for socket push
    post_preview = None
    if n_type in ('like', 'comment', 'comment_reply', 'retweet', 'share') and target_id:
        from models import SocialPost
        post = SocialPost.query.get(target_id)
        if post and post.caption:
            post_preview = post.caption[:80] + ('…' if len(post.caption) > 80 else '')

    # Real-time emit
    from extensions import socketio
    socketio.emit('new_notification', {
        "id": new_n.id,
        "type": n_type,
        "senderName": new_n.sender.username if new_n.sender else "Someone",
        "senderAvatar": new_n.sender.avatar if new_n.sender else None,
        "sender": {
            "id": new_n.sender.id if new_n.sender else None,
            "username": new_n.sender.username if new_n.sender else "Someone",
            "avatar": new_n.sender.avatar if new_n.sender else None,
        },
        "content": content,
        "targetId": target_id,
        "postPreview": post_preview,
        "isRead": False,
        "createdAt": iso_utc(new_n.created_at)
    }, room=f"user_{recipient_id}")
    
    return new_n

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
