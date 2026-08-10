import requests
from flask import Blueprint, jsonify, request, current_app
import json
import hashlib
import hmac
import datetime
from sqlalchemy import or_
from models import db, Chat, ChatParticipant, Message, User, MessageDeletion, PaymentOrder, ScheduledMessage, CallRecord
from extensions import socketio
from utils import (
    get_current_user_id, user_can_access_chat, serialize_user, 
    iso_utc, get_json_data, has_contact, is_blocked, utc_now,
    queue_claimed_upload_assets, process_media_deletion_task
)
from scheduled_messages import valid_encrypted_envelope
from observability import report_safe_exception

chats_bp = Blueprint('chats_bp', __name__)

def parse_scheduled_time(value):
    try:
        parsed = datetime.datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None

@chats_bp.route('/api/chats/<int:chat_id>/scheduled-messages', methods=['POST'])
def create_scheduled_message(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403
    data = get_json_data()
    encrypted_content = data.get('content')
    scheduled_for = parse_scheduled_time(data.get('scheduledFor'))
    client_message_id = str(data.get('clientMessageId') or '').strip()[:100]
    now = utc_now()
    if not valid_encrypted_envelope(encrypted_content):
        return jsonify({'error': 'A valid encrypted message envelope is required'}), 400
    if not client_message_id:
        return jsonify({'error': 'clientMessageId is required'}), 400
    if not scheduled_for or scheduled_for < now + datetime.timedelta(minutes=1):
        return jsonify({'error': 'Schedule time must be at least one minute in the future'}), 400
    if scheduled_for > now + datetime.timedelta(days=365):
        return jsonify({'error': 'Schedule time cannot be more than one year away'}), 400
    participant_ids = {str(row.user_id) for row in ChatParticipant.query.filter_by(chat_id=chat_id).all()}
    envelope_recipients = set(json.loads(encrypted_content)['recipients'])
    if not participant_ids.issubset(envelope_recipients):
        return jsonify({'error': 'Encrypted envelope is missing a chat participant'}), 400
    existing = ScheduledMessage.query.filter_by(sender_id=user_id, client_message_id=client_message_id).first()
    if existing:
        return jsonify({'id': existing.id, 'scheduledFor': iso_utc(existing.scheduled_for), 'duplicate': True}), 200
    pending_for_chat = ScheduledMessage.query.filter_by(
        sender_id=user_id, chat_id=chat_id, status='pending',
    ).count()
    if pending_for_chat >= 50:
        return jsonify({'error': 'This chat already has the maximum 50 pending scheduled messages'}), 409
    pending_for_account = ScheduledMessage.query.filter_by(sender_id=user_id, status='pending').count()
    if pending_for_account >= 250:
        return jsonify({'error': 'Your account already has the maximum 250 pending scheduled messages'}), 409
    item = ScheduledMessage(
        sender_id=user_id, chat_id=chat_id, client_message_id=client_message_id,
        encrypted_content=encrypted_content, type='text', ttl=0,
        scheduled_for=scheduled_for,
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({'id': item.id, 'scheduledFor': iso_utc(item.scheduled_for)}), 201

@chats_bp.route('/api/chats/<int:chat_id>/scheduled-messages', methods=['GET'])
def list_scheduled_messages(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({'error': 'Forbidden'}), 403
    items = ScheduledMessage.query.filter_by(
        sender_id=user_id, chat_id=chat_id, status='pending',
    ).order_by(ScheduledMessage.scheduled_for.asc()).limit(100).all()
    return jsonify({'items': [{
        'id': item.id, 'scheduledFor': iso_utc(item.scheduled_for), 'status': item.status,
        'createdAt': iso_utc(item.created_at),
    } for item in items]})

@chats_bp.route('/api/scheduled-messages/<int:item_id>', methods=['DELETE'])
def cancel_scheduled_message(item_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    item = db.session.get(ScheduledMessage, item_id)
    if not item or item.sender_id != user_id:
        return jsonify({'error': 'Scheduled message not found'}), 404
    if item.status != 'pending':
        return jsonify({'error': 'Scheduled message can no longer be cancelled'}), 409
    item.status = 'cancelled'
    item.encrypted_content = ''
    db.session.commit()
    return jsonify({'ok': True})

def prepare_chat_hard_delete(chat_id):
    participant_ids = [row.user_id for row in ChatParticipant.query.filter_by(chat_id=chat_id).all()]
    task_ids = []
    for message in Message.query.filter_by(chat_id=chat_id).all():
        task_ids.extend(queue_claimed_upload_assets('message', message.id))

    retention_pepper = current_app.config.get('DATA_RETENTION_PEPPER') or current_app.config['SECRET_KEY']
    chat_ref = hmac.new(
        retention_pepper.encode(), f'payment-chat:{chat_id}'.encode(), hashlib.sha256
    ).hexdigest()
    for payment in PaymentOrder.query.filter_by(chat_id=chat_id).all():
        payment.chat_ref = payment.chat_ref or chat_ref
        payment.chat_id = None

    ScheduledMessage.query.filter_by(chat_id=chat_id).delete(synchronize_session=False)
    CallRecord.query.filter_by(chat_id=chat_id).delete(synchronize_session=False)
    Message.query.filter_by(chat_id=chat_id).delete(synchronize_session=False)
    ChatParticipant.query.filter_by(chat_id=chat_id).delete(synchronize_session=False)
    Chat.query.filter_by(id=chat_id).delete(synchronize_session=False)
    return participant_ids, list(dict.fromkeys(task_ids))

def emit_message_update(chat_id, event, payload):
    for participant in ChatParticipant.query.filter_by(chat_id=chat_id).all():
        socketio.emit(event, payload, room=f"user_{participant.user_id}")

@chats_bp.route('/api/chats/<int:chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    if not user_can_access_chat(user_id, chat_id):
        return jsonify({"error": "Forbidden"}), 403

    option = request.args.get('option', 'me')

    if option == 'everyone':
        chat = db.session.get(Chat, chat_id)
        if not chat:
            return jsonify({"error": "Chat not found"}), 404
        if chat.is_group and chat.group_admin_id != user_id:
            return jsonify({"error": "Only group admin can delete chat for everyone"}), 403

        participant_ids, task_ids = prepare_chat_hard_delete(chat_id)
        db.session.commit()
        for task_id in task_ids:
            process_media_deletion_task(task_id)

        for participant_id in participant_ids:
            socketio.emit('chat_deleted', {"chatId": chat_id}, room=f"user_{participant_id}")
        return jsonify({"ok": True})

    else: # option == 'me'
        participant = ChatParticipant.query.filter_by(chat_id=chat_id, user_id=user_id).first()
        if participant:
            participant.deleted_at = utc_now()

            # Add all existing messages to MessageDeletion for this user
            messages = Message.query.filter_by(chat_id=chat_id).all()
            for msg in messages:
                existing = MessageDeletion.query.filter_by(message_id=msg.id, user_id=user_id).first()
                if not existing:
                    db.session.add(MessageDeletion(message_id=msg.id, user_id=user_id))

            # If all participants have deleted the chat for themselves, delete it from DB fully
            total_participants = ChatParticipant.query.filter_by(chat_id=chat_id).all()
            all_deleted = all(p.deleted_at is not None for p in total_participants)
            if all_deleted:
                _, task_ids = prepare_chat_hard_delete(chat_id)
            else:
                task_ids = []

            db.session.commit()
            for task_id in task_ids:
                process_media_deletion_task(task_id)
        return jsonify({"ok": True})

@chats_bp.route('/api/chats', methods=['GET'])
def get_chats():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        participations = ChatParticipant.query.filter_by(user_id=user_id).all()
        chat_ids = [p.chat_id for p in participations]
        archive_map = {p.chat_id: bool(p.is_archived) for p in participations}
        chats = Chat.query.filter(Chat.id.in_(chat_ids)).all()

        result = []
        for chat in chats:
            if not user_can_access_chat(user_id, chat.id):
                continue
            participants = ChatParticipant.query.filter_by(chat_id=chat.id).all()
            part_data = []
            for p in participants:
                s_user = serialize_user(p.user, viewer_id=user_id)
                if chat.is_group and p.user_id != user_id:
                    s_user['phone'] = 'Hidden'
                    s_user['bio'] = ''
                    s_user['websiteUrl'] = ''
                part_data.append(s_user)

            deleted_msg_ids = {d.message_id for d in MessageDeletion.query.filter_by(user_id=user_id).all()}
            my_participant = next((p for p in participants if p.user_id == user_id), None)
            p_deleted_at = my_participant.deleted_at if my_participant else None

            query = Message.query.filter(Message.chat_id == chat.id)
            if chat.snap_mode:
                query = query.filter(Message.snap_mode.is_(True))
            if deleted_msg_ids:
                query = query.filter(~Message.id.in_(list(deleted_msg_ids)))
            if p_deleted_at:
                query = query.filter(Message.timestamp > p_deleted_at)
            query = query.filter(or_(Message.snap_mode.is_(False), Message.snap_mode.is_(None), Message.snap_expires_at.is_(None), Message.snap_expires_at > utc_now()))

            last_msg = query.order_by(Message.timestamp.desc()).first()
            unread_count = query.filter(
                Message.sender_id != user_id,
                Message.status != 'read'
            ).count()

            # Hide chat if deleted for me and there are no messages after deletion
            if p_deleted_at and not last_msg:
                continue

            chat_name = chat.name
            chat_avatar = None
            if not chat.is_group and len(part_data) == 2:
                other_user = next((p for p in part_data if p['id'] != user_id), None)
                if other_user:
                    chat_name = other_user['username']
                    chat_avatar = other_user['avatar']

            other_id = next((p['id'] for p in part_data if p['id'] != user_id), None) if not chat.is_group else None
            my_audience_profile = serialize_user(db.session.get(User, user_id), viewer_id=other_id) if other_id else None

            result.append({
                "id": chat.id,
                "isGroup": chat.is_group,
                "isArchived": archive_map.get(chat.id, False),
                "name": chat_name,
                "avatar": chat_avatar,
                "myAvatarForContact": my_audience_profile['avatar'] if my_audience_profile else None,
                "hasCustomAvatarForContact": my_audience_profile['hasCustomAudienceAvatar'] if my_audience_profile else False,
                "participants": part_data,
                "groupAdminId": chat.group_admin_id,
                "isPublic": getattr(chat, 'is_public', False),
                "isChatDisabled": getattr(chat, 'is_chat_disabled', False),
                "snapMode": bool(getattr(chat, 'snap_mode', False)),
                "unreadCount": unread_count,
                "lastMessage": {
                    "content": last_msg.content if last_msg and last_msg.type == 'text' else (last_msg.type if last_msg else "No messages"),
                    "timestamp": iso_utc(last_msg.timestamp) if last_msg else None,
                    "type": last_msg.type if last_msg else "text"
                }
            })
        
        # Sort chats: newest first. Chats with no messages (None timestamp) go to the end.
        result.sort(key=lambda x: x['lastMessage']['timestamp'] or '', reverse=True)
        return jsonify(result)
    except Exception as e:
        report_safe_exception('chat_list_failed', e)
        # Authentication was already validated above. A query/schema failure is
        # a server error and must never masquerade as an expired session, since
        # clients correctly react to a real 401 by logging the user out.
        return jsonify({"error": "Could not load chats"}), 500

@chats_bp.route('/api/chats/create', methods=['POST'])
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

    other_participant_ids = [uid for uid in participant_ids if uid != user_id]
    missing_contacts = [uid for uid in other_participant_ids if not has_contact(user_id, uid)]
    if missing_contacts:
        return jsonify({"error": "Add this number to your contacts before starting a chat"}), 403

    if not is_group and len(participant_ids) == 2:
        other_uid = next(uid for uid in participant_ids if uid != user_id)
        if is_blocked(user_id, other_uid):
            return jsonify({"error": "Blocked"}), 403

    if not is_group and len(participant_ids) == 2:
        first_user_chats = ChatParticipant.query.filter_by(user_id=participant_ids[0]).all()
        for participation in first_user_chats:
            chat = db.session.get(Chat, participation.chat_id)
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

@chats_bp.route('/api/chats/<int:chat_id>/messages', methods=['GET'])
def get_messages(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    if not user_can_access_chat(user_id, chat_id):
        return jsonify({"error": "Forbidden"}), 403

    now = utc_now()
    expired = []
    deletion_task_ids = []
    for message in Message.query.filter(Message.chat_id == chat_id, Message.ttl > 0).all():
        if (now - message.timestamp).total_seconds() > message.ttl:
            expired.append(message)
    for message in expired:
        deletion_task_ids.extend(queue_claimed_upload_assets('message', message.id))
        db.session.delete(message)
    if expired:
        db.session.commit()
        for task_id in deletion_task_ids:
            process_media_deletion_task(task_id)

    participant = ChatParticipant.query.filter_by(chat_id=chat_id, user_id=user_id).first()
    p_deleted_at = participant.deleted_at if participant else None

    deleted_msg_ids_subquery = db.session.query(MessageDeletion.message_id).filter(MessageDeletion.user_id == user_id).subquery()
    query = Message.query.filter(Message.chat_id == chat_id, ~Message.id.in_(deleted_msg_ids_subquery))
    chat = db.session.get(Chat, chat_id)
    if chat and chat.snap_mode:
        query = query.filter(Message.snap_mode.is_(True))
    if p_deleted_at:
        query = query.filter(Message.timestamp > p_deleted_at)

    messages = query.order_by(Message.timestamp.asc()).all()
    messages = [message for message in messages if not message.snap_mode or message.snap_expires_at is None or message.snap_expires_at > now]
    
    from models import StarredMessage, PollVote
    starred_ids = {s.message_id for s in StarredMessage.query.filter_by(user_id=user_id).all()}
    
    msg_ids = [m.id for m in messages]
    all_votes = PollVote.query.filter(PollVote.message_id.in_(msg_ids)).all() if msg_ids else []
    votes_by_message = {}
    for v in all_votes:
        if v.message_id not in votes_by_message:
            votes_by_message[v.message_id] = []
        votes_by_message[v.message_id].append({"userId": v.user_id, "optionIdx": v.option_idx})

    return jsonify([{
        "id": m.id,
        "senderId": m.sender_id,
        "content": "This message was deleted" if m.deleted_at else m.content,
        "status": m.status or 'sent',
        "type": m.type,
        "timestamp": iso_utc(m.timestamp),
        "ttl": m.ttl,
        "snapMode": bool(m.snap_mode),
        "snapExpiresAt": iso_utc(m.snap_expires_at),
        "replyToId": m.reply_to_id,
        "replyContent": m.reply_content,
        "replySenderName": m.reply_sender_name,
        "editedAt": iso_utc(m.edited_at),
        "deletedAt": iso_utc(m.deleted_at),
        "readAt": iso_utc(m.read_at),
        "deliveredAt": iso_utc(m.delivered_at),
        "reactions": m.reactions_dict(),
        "isPinned": bool(m.is_pinned),
        "isStarred": m.id in starred_ids,
        "votes": votes_by_message.get(m.id, [])
    } for m in messages])

@chats_bp.route('/api/messages/<int:message_id>', methods=['DELETE'])
def delete_message(message_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    message = db.session.get(Message, message_id)
    if not message:
        return jsonify({"error": "Message not found"}), 404

    option = request.args.get('option', 'me')

    if option == 'everyone':
        if message.sender_id != user_id:
            return jsonify({"error": "Forbidden"}), 403

        message.content = ''
        message.type = 'deleted'
        message.deleted_at = utc_now()
        task_ids = queue_claimed_upload_assets('message', message.id)
        db.session.commit()
        for task_id in task_ids:
            process_media_deletion_task(task_id)
        payload = {
            "message": "Deleted",
            "id": message.id,
            "chatId": message.chat_id,
            "deletedAt": iso_utc(message.deleted_at)
        }
        emit_message_update(message.chat_id, 'message_deleted', payload)
        return jsonify(payload), 200

    else: # option == 'me'
        if not user_can_access_chat(user_id, message.chat_id):
            return jsonify({"error": "Forbidden"}), 403

        existing = MessageDeletion.query.filter_by(message_id=message_id, user_id=user_id).first()
        if not existing:
            db.session.add(MessageDeletion(message_id=message_id, user_id=user_id))
            db.session.commit()

        payload = {
            "message": "Deleted for me",
            "id": message_id,
            "chatId": message.chat_id,
            "option": "me"
        }
        return jsonify(payload), 200

@chats_bp.route('/api/messages/<int:message_id>', methods=['PUT'])
def edit_message(message_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    message = db.session.get(Message, message_id)
    if not message:
        return jsonify({"error": "Message not found"}), 404
    if message.sender_id != user_id or message.deleted_at:
        return jsonify({"error": "Forbidden"}), 403
    if message.type not in ('text', 'business_auto_reply') or not valid_encrypted_envelope(message.content):
        return jsonify({"error": "This message type cannot be edited"}), 409

    data = get_json_data()
    content = data.get('content')
    if not valid_encrypted_envelope(content):
        return jsonify({"error": "A valid encrypted message envelope is required"}), 400
    participant_ids = {str(row.user_id) for row in ChatParticipant.query.filter_by(chat_id=message.chat_id).all()}
    envelope_recipients = set(json.loads(content)['recipients'])
    if not participant_ids.issubset(envelope_recipients):
        return jsonify({"error": "Encrypted envelope is missing a chat participant"}), 400

    message.content = content
    message.edited_at = utc_now()
    db.session.commit()
    payload = {
        "id": message.id,
        "chatId": message.chat_id,
        "content": message.content,
        "editedAt": iso_utc(message.edited_at)
    }
    emit_message_update(message.chat_id, 'message_edited', payload)
    return jsonify(payload)

@chats_bp.route('/api/messages/<int:message_id>/react', methods=['POST'])
def react_message(message_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    message = db.session.get(Message, message_id)
    if not message or not user_can_access_chat(user_id, message.chat_id):
        return jsonify({"error": "Message not found"}), 404
    data = get_json_data()
    raw_emoji = data.get('emoji')
    if not isinstance(raw_emoji, str):
        return jsonify({"error": "Reaction must be text"}), 400
    emoji = raw_emoji.strip()
    reactions = message.reactions_dict()
    key = str(user_id)
    if not emoji or reactions.get(key) == emoji:
        reactions.pop(key, None)
    else:
        reactions[key] = emoji[:12]
    message.reactions = json.dumps(reactions)
    db.session.commit()
    payload = {"id": message.id, "chatId": message.chat_id, "reactions": json.dumps(reactions)}
    emit_message_update(message.chat_id, 'message_reaction_update', payload)
    return jsonify({"id": message.id, "chatId": message.chat_id, "reactions": json.dumps(reactions)})

@chats_bp.route('/api/messages/<int:message_id>/pin', methods=['POST'])
def pin_message(message_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    message = db.session.get(Message, message_id)
    if not message or not user_can_access_chat(user_id, message.chat_id):
        return jsonify({"error": "Message not found"}), 404
    message.is_pinned = not bool(message.is_pinned)
    db.session.commit()
    payload = {"id": message.id, "chatId": message.chat_id, "isPinned": bool(message.is_pinned)}
    emit_message_update(message.chat_id, 'message_pin_update', payload)
    return jsonify(payload)

# Create Group
@chats_bp.route('/api/groups/create', methods=['POST'])
def create_group():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = get_json_data()
    name = data.get('name')
    is_public = data.get('isPublic', False)

    if not name or not name.strip():
        return jsonify({"error": "Group name is required"}), 400

    try:
        new_group = Chat(
            is_group=True,
            name=name.strip(),
            group_admin_id=user_id,
            is_public=is_public,
            is_chat_disabled=False
        )
        db.session.add(new_group)
        db.session.commit()

        # Add creator as a participant
        participant = ChatParticipant(chat_id=new_group.id, user_id=user_id)
        db.session.add(participant)
        db.session.commit()

        return jsonify({
            "id": new_group.id,
            "name": new_group.name,
            "isGroup": True,
            "isPublic": new_group.is_public,
            "isChatDisabled": new_group.is_chat_disabled,
            "groupAdminId": new_group.group_admin_id
        }), 201
    except Exception as e:
        report_safe_exception('group_creation_failed', e)
        return jsonify({"error": "Failed to create group"}), 500

# Add Participant to Group
@chats_bp.route('/api/chats/<int:chat_id>/participants', methods=['POST'])
def add_group_participant(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    chat = db.session.get(Chat, chat_id)
    if not chat or not chat.is_group:
        return jsonify({"error": "Group not found"}), 404

    if chat.group_admin_id != user_id:
        return jsonify({"error": "Forbidden"}), 403

    data = get_json_data()
    target_uid = data.get('userId')
    if not target_uid:
        return jsonify({"error": "User ID is required"}), 400

    target_user = db.session.get(User, target_uid)
    if not target_user:
        return jsonify({"error": "User not found"}), 404

    existing = ChatParticipant.query.filter_by(chat_id=chat_id, user_id=target_uid).first()
    if not existing:
        participant = ChatParticipant(chat_id=chat_id, user_id=target_uid)
        db.session.add(participant)
        db.session.commit()

        emit_message_update(chat_id, 'group_participant_added', {
            'chatId': chat_id, 'userId': target_user.id,
            'username': target_user.username, 'addedBy': user_id,
        })

    return jsonify({"ok": True})

# Discover Public Groups
@chats_bp.route('/api/groups/public', methods=['GET'])
def get_public_groups():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        # Get all public groups where the user is not yet a participant
        subquery = db.session.query(ChatParticipant.chat_id).filter_by(user_id=user_id).subquery()
        public_groups = Chat.query.filter_by(is_group=True, is_public=True).filter(~Chat.id.in_(subquery)).all()

        return jsonify([{
            "id": g.id,
            "name": g.name,
            "groupAdminId": g.group_admin_id,
            "isPublic": True,
            "isChatDisabled": g.is_chat_disabled,
            "created_at": iso_utc(g.created_at),
            "membersCount": ChatParticipant.query.filter_by(chat_id=g.id).count()
        } for g in public_groups])
    except Exception as e:
        report_safe_exception('public_group_fetch_failed', e)
        return jsonify({"error": str(e)}), 500

# Search Groups (Public & Private)
@chats_bp.route('/api/groups/search', methods=['POST'])
def search_groups():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = get_json_data()
    query = str(data.get('query') or '').strip()

    if not query:
        return jsonify([])

    try:
        subquery = db.session.query(ChatParticipant.chat_id).filter_by(user_id=user_id).subquery()
        groups = Chat.query.filter(
            Chat.is_group == True,
            Chat.is_public == True,
            Chat.name.ilike(f"%{query}%")
        ).filter(~Chat.id.in_(subquery)).all()

        from models import GroupJoinRequest
        results = []
        for g in groups:
            req = GroupJoinRequest.query.filter_by(chat_id=g.id, user_id=user_id).first()
            results.append({
                "id": g.id,
                "name": g.name,
                "isPublic": getattr(g, 'is_public', False),
                "isChatDisabled": getattr(g, 'is_chat_disabled', False),
                "hasPendingRequest": req.status == 'pending' if req else False,
                "membersCount": ChatParticipant.query.filter_by(chat_id=g.id).count()
            })
        return jsonify(results)
    except Exception as e:
        report_safe_exception('group_search_failed', e)
        return jsonify({"error": str(e)}), 500

# Join a Group
@chats_bp.route('/api/groups/<int:chat_id>/join', methods=['POST'])
def join_group(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    group = db.session.get(Chat, chat_id)
    if not group or not group.is_group:
        return jsonify({"error": "Group not found"}), 404

    # Check if already a participant
    existing = ChatParticipant.query.filter_by(chat_id=chat_id, user_id=user_id).first()
    if existing:
        return jsonify({"error": "Already a participant"}), 400

    user = db.session.get(User, user_id)

    if getattr(group, 'is_public', False):
        # Directly join
        participant = ChatParticipant(chat_id=chat_id, user_id=user_id)
        db.session.add(participant)
        db.session.commit()
        return jsonify({"ok": True, "joined": True})
    else:
        # Private group: create request
        from models import GroupJoinRequest
        from utils import create_notification

        # Check if request already exists
        existing_req = GroupJoinRequest.query.filter_by(chat_id=chat_id, user_id=user_id).first()
        if existing_req:
            if existing_req.status == 'approved':
                # Just in case, add as participant
                participant = ChatParticipant(chat_id=chat_id, user_id=user_id)
                db.session.add(participant)
                db.session.commit()
                return jsonify({"ok": True, "joined": True})
            return jsonify({"error": f"Join request is already {existing_req.status}"}), 400

        new_req = GroupJoinRequest(chat_id=chat_id, user_id=user_id, status='pending')
        db.session.add(new_req)
        db.session.commit()

        # Send notification to group admin
        if group.group_admin_id:
            create_notification(
                recipient_id=group.group_admin_id,
                sender_id=user_id,
                n_type='group_request',
                content=f"{user.username} wants to join group {group.name}",
                target_id=new_req.id
            )

        return jsonify({"ok": True, "joined": False, "pending": True})

# List Pending Join Requests (Admin Only)
@chats_bp.route('/api/groups/<int:chat_id>/requests', methods=['GET'])
def get_group_requests(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    group = db.session.get(Chat, chat_id)
    if not group or not group.is_group:
        return jsonify({"error": "Group not found"}), 404

    if group.group_admin_id != user_id:
        return jsonify({"error": "Only group admin can view requests"}), 403

    from models import GroupJoinRequest
    limit = min(max(request.args.get('limit', 50, type=int), 1), 100)
    requests = GroupJoinRequest.query.filter_by(
        chat_id=chat_id, status='pending'
    ).order_by(GroupJoinRequest.created_at.asc()).limit(limit).all()

    return jsonify([{
        "id": r.id,
        "chatId": r.chat_id,
        "userId": r.user_id,
        "username": r.user.username,
        "avatar": r.user.avatar,
        "timestamp": iso_utc(r.created_at)
    } for r in requests])

# Respond to Join Request (Admin Only)
@chats_bp.route('/api/groups/requests/<int:request_id>/respond', methods=['POST'])
def respond_group_request(request_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    from models import GroupJoinRequest
    join_req = db.session.get(GroupJoinRequest, request_id)
    if not join_req:
        return jsonify({"error": "Request not found"}), 404

    group = db.session.get(Chat, join_req.chat_id)
    if not group or group.group_admin_id != user_id:
        return jsonify({"error": "Only group admin can respond to requests"}), 403

    data = get_json_data()
    action = data.get('action')  # approve | reject

    if action not in ['approve', 'reject']:
        return jsonify({"error": "Invalid action. Must be 'approve' or 'reject'"}), 400

    try:
        if action == 'approve':
            join_req.status = 'approved'
            # Add user to participants
            existing = ChatParticipant.query.filter_by(chat_id=join_req.chat_id, user_id=join_req.user_id).first()
            if not existing:
                db.session.add(ChatParticipant(chat_id=join_req.chat_id, user_id=join_req.user_id))
            db.session.commit()
            
            # Delete the request record
            db.session.delete(join_req)
            db.session.commit()
        else:
            join_req.status = 'rejected'
            # Delete the request record
            db.session.delete(join_req)
            db.session.commit()

        return jsonify({"ok": True})
    except Exception as e:
        report_safe_exception('group_request_response_failed', e)
        return jsonify({"error": str(e)}), 500

# Toggle Mute Group (Admin Only)
@chats_bp.route('/api/groups/<int:chat_id>/toggle-chat', methods=['POST'])
def toggle_group_chat(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    group = db.session.get(Chat, chat_id)
    if not group or not group.is_group:
        return jsonify({"error": "Group not found"}), 404

    if group.group_admin_id != user_id:
        return jsonify({"error": "Only group admin can mute/unmute group"}), 403

    try:
        group.is_chat_disabled = not getattr(group, 'is_chat_disabled', False)
        db.session.commit()
        return jsonify({
            "chatId": group.id,
            "isChatDisabled": group.is_chat_disabled
        })
    except Exception as e:
        report_safe_exception('group_chat_toggle_failed', e)
        return jsonify({"error": str(e)}), 500

FALLBACK_GIFS_DATA = [
    {
        "url": "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOHB1bWppMTk5amswMTZlY2FhdzF3ejA2eGFoc3V0dmc0dWV2MzhqZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfZ2lwaHkmY3Q9Zw/3ntq5FxIfvLfO/giphy.gif",
        "tags": ["laugh", "funny", "minions", "lol", "happy", "smile", "haha"]
    },
    {
        "url": "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNmt0bXUxdnp4YWJpdjVpc3ZzMzU3ODl3ZXhhazRhY2dvd2t5YTZuNSZlcD12MV9pbnRlcm5hbF9naWZfYnlfZ2lwaHkmY3Q9Zw/t3s3G2f2jO8EM/giphy.gif",
        "tags": ["hello", "wave", "hi", "welcome", "bye", "goodbye", "greet"]
    },
    {
        "url": "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdzB2MGFjNno4NXZrMDk0OHlzZnd6ZXhrbzI4Y2c1amtzdmh1aXQ1diZlcD12MV9pbnRlcm5hbF9naWZfYnlfZ2lwaHkmY3Q9Zw/cuPm4p4pClZVC/giphy.gif",
        "tags": ["cat", "dance", "happy", "cute", "music", "animal", "dancing"]
    },
    {
        "url": "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZnNpdGZ2M3l6NWlyOTM4ZGNnaGR2azFsc3NzNHo0ejNlZHkweGR5NyZlcD12MV9pbnRlcm5hbF9naWZfYnlfZ2lwaHkmY3Q9Zw/kEKcOWl8RMLde/giphy.gif",
        "tags": ["confused", "shrug", "what", "maybe", "idk", "question"]
    },
    {
        "url": "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMGxmeTNuaDljdXV6Nmx2bzRtNWZpd3Z0cnlzNzI2eGx6c2g2ODc4NCZlcD12MV9pbnRlcm5hbF9naWZfYnlfZ2lwaHkmY3Q9Zw/BCkJ89PNKmOf1s51oR/giphy.gif",
        "tags": ["laugh", "clapping", "haha", "lol", "clap", "funny", "applause"]
    },
    {
        "url": "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMWNnMXJndXo5bzJ4MXNwdzM2M2VyeWJwb2RucHBwYzRxbGthczY5OCZlcD12MV9pbnRlcm5hbF9naWZfYnlfZ2lwaHkmY3Q9Zw/3o7TKoWXm3okO1kgdW/giphy.gif",
        "tags": ["sad", "cry", "crying", "tears", "heartbroken", "depressed"]
    },
    {
        "url": "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYnQydXkweHhsMGZpdzJpczU5dTZyeHpycnhzdmhhMmxlazJ3azh4MyZlcD12MV9pbnRlcm5hbF9naWZfYnlfZ2lwaHkmY3Q9Zw/c6SRlotmEgHVMTxazt/giphy.gif",
        "tags": ["shocked", "surprised", "wow", "omg", "gasp"]
    },
    {
        "url": "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExY2RxMzhvczY4MXB5cjJqMzdpa3RteDlsbzB2dDk1bWF6eWp5dG9yMW11bmFseWFvJmVwPXYxX2ludGVybmFsX2dpZl9ieV9naXBoeSZjdD1n/xT0xeJpD8e4DYnCHq8/giphy.gif",
        "tags": ["angry", "mad", "rage", "furious", "no", "irritated"]
    },
    {
        "url": "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2FwdGFnMXp1M2lyNG9nbTF2dmhyeHRkNzR0aHAydnVpMjI5Ymx1biZlcD12MV9pbnRlcm5hbF9naWZfYnlfZ2lwaHkmY3Q9Zw/l3q2zVr6cu95nF6O4/giphy.gif",
        "tags": ["love", "heart", "kiss", "cute", "sweet", "hug", "romance"]
    },
    {
        "url": "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTN4dnk5ODkxdDZ4YmY0bmcyNWl4bGF0YTZoM3pvMDQ5NmI4MHhqciZlcD12MV9pbnRlcm5hbF9naWZfYnlfZ2lwaHkmY3Q9Zw/11sBLVxNs7v6WA/giphy.gif",
        "tags": ["yes", "nod", "agree", "ok", "sure", "correct"]
    },
    {
        "url": "https://media.giphy.com/media/XreQmk7ETCak0/giphy.gif",
        "tags": ["yes", "agree", "ok", "thumbs up", "good", "cool", "like"]
    },
    {
        "url": "https://media.giphy.com/media/3og0INyMrrC67pIwTe/giphy.gif",
        "tags": ["facepalm", "fail", "stupid", "dumb", "sigh", "disappointed"]
    },
    {
        "url": "https://media.giphy.com/media/hVTouqNmQHjimGo405/giphy.gif",
        "tags": ["popcorn", "eating", "watching", "drama", "movie", "hungry"]
    },
    {
        "url": "https://media.giphy.com/media/mCRJDo24UvJMA/giphy.gif",
        "tags": ["dog", "cute", "happy", "puppy", "animal", "pet"]
    },
    {
        "url": "https://media.giphy.com/media/213v8FUmHdwXO/giphy.gif",
        "tags": ["thank you", "thanks", "grateful", "appreciate", "kind"]
    },
    {
        "url": "https://media.giphy.com/media/12XTNOpsQr1m9u/giphy.gif",
        "tags": ["no", "nope", "shake", "disagree", "refuse"]
    },
    {
        "url": "https://media.giphy.com/media/13rQ7rrTrvBsVW/giphy.gif",
        "tags": ["sleepy", "tired", "sleep", "exhausted", "bed", "goodnight", "yawn"]
    },
    {
        "url": "https://media.giphy.com/media/5t9wFB8cAzfQEC1A9z/giphy.gif",
        "tags": ["wink", "flirt", "cool", "agree", "friendly"]
    },
    {
        "url": "https://media.giphy.com/media/3oEJHV0z8S7EgU8396/giphy.gif",
        "tags": ["high five", "celebrate", "success", "good job", "yes", "team"]
    }
]

@chats_bp.route('/api/gifs', methods=['GET'])
def get_gifs_proxy():
    query = request.args.get('q', 'trending').strip().lower()
    if not query:
        query = 'trending'
    try:
        # Try Tenor API first (free, no key required)
        res = requests.get(f"https://api.tenor.com/v1/search?q={query}&limit=20&media_filter=gif", timeout=6)
        if res.status_code == 200:
            data = res.json()
            urls = [item['media_formats']['gif']['url'] for item in data.get('results', []) if 'media_formats' in item and 'gif' in item['media_formats']]
            if urls:
                return jsonify({"gifs": urls})
    except Exception as e:
        report_safe_exception('tenor_fetch_failed', e)
    
    try:
        # Fallback to Giphy
        res = requests.get(f"https://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q={query}&limit=18&rating=g", timeout=6)
        if res.status_code == 200:
            data = res.json()
            urls = [item['images']['fixed_height_small']['url'] for item in data.get('data', [])]
            if urls:
                return jsonify({"gifs": urls})
    except Exception as e:
        report_safe_exception('giphy_fetch_failed', e)
    
    # Filter fallback GIFs based on user's query matching our tag keywords
    if query == 'trending':
        gifs_to_return = [item["url"] for item in FALLBACK_GIFS_DATA]
    else:
        gifs_to_return = [
            item["url"]
            for item in FALLBACK_GIFS_DATA
            if any(query in tag for tag in item["tags"])
        ]
        # If no query matches, return all fallback gifs instead of an empty screen
        if not gifs_to_return:
            gifs_to_return = [item["url"] for item in FALLBACK_GIFS_DATA]

    return jsonify({"gifs": gifs_to_return})

# Star/Unstar Messages
@chats_bp.route('/api/messages/<int:message_id>/star', methods=['POST'])
def star_message(message_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    msg = db.session.get(Message, message_id)
    if not msg:
        return jsonify({"error": "Message not found"}), 404
        
    if not user_can_access_chat(user_id, msg.chat_id):
        return jsonify({"error": "Forbidden"}), 403
        
    from models import StarredMessage
    existing = StarredMessage.query.filter_by(user_id=user_id, message_id=message_id).first()
    if not existing:
        starred = StarredMessage(user_id=user_id, message_id=message_id)
        db.session.add(starred)
        db.session.commit()
        
    return jsonify({"ok": True, "starred": True})

@chats_bp.route('/api/messages/<int:message_id>/unstar', methods=['POST'])
def unstar_message(message_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    from models import StarredMessage
    existing = StarredMessage.query.filter_by(user_id=user_id, message_id=message_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        
    return jsonify({"ok": True, "starred": False})

@chats_bp.route('/api/messages/starred', methods=['GET'])
def get_starred_messages():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    from models import StarredMessage
    starred = StarredMessage.query.filter_by(user_id=user_id).all()
    msg_ids = [s.message_id for s in starred]
    if not msg_ids:
        return jsonify([])
        
    messages = Message.query.filter(Message.id.in_(msg_ids)).order_by(Message.timestamp.desc()).all()
    res = []
    for m in messages:
        res.append({
            "id": m.id,
            "chatId": m.chat_id,
            "senderId": m.sender_id,
            "senderName": m.sender.username if m.sender else "Unknown",
            "content": m.content,
            "type": m.type,
            "timestamp": iso_utc(m.timestamp),
            "status": m.status,
            "replyToId": m.reply_to_id,
            "replyContent": m.reply_content,
            "replySenderName": m.reply_sender_name,
            "editedAt": iso_utc(m.edited_at) if m.edited_at else None,
            "deletedAt": iso_utc(m.deleted_at) if m.deleted_at else None,
            "reactions": m.reactions_dict(),
            "isPinned": bool(m.is_pinned),
            "isStarred": True
        })
    return jsonify(res)

# Archive/Unarchive Chats
@chats_bp.route('/api/chats/<int:chat_id>/archive', methods=['POST'])
def archive_chat(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    participant = ChatParticipant.query.filter_by(chat_id=chat_id, user_id=user_id).first()
    if not participant:
        return jsonify({"error": "Chat participant not found"}), 404
        
    participant.is_archived = True
    db.session.commit()
    return jsonify({"ok": True, "isArchived": True})

@chats_bp.route('/api/chats/<int:chat_id>/unarchive', methods=['POST'])
def unarchive_chat(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    participant = ChatParticipant.query.filter_by(chat_id=chat_id, user_id=user_id).first()
    if not participant:
        return jsonify({"error": "Chat participant not found"}), 404
        
    participant.is_archived = False
    db.session.commit()
    return jsonify({"ok": True, "isArchived": False})

# Poll Voting
@chats_bp.route('/api/messages/<int:message_id>/poll-vote', methods=['POST'])
def vote_poll(message_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    msg = db.session.get(Message, message_id)
    if not msg or msg.type != 'poll':
        return jsonify({"error": "Poll message not found"}), 404
        
    if not user_can_access_chat(user_id, msg.chat_id):
        return jsonify({"error": "Forbidden"}), 403
        
    data = get_json_data()
    option_idx = data.get('optionIdx')
    if option_idx is None:
        return jsonify({"error": "Option index is required"}), 400
        
    from models import PollVote
    existing = PollVote.query.filter_by(message_id=message_id, user_id=user_id).first()
    if existing:
        if existing.option_idx == option_idx:
            db.session.delete(existing)
        else:
            existing.option_idx = option_idx
    else:
        vote = PollVote(message_id=message_id, user_id=user_id, option_idx=option_idx)
        db.session.add(vote)
        
    db.session.commit()
    
    votes = PollVote.query.filter_by(message_id=message_id).all()
    vote_data = [{"userId": v.user_id, "optionIdx": v.option_idx} for v in votes]
    
    payload = {"messageId": message_id, "chatId": msg.chat_id, "votes": vote_data}
    from sockets import emit_message_update
    emit_message_update(msg.chat_id, 'poll_vote_update', payload)
    
    return jsonify({"ok": True, "votes": vote_data})
