from flask import request, current_app
from flask_socketio import emit, join_room, leave_room
from models import db, User, ChatParticipant, Message
from utils import (
    decode_socket_user_id, utc_now, iso_utc, get_socket_user_id,
    user_can_access_chat, is_user_online, emit_to_user_chat_contacts,
    get_chat_participant_ids
)
from extensions import socket_users, user_connection_counts

def register_socket_events(socketio):
    @socketio.on('connect')
    def on_connect(auth):
        user_id = decode_socket_user_id(auth, current_app.config['JWT_SECRET_KEY'])
        if user_id:
            user_id = int(user_id)
            socket_users[request.sid] = user_id
            user_connection_counts[user_id] = user_connection_counts.get(user_id, 0) + 1

            user = User.query.get(user_id)
            if user:
                user.last_seen = utc_now()
                db.session.commit()

            join_room(f"user_{user_id}")
            
            # Mark all pending messages as delivered
            chats = ChatParticipant.query.filter_by(user_id=user_id).all()
            for c in chats:
                undelivered = Message.query.filter(
                    Message.chat_id == c.chat_id,
                    Message.sender_id != user_id,
                    Message.status == 'sent'
                ).all()
                for m in undelivered:
                    m.status = 'delivered'
                    db.session.commit()
                    socketio.emit('message_status_update', {
                        "messageId": m.id,
                        "chatId": m.chat_id,
                        "status": 'delivered'
                    }, room=f"user_{m.sender_id}")

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

        if not user_can_access_chat(user_id, chat_id):
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

        if not user_can_access_chat(socket_user_id, chat_id):
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
            "status": new_msg.status,
            "type": new_msg.type,
            "timestamp": iso_utc(new_msg.timestamp),
            "chatId": chat_id,
            "replyToId": new_msg.reply_to_id,
            "replyContent": new_msg.reply_content,
            "replySenderName": new_msg.reply_sender_name
        }

        participants = ChatParticipant.query.filter_by(chat_id=chat_id).all()
        for participant in participants:
            # Check if recipient is online
            if participant.user_id != socket_user_id and is_user_online(participant.user_id):
                new_msg.status = 'delivered'
                db.session.commit()
                payload["status"] = 'delivered'
            
            socketio.emit('receive_message', payload, room=f"user_{participant.user_id}")

    @socketio.on('mark_read')
    def on_mark_read(data):
        user_id = get_socket_user_id()
        chat_id = data.get('chatId')
        if not user_id or not chat_id:
            return

        unread = Message.query.filter(
            Message.chat_id == chat_id,
            Message.sender_id != user_id,
            Message.status != 'read'
        ).all()

        for m in unread:
            m.status = 'read'
            db.session.commit()
            socketio.emit('message_status_update', {
                "messageId": m.id,
                "chatId": m.chat_id,
                "status": 'read'
            }, room=f"user_{m.sender_id}")

    @socketio.on('join_call')
    def on_join_call(data):
        user_id = get_socket_user_id()
        try:
            chat_id = int(data['chatId'])
        except (KeyError, TypeError, ValueError):
            emit('call_error', {"error": "Invalid call data"})
            return

        if not user_id or not user_can_access_chat(user_id, chat_id):
            emit('call_error', {"error": "Forbidden"})
            return

        room = f"call_{chat_id}"
        join_room(room)
        socketio.emit('user_joined_call', {"userId": user_id, "socketId": request.sid}, room=room, include_self=False)

    @socketio.on('leave_call')
    def on_leave_call(data):
        user_id = get_socket_user_id()
        try:
            chat_id = int(data['chatId'])
        except (KeyError, TypeError, ValueError):
            return

        if not user_id or not user_can_access_chat(user_id, chat_id):
            return

        room = f"call_{chat_id}"
        leave_room(room)
        socketio.emit('user_left_call', {"userId": user_id, "socketId": request.sid}, room=room, include_self=False)
        socketio.emit('call_ended', {"userId": user_id}, room=room, include_self=False)

    @socketio.on('offer')
    def on_offer(data):
        if not get_socket_user_id():
            emit('call_error', {"error": "Unauthorized"})
            return
        if not data.get('to'):
            emit('call_error', {"error": "Invalid call data"})
            return
        socketio.emit('offer', data, room=data['to'])

    @socketio.on('answer')
    def on_answer(data):
        if not get_socket_user_id():
            emit('call_error', {"error": "Unauthorized"})
            return
        if not data.get('to'):
            emit('call_error', {"error": "Invalid call data"})
            return
        socketio.emit('answer', data, room=data['to'])

    @socketio.on('ice_candidate')
    def on_ice_candidate(data):
        if not get_socket_user_id():
            emit('call_error', {"error": "Unauthorized"})
            return
        if not data.get('to'):
            emit('call_error', {"error": "Invalid call data"})
            return
        socketio.emit('ice_candidate', data, room=data['to'])

    @socketio.on('request_video_upgrade')
    def on_request_video_upgrade(data):
        if not get_socket_user_id():
            return
        if not data.get('to'):
            return
        socketio.emit('request_video_upgrade', data, room=data['to'])

    @socketio.on('video_upgrade_accepted')
    def on_video_upgrade_accepted(data):
        if not get_socket_user_id():
            return
        if not data.get('to'):
            return
        socketio.emit('video_upgrade_accepted', data, room=data['to'])

    @socketio.on('notify_ring')
    def on_notify_ring(data):
        caller_id = get_socket_user_id()
        try:
            chat_id = int(data['chatId'])
        except (KeyError, TypeError, ValueError):
            emit('call_error', {"error": "Invalid call data"})
            return

        if not caller_id or not user_can_access_chat(caller_id, chat_id):
            emit('call_error', {"error": "Forbidden"})
            return

        caller = User.query.get(caller_id)
        participant_ids = get_chat_participant_ids(chat_id)
        for uid in participant_ids:
            if uid != caller_id:
                socketio.emit('incoming_call', {
                    "chatId": chat_id,
                    "callerName": caller.username if caller else data.get('callerName', 'Unknown'),
                    "callerId": caller_id,
                    "callType": data.get('callType', 'video')
                }, room=f"user_{uid}")

        # Send a message to the chat that a call was started
        call_type_label = data.get('callType', 'video').capitalize()
        new_msg = Message(
            chat_id=chat_id,
            sender_id=caller_id,
            content=f"📞 {call_type_label} call started",
            type='text',
            status='sent'
        )
        db.session.add(new_msg)
        db.session.commit()

        msg_payload = {
            "id": new_msg.id,
            "senderId": caller_id,
            "content": new_msg.content,
            "status": 'sent',
            "type": 'text',
            "timestamp": iso_utc(new_msg.timestamp),
            "chatId": chat_id
        }
        for uid in participant_ids:
            if is_user_online(uid) and uid != caller_id:
                new_msg.status = 'delivered'
                db.session.commit()
                msg_payload["status"] = 'delivered'
            socketio.emit('receive_message', msg_payload, room=f"user_{uid}")
