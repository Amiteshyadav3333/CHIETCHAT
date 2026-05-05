import datetime
from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename
from models import db, Status, StatusView, Message, ChatParticipant
from utils import (
    get_current_user_id, get_contact_user_ids, utc_now, serialize_user, 
    iso_utc, upload_to_cloudinary, get_json_data, has_contact, get_or_create_direct_chat
)
from extensions import socketio

status_bp = Blueprint('status_bp', __name__)

@status_bp.route('/api/status', methods=['GET'])
def get_statuses():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    now = utc_now()

    contact_user_ids = set(get_contact_user_ids(user_id))
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
        status_data = {
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
        }
        if uid == user_id:
            status_data["viewers"] = [serialize_user(v.viewer) for v in s.views]
        
        users_map[uid]["statuses"].append(status_data)
    return jsonify(list(users_map.values()))

@status_bp.route('/api/status', methods=['POST'])
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

@status_bp.route('/api/status/<int:status_id>/view', methods=['POST'])
def view_status(status_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    existing = StatusView.query.filter_by(status_id=status_id, viewer_id=user_id).first()
    if not existing:
        db.session.add(StatusView(status_id=status_id, viewer_id=user_id))
        db.session.commit()
    return jsonify({"ok": True})

@status_bp.route('/api/status/<int:status_id>/reply', methods=['POST'])
def reply_to_status(status_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = get_json_data()
    reply_text = (data.get('message') or '').strip()
    if not reply_text:
        return jsonify({"error": "Reply message is required"}), 400
    if len(reply_text) > 1000:
        return jsonify({"error": "Reply is too long"}), 400

    status = Status.query.get(status_id)
    if not status or status.expires_at <= utc_now():
        return jsonify({"error": "Status not found"}), 404
    if status.user_id == user_id:
        return jsonify({"error": "You cannot reply to your own status"}), 400
    if not has_contact(user_id, status.user_id):
        return jsonify({"error": "You can only reply to your contacts' statuses"}), 403

    chat = get_or_create_direct_chat(user_id, status.user_id)
    status_label = status.caption.strip() if status.caption else status.media_type
    message_content = f"Replied to your status ({status_label}):\n{reply_text}"
    new_msg = Message(
        chat_id=chat.id,
        sender_id=user_id,
        content=message_content,
        type='text',
        reply_content=status.media_url,
        reply_sender_name='Status'
    )
    db.session.add(new_msg)
    db.session.commit()

    payload = {
        "id": new_msg.id,
        "senderId": new_msg.sender_id,
        "content": new_msg.content,
        "type": new_msg.type,
        "timestamp": iso_utc(new_msg.timestamp),
        "chatId": chat.id,
        "replyToId": new_msg.reply_to_id,
        "replyContent": new_msg.reply_content,
        "replySenderName": new_msg.reply_sender_name
    }

    for participant in ChatParticipant.query.filter_by(chat_id=chat.id).all():
        socketio.emit('receive_message', payload, room=f"user_{participant.user_id}")

    return jsonify({"ok": True, "chatId": chat.id, "message": payload}), 201

@status_bp.route('/api/status/<int:status_id>', methods=['DELETE'])
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
