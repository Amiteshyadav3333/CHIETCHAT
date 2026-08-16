import datetime
import json
from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename
from models import db, Status, StatusView, StatusReaction, Message, ChatParticipant
from utils import (
    get_current_user_id, get_contact_user_ids, utc_now, serialize_user, 
    iso_utc, upload_to_cloudinary, get_json_data, has_contact, get_or_create_direct_chat,
    is_blocked, is_user_online, queue_media_deletion, process_media_deletion_task,
    claim_upload_asset, queue_claimed_upload_assets
)
from extensions import socketio
from scheduled_messages import valid_encrypted_envelope
from content_moderation import ModerationUnavailable, reject_adult_content

status_bp = Blueprint('status_bp', __name__)

STATUS_DEFAULT_LIMIT = 100
STATUS_MAX_LIMIT = 200
MAX_STATUS_CAPTION_LENGTH = 300

@status_bp.route('/api/status', methods=['GET'])
def get_statuses():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    now = utc_now()

    contact_user_ids = set(get_contact_user_ids(user_id))
    contact_user_ids.add(user_id)  # apna khud ka status bhi dikhega

    limit = min(max(request.args.get('limit', STATUS_DEFAULT_LIMIT, type=int), 1), STATUS_MAX_LIMIT)
    statuses = Status.query.filter(
        Status.expires_at > now,
        Status.user_id.in_(contact_user_ids)
    ).order_by(Status.created_at.desc()).limit(limit).all()

    users_map = {}
    for s in statuses:
        uid = s.user_id
        if uid != user_id:
            mode = s.user.story_privacy or 'contacts'
            tokens = {part.strip().lower().lstrip('@') for part in (s.user.story_privacy_exceptions or '').split(',') if part.strip()}
            viewer = db.session.get(type(s.user), user_id)
            viewer_matches = bool(viewer and ({str(viewer.id), (viewer.username or '').lower(), (viewer.platform_id or '').lower()} & tokens))
            if mode == 'nobody' or (mode == 'contacts_except' and viewer_matches) or (mode == 'only' and not viewer_matches):
                continue
        if uid not in users_map:
            users_map[uid] = {
                "user": serialize_user(s.user, viewer_id=user_id),
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
            "musicVolume": s.music_volume if s.music_volume is not None else 0.8,
            "musicStart": s.music_start or 0,
            "duration": s.duration,
            "createdAt": iso_utc(s.created_at),
            "expiresAt": iso_utc(s.expires_at),
            "viewed": viewed,
            "viewCount": len(s.views),
            "reactions": {}
        }
        for reaction in s.reactions:
            status_data["reactions"][reaction.emoji] = status_data["reactions"].get(reaction.emoji, 0) + 1
            if reaction.user_id == user_id:
                status_data["myReaction"] = reaction.emoji
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

    caption = request.form.get('caption', '').strip()
    if len(caption) > MAX_STATUS_CAPTION_LENGTH:
        return jsonify({"error": f"Caption must be {MAX_STATUS_CAPTION_LENGTH} characters or less"}), 400

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

    music_url = request.form.get('musicUrl', None)
    music_name = request.form.get('musicName', None)
    try:
        music_volume = min(max(float(request.form.get('musicVolume', 0.8)), 0), 1)
        music_start = min(max(float(request.form.get('musicStart', 0)), 0), 29)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid music controls"}), 400

    try:
        blocked, adult_score = reject_adult_content(file, media_type)
        if blocked:
            return jsonify({"error": "Upload blocked: adult content is not allowed", "code": "ADULT_CONTENT_BLOCKED", "adultScore": round(adult_score, 3)}), 422
        media_url = upload_to_cloudinary(file, folder='chietchat/status', resource_type=resource_type)
    except ModerationUnavailable:
        return jsonify({"error": "Media safety check is temporarily unavailable", "code": "MODERATION_UNAVAILABLE"}), 503
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

    music_asset_id = request.form.get('musicAssetId')
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
        music_volume=music_volume,
        music_start=music_start,
        duration=duration,
        expires_at=expires_at
    )
    db.session.add(status)
    try:
        db.session.flush()
        if music_asset_id:
            claim_upload_asset(music_asset_id, user_id, 'status', status.id, {'audio'})
        db.session.commit()
    except ValueError as error:
        db.session.rollback()
        return jsonify({"error": str(error)}), 400

    socketio.emit('new_status', {"userId": user_id}, room=f"user_{user_id}")
    return jsonify({"message": "Status posted", "id": status.id}), 201

@status_bp.route('/api/status/<int:status_id>/view', methods=['POST'])
def view_status(status_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    status = db.session.get(Status, status_id)
    if not status or status.expires_at <= utc_now():
        return jsonify({"error": "Status not found"}), 404
    if status.user_id != user_id and not has_contact(user_id, status.user_id):
        return jsonify({"error": "Forbidden"}), 403
    existing = StatusView.query.filter_by(status_id=status_id, viewer_id=user_id).first()
    if not existing:
        db.session.add(StatusView(status_id=status_id, viewer_id=user_id))
        db.session.commit()
    return jsonify({"ok": True})

@status_bp.route('/api/status/<int:status_id>/react', methods=['POST'])
def react_to_status(status_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = get_json_data()
    raw_emoji = data.get('emoji')
    if raw_emoji is not None and not isinstance(raw_emoji, str):
        return jsonify({"error": "Reaction must be text"}), 400
    emoji = (raw_emoji or '').strip()[:12]
    status = db.session.get(Status, status_id)
    if not status or status.expires_at <= utc_now():
        return jsonify({"error": "Status not found"}), 404
    if status.user_id != user_id and not has_contact(user_id, status.user_id):
        return jsonify({"error": "Forbidden"}), 403

    existing = StatusReaction.query.filter_by(status_id=status_id, user_id=user_id).first()
    active_reaction = emoji
    if not emoji or (existing and existing.emoji == emoji):
        if existing:
            db.session.delete(existing)
        active_reaction = ''
    elif existing:
        existing.emoji = emoji
        existing.created_at = utc_now()
    else:
        db.session.add(StatusReaction(status_id=status_id, user_id=user_id, emoji=emoji))
    db.session.commit()

    counts = {}
    for reaction in StatusReaction.query.filter_by(status_id=status_id).all():
        counts[reaction.emoji] = counts.get(reaction.emoji, 0) + 1

    return jsonify({"ok": True, "reactions": counts, "myReaction": active_reaction})

@status_bp.route('/api/status/<int:status_id>/reply', methods=['POST'])
def reply_to_status(status_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = get_json_data()
    encrypted_content = data.get('content')
    client_message_id = str(data.get('clientMessageId') or '').strip()[:100]
    if not valid_encrypted_envelope(encrypted_content):
        return jsonify({"error": "A valid encrypted reply envelope is required"}), 400
    if not client_message_id:
        return jsonify({"error": "clientMessageId is required"}), 400

    status = db.session.get(Status, status_id)
    if not status or status.expires_at <= utc_now():
        return jsonify({"error": "Status not found"}), 404
    if status.user_id == user_id:
        return jsonify({"error": "You cannot reply to your own status"}), 400
    if not has_contact(user_id, status.user_id):
        return jsonify({"error": "You can only reply to your contacts' statuses"}), 403
    if is_blocked(user_id, status.user_id):
        return jsonify({"error": "Blocked"}), 403

    chat = get_or_create_direct_chat(user_id, status.user_id)
    participant_ids = {str(row.user_id) for row in ChatParticipant.query.filter_by(chat_id=chat.id).all()}
    envelope_recipients = set(json.loads(encrypted_content)['recipients'])
    if not participant_ids.issubset(envelope_recipients):
        return jsonify({"error": "Encrypted envelope is missing a chat participant"}), 400
    existing = Message.query.filter_by(sender_id=user_id, client_message_id=client_message_id).first()
    if existing:
        return jsonify({"ok": True, "chatId": chat.id, "messageId": existing.id, "duplicate": True}), 200
    new_msg = Message(
        chat_id=chat.id,
        sender_id=user_id,
        client_message_id=client_message_id,
        content=encrypted_content,
        type='text'
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
        "replySenderName": new_msg.reply_sender_name,
        "deliveredAt": None,
        "readAt": None,
        "reactions": {},
        "isPinned": False
    }

    participants = ChatParticipant.query.filter_by(chat_id=chat.id).all()
    any_recipient_online = False
    for participant in participants:
        if participant.user_id != user_id and is_user_online(participant.user_id):
            any_recipient_online = True
            break

    if any_recipient_online:
        new_msg.status = 'delivered'
        new_msg.delivered_at = utc_now()
        db.session.commit()
        payload["status"] = 'delivered'
        payload["deliveredAt"] = iso_utc(new_msg.delivered_at)

    for participant in participants:
        socketio.emit('receive_message', payload, room=f"user_{participant.user_id}")

    return jsonify({"ok": True, "chatId": chat.id, "message": payload}), 201

@status_bp.route('/api/status/<int:status_id>', methods=['DELETE'])
def delete_status(status_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    status = db.session.get(Status, status_id)
    if not status or status.user_id != user_id:
        return jsonify({"error": "Not found"}), 404

    task_ids = queue_claimed_upload_assets('status', status.id)
    for media_url, resource_type in (
        (status.media_url, status.media_type), (status.music_url, 'video'),
    ):
        deletion_task = queue_media_deletion(media_url, resource_type)
        if deletion_task:
            db.session.flush()
            task_ids.append(deletion_task.id)
    db.session.delete(status)
    db.session.commit()
    for task_id in set(task_ids):
        process_media_deletion_task(task_id)
    return jsonify({"message": "Deleted"})
