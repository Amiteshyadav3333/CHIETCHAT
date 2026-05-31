import json
from flask import Blueprint, jsonify
from models import db, Chat, ChatParticipant, Message, User
from extensions import socketio
from utils import (
    get_current_user_id, user_can_access_chat, serialize_user, 
    iso_utc, get_json_data, has_contact, is_blocked, utc_now
)

chats_bp = Blueprint('chats_bp', __name__)

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
    Message.query.filter_by(chat_id=chat_id).delete()
    ChatParticipant.query.filter_by(chat_id=chat_id).delete()
    Chat.query.filter_by(id=chat_id).delete()
    db.session.commit()
    return jsonify({"ok": True})

@chats_bp.route('/api/chats', methods=['GET'])
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
            if not user_can_access_chat(user_id, chat.id):
                continue
            participants = ChatParticipant.query.filter_by(chat_id=chat.id).all()
            part_data = []
            for p in participants:
                s_user = serialize_user(p.user)
                if chat.is_group and p.user_id != user_id:
                    s_user['phone'] = 'Hidden'
                    s_user['bio'] = ''
                    s_user['websiteUrl'] = ''
                part_data.append(s_user)

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
                "groupAdminId": chat.group_admin_id,
                "isPublic": getattr(chat, 'is_public', False),
                "isChatDisabled": getattr(chat, 'is_chat_disabled', False),
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
        print(e)
        return jsonify({"error": "Invalid token"}), 401

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

@chats_bp.route('/api/chats/<int:chat_id>/messages', methods=['GET'])
def get_messages(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    if not user_can_access_chat(user_id, chat_id):
        return jsonify({"error": "Forbidden"}), 403

    now = utc_now()
    expired = []
    for message in Message.query.filter(Message.chat_id == chat_id, Message.ttl > 0).all():
        if (now - message.timestamp).total_seconds() > message.ttl:
            expired.append(message)
    for message in expired:
        db.session.delete(message)
    if expired:
        db.session.commit()

    messages = Message.query.filter_by(chat_id=chat_id).order_by(Message.timestamp.asc()).all()
    return jsonify([{
        "id": m.id,
        "senderId": m.sender_id,
        "content": "This message was deleted" if m.deleted_at else m.content,
        "status": m.status or 'sent',
        "type": m.type,
        "timestamp": iso_utc(m.timestamp),
        "ttl": m.ttl,
        "replyToId": m.reply_to_id,
        "replyContent": m.reply_content,
        "replySenderName": m.reply_sender_name,
        "editedAt": iso_utc(m.edited_at),
        "deletedAt": iso_utc(m.deleted_at),
        "readAt": iso_utc(m.read_at),
        "reactions": m.reactions_dict(),
        "isPinned": bool(m.is_pinned)
    } for m in messages])

@chats_bp.route('/api/messages/<int:message_id>', methods=['DELETE'])
def delete_message(message_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    message = Message.query.get(message_id)
    if not message:
        return jsonify({"error": "Message not found"}), 404

    if message.sender_id != user_id:
        return jsonify({"error": "Forbidden"}), 403

    message.content = ''
    message.type = 'deleted'
    message.deleted_at = utc_now()
    db.session.commit()
    payload = {
        "message": "Deleted",
        "id": message.id,
        "chatId": message.chat_id,
        "deletedAt": iso_utc(message.deleted_at)
    }
    emit_message_update(message.chat_id, 'message_deleted', payload)
    return jsonify(payload), 200

@chats_bp.route('/api/messages/<int:message_id>', methods=['PUT'])
def edit_message(message_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    message = Message.query.get(message_id)
    if not message:
        return jsonify({"error": "Message not found"}), 404
    if message.sender_id != user_id or message.deleted_at:
        return jsonify({"error": "Forbidden"}), 403

    data = get_json_data()
    content = data.get('content')
    if content is None:
        return jsonify({"error": "Content is required"}), 400

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
    message = Message.query.get(message_id)
    if not message or not user_can_access_chat(user_id, message.chat_id):
        return jsonify({"error": "Message not found"}), 404
    data = get_json_data()
    emoji = (data.get('emoji') or '').strip()
    reactions = message.reactions_dict()
    key = str(user_id)
    if not emoji or reactions.get(key) == emoji:
        reactions.pop(key, None)
    else:
        reactions[key] = emoji[:12]
    message.reactions = json.dumps(reactions)
    db.session.commit()
    payload = {"id": message.id, "chatId": message.chat_id, "reactions": reactions}
    emit_message_update(message.chat_id, 'message_reaction_update', payload)
    return jsonify(payload)

@chats_bp.route('/api/messages/<int:message_id>/pin', methods=['POST'])
def pin_message(message_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    message = Message.query.get(message_id)
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
        print(f"Error creating group: {e}")
        return jsonify({"error": "Failed to create group"}), 500

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
        print(f"Error fetching public groups: {e}")
        return jsonify({"error": str(e)}), 500

# Search Groups (Public & Private)
@chats_bp.route('/api/groups/search', methods=['POST'])
def search_groups():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = get_json_data()
    query = data.get('query', '').strip()

    if not query:
        return jsonify([])

    try:
        subquery = db.session.query(ChatParticipant.chat_id).filter_by(user_id=user_id).subquery()
        groups = Chat.query.filter(
            Chat.is_group == True,
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
        print(f"Error searching groups: {e}")
        return jsonify({"error": str(e)}), 500

# Join a Group
@chats_bp.route('/api/groups/<int:chat_id>/join', methods=['POST'])
def join_group(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    group = Chat.query.get(chat_id)
    if not group or not group.is_group:
        return jsonify({"error": "Group not found"}), 404

    # Check if already a participant
    existing = ChatParticipant.query.filter_by(chat_id=chat_id, user_id=user_id).first()
    if existing:
        return jsonify({"error": "Already a participant"}), 400

    user = User.query.get(user_id)

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

    group = Chat.query.get(chat_id)
    if not group or not group.is_group:
        return jsonify({"error": "Group not found"}), 404

    if group.group_admin_id != user_id:
        return jsonify({"error": "Only group admin can view requests"}), 403

    from models import GroupJoinRequest
    requests = GroupJoinRequest.query.filter_by(chat_id=chat_id, status='pending').all()

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
    join_req = GroupJoinRequest.query.get(request_id)
    if not join_req:
        return jsonify({"error": "Request not found"}), 404

    group = Chat.query.get(join_req.chat_id)
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
        print(f"Error responding to group request: {e}")
        return jsonify({"error": str(e)}), 500

# Toggle Mute Group (Admin Only)
@chats_bp.route('/api/groups/<int:chat_id>/toggle-chat', methods=['POST'])
def toggle_group_chat(chat_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    group = Chat.query.get(chat_id)
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
        print(f"Error toggling group chat: {e}")
        return jsonify({"error": str(e)}), 500
