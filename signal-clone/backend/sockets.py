from flask import request, current_app
from flask_socketio import emit, join_room, leave_room
from models import db, User, Chat, ChatParticipant, Message
from utils import (
    decode_socket_user_id, utc_now, iso_utc, get_socket_user_id,
    user_can_access_chat, is_user_online, emit_to_user_chat_contacts,
    get_chat_participant_ids, is_blocked
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
            has_updates = False
            for c in chats:
                undelivered = Message.query.filter(
                    Message.chat_id == c.chat_id,
                    Message.sender_id != user_id,
                    Message.status == 'sent'
                ).all()
                for m in undelivered:
                    m.status = 'delivered'
                    m.delivered_at = utc_now()
                    has_updates = True
                    socketio.emit('message_status_update', {
                        "messageId": m.id,
                        "chatId": m.chat_id,
                        "status": 'delivered',
                        "deliveredAt": iso_utc(m.delivered_at)
                    }, room=f"user_{m.sender_id}")
            if has_updates:
                db.session.commit()

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

        chat = Chat.query.get(chat_id)
        if chat and chat.is_group and getattr(chat, 'is_chat_disabled', False):
            if chat.group_admin_id != socket_user_id:
                emit('message_error', {"error": "Only admins can send messages in this group"})
                return

        # Check for blocks in direct chats
        participants = ChatParticipant.query.filter_by(chat_id=chat_id).all()
        if len(participants) == 2:
            other_uid = next(p.user_id for p in participants if p.user_id != socket_user_id)
            if is_blocked(socket_user_id, other_uid):
                emit('message_error', {"error": "Message blocked"})
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
            "ttl": new_msg.ttl,
            "replyToId": new_msg.reply_to_id,
            "replyContent": new_msg.reply_content,
            "replySenderName": new_msg.reply_sender_name,
            "editedAt": None,
            "deletedAt": None,
            "readAt": None,
            "deliveredAt": None,
            "reactions": {},
            "isPinned": False
        }

        participants = ChatParticipant.query.filter_by(chat_id=chat_id).all()
        any_recipient_online = False
        for participant in participants:
            if participant.user_id != socket_user_id and is_user_online(participant.user_id):
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

        if unread:
            for m in unread:
                m.status = 'read'
                m.read_at = utc_now()
                socketio.emit('message_status_update', {
                    "messageId": m.id,
                    "chatId": m.chat_id,
                    "status": 'read',
                    "readAt": iso_utc(m.read_at)
                }, room=f"user_{m.sender_id}")
            db.session.commit()

    @socketio.on('typing')
    def on_typing(data):
        user_id = get_socket_user_id()
        chat_id = data.get('chatId')
        if not user_id or not chat_id or not user_can_access_chat(user_id, chat_id):
            return
        user = User.query.get(user_id)
        socketio.emit('typing_update', {
            "chatId": chat_id,
            "userId": user_id,
            "username": user.username if user else "Someone",
            "isTyping": bool(data.get('isTyping'))
        }, room=str(chat_id), include_self=False)

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

    @socketio.on('transition_call')
    def on_transition_call(data):
        user_id = get_socket_user_id()
        if not user_id:
            return
        chat_id = data.get('chatId')
        new_chat_id = data.get('newChatId')
        if chat_id and new_chat_id:
            room = f"call_{chat_id}"
            socketio.emit('call_transitioned', {"newChatId": new_chat_id}, room=room, include_self=False)

    @socketio.on('invite_to_call')
    def on_invite_to_call(data):
        user_id = get_socket_user_id()
        if not user_id:
            return
        chat_id = data.get('chatId')
        target_uid = data.get('userId')
        call_type = data.get('callType', 'video')
        if chat_id and target_uid:
            caller = User.query.get(user_id)
            socketio.emit('incoming_call', {
                "chatId": chat_id,
                "callerName": caller.username if caller else 'Unknown',
                "callerId": user_id,
                "callType": call_type,
                "isGroupCall": True
            }, room=f"user_{target_uid}")

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

    @socketio.on('screen_share_started')
    def on_screen_share_started(data):
        if not get_socket_user_id() or not data.get('to'):
            return
        socketio.emit('screen_share_started', data, room=data['to'])

    @socketio.on('screen_share_stopped')
    def on_screen_share_stopped(data):
        if not get_socket_user_id() or not data.get('to'):
            return
        socketio.emit('screen_share_stopped', data, room=data['to'])

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
        
        # Check receiver presence
        other_uids = [uid for uid in participant_ids if uid != caller_id]
        is_recipient_online = any(is_user_online(uid) for uid in other_uids) if other_uids else False
        
        # Emit ring status to caller immediately
        emit('ring_status', {
            "chatId": chat_id,
            "status": "ringing" if is_recipient_online else "calling"
        })

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
            "chatId": chat_id,
            "deliveredAt": None
        }
        any_recipient_online = False
        for uid in participant_ids:
            if uid != caller_id and is_user_online(uid):
                any_recipient_online = True
                break

        if any_recipient_online:
            new_msg.status = 'delivered'
            new_msg.delivered_at = utc_now()
            db.session.commit()
            msg_payload["status"] = 'delivered'
            msg_payload["deliveredAt"] = iso_utc(new_msg.delivered_at)

        for uid in participant_ids:
            socketio.emit('receive_message', msg_payload, room=f"user_{uid}")

    @socketio.on('confirm_ring')
    def on_confirm_ring(data):
        caller_id = data.get('callerId')
        chat_id = data.get('chatId')
        if caller_id and chat_id:
            socketio.emit('peer_ringing', {
                "chatId": chat_id,
                "peerId": get_socket_user_id()
            }, room=f"user_{caller_id}")


    @socketio.on('live_location_update')
    def on_live_location_update(data):
        user_id = get_socket_user_id()
        chat_id = data.get('chatId')
        if not user_id or not chat_id or not user_can_access_chat(user_id, chat_id):
            return
        
        # Broadcast the update to all participants in the chat
        socketio.emit('live_location_update', {
            "chatId": chat_id,
            "userId": user_id,
            "lat": data.get('lat'),
            "lng": data.get('lng')
        }, room=str(chat_id))

    @socketio.on('game_move')
    def on_game_move(data):
        user_id = get_socket_user_id()
        chat_id = data.get('chatId')
        if not user_id or not chat_id or not user_can_access_chat(user_id, chat_id):
            return
        
        # Broadcast the move to all participants in this chat
        from models import ChatParticipant
        participants = ChatParticipant.query.filter_by(chat_id=chat_id).all()
        for participant in participants:
            socketio.emit('game_move_received', data, room=f"user_{participant.user_id}")
