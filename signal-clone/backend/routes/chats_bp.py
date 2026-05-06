from flask import Blueprint, jsonify
from models import db, Chat, ChatParticipant, Message, User
from utils import (
    get_current_user_id, user_can_access_chat, serialize_user, 
    iso_utc, get_json_data, has_contact, is_blocked
)

chats_bp = Blueprint('chats_bp', __name__)

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

    messages = Message.query.filter_by(chat_id=chat_id).order_by(Message.timestamp.asc()).all()
    return jsonify([{
        "id": m.id,
        "senderId": m.sender_id,
        "content": m.content,
        "status": m.status or 'sent',
        "type": m.type,
        "timestamp": iso_utc(m.timestamp),
        "ttl": m.ttl,
        "replyToId": m.reply_to_id,
        "replyContent": m.reply_content,
        "replySenderName": m.reply_sender_name
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

    db.session.delete(message)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200
