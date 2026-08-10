from flask import request, current_app
from flask_socketio import emit, join_room, leave_room
from models import db, User, Chat, ChatParticipant, Message, CallRecord
import json
from utils import (
    decode_socket_user_id, utc_now, iso_utc, get_socket_user_id,
    user_can_access_chat, is_user_online, emit_to_user_chat_contacts,
    get_chat_participant_ids, is_blocked, send_push_notification, claim_upload_asset
)
from extensions import socket_users, user_connection_counts, socket_presence_lock
from scheduled_messages import valid_encrypted_envelope
import datetime
import time
import threading
from collections import defaultdict, deque

ALLOWED_MESSAGE_TYPES = {
    'text', 'image', 'video', 'video_note', 'audio', 'file', 'gif', 'sticker',
    'location', 'live_location', 'contact', 'poll', 'game', 'gift', 'birthday',
    'ride', 'payment', 'business_auto_reply',
    'drawing',
}
MIN_MESSAGE_TTL = 1
MAX_MESSAGE_TTL = 315360000
_call_signal_windows = defaultdict(deque)
_call_signal_windows_lock = threading.Lock()

def register_socket_events(socketio):
    def allow_call_signal(user_id):
        redis_client = current_app.extensions.get('cheetchat_redis')
        if redis_client is not None:
            try:
                key = f'cheetchat:call-signal-rate:{user_id}'
                count = redis_client.eval(
                    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
                    1, key,
                )
                return count <= 600
            except Exception:
                current_app.logger.exception('Call signaling rate limiter unavailable')
                if current_app.config.get('IS_PRODUCTION'):
                    return False
        now = time.monotonic()
        with _call_signal_windows_lock:
            window = _call_signal_windows[user_id]
            while window and window[0] <= now - 60:
                window.popleft()
            if len(window) >= 600:
                return False
            window.append(now)
            return True

    def valid_session_description(data, field, expected_type):
        description = data.get(field) if isinstance(data, dict) else None
        return bool(
            isinstance(description, dict) and description.get('type') == expected_type and
            isinstance(description.get('sdp'), str) and 0 < len(description['sdp']) <= 100_000
        )

    def sanitized_candidate(data):
        candidate = data.get('candidate') if isinstance(data, dict) else None
        if not isinstance(candidate, dict):
            return None
        value = candidate.get('candidate')
        mid = candidate.get('sdpMid')
        line = candidate.get('sdpMLineIndex')
        if not isinstance(value, str) or len(value) > 4096:
            return None
        if mid is not None and (not isinstance(mid, str) or len(mid) > 256):
            return None
        if line is not None and (not isinstance(line, int) or isinstance(line, bool) or line < 0 or line > 100):
            return None
        return {'candidate': value, 'sdpMid': mid, 'sdpMLineIndex': line}

    def allow_message_send(user_id):
        redis_client = current_app.extensions.get('cheetchat_redis')
        if redis_client is not None:
            try:
                key = f'cheetchat:socket-message-rate:v2:{user_id}'
                count = redis_client.eval(
                    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n",
                    1, key,
                )
                return count <= 120
            except Exception:
                current_app.logger.exception('Socket message rate limiter unavailable')
                if current_app.config.get('IS_PRODUCTION'):
                    return False
        cutoff = utc_now() - datetime.timedelta(minutes=1)
        return Message.query.filter(
            Message.sender_id == user_id, Message.timestamp >= cutoff,
        ).count() < 120

    def authorized_call_target(data):
        """Allow signaling only between sockets inside the same authorized call."""
        if not isinstance(data, dict):
            return False
        user_id = get_socket_user_id()
        target_sid = str(data.get('to') or '')
        try:
            chat_id = int(data.get('chatId'))
        except (TypeError, ValueError):
            return False
        if not user_id or not target_sid or not user_can_access_chat(user_id, chat_id):
            return False
        room = f"call_{chat_id}"
        members = socketio.server.manager.get_participants('/', room)
        member_sids = {item[0] if isinstance(item, tuple) else item for item in members}
        with socket_presence_lock:
            target_connected = socket_users.get(target_sid) is not None
        return (
            request.sid in member_sids and target_sid in member_sids and
            target_connected and allow_call_signal(user_id)
        )

    def acquire_call_ring_cooldown(user_id, chat_id):
        """Allow one call-start notification per user/chat every 30 seconds."""
        redis_client = current_app.extensions.get('cheetchat_redis')
        if redis_client is not None:
            try:
                return bool(redis_client.set(
                    f'cheetchat:call-ring:{user_id}:{chat_id}', '1', nx=True, ex=30
                ))
            except Exception:
                current_app.logger.exception('Call ring rate limiter unavailable')
                if current_app.config.get('IS_PRODUCTION'):
                    return False
        cutoff = utc_now() - datetime.timedelta(seconds=30)
        recent = CallRecord.query.filter(
            CallRecord.chat_id == chat_id,
            CallRecord.caller_id == user_id,
            CallRecord.started_at >= cutoff,
        ).first()
        return recent is None

    @socketio.on('connect')
    def on_connect(auth):
        user_id = decode_socket_user_id(auth, current_app.config['JWT_SECRET_KEY'])
        if not user_id:
            return False
        user_id = int(user_id)
        with socket_presence_lock:
            socket_users[request.sid] = user_id
            user_connection_counts[user_id] = user_connection_counts.get(user_id, 0) + 1

        user = db.session.get(User, user_id)
        if not user:
            with socket_presence_lock:
                socket_users.pop(request.sid, None)
                user_connection_counts[user_id] = max(user_connection_counts.get(user_id, 1) - 1, 0)
            return False
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
            "lastSeen": iso_utc(user.last_seen)
        })

    @socketio.on('disconnect')
    def on_disconnect():
        with socket_presence_lock:
            user_id = socket_users.pop(request.sid, None)
        if not user_id:
            return

        with socket_presence_lock:
            user_connection_counts[user_id] = max(user_connection_counts.get(user_id, 1) - 1, 0)
            went_offline = user_connection_counts[user_id] == 0
            if went_offline:
                user_connection_counts.pop(user_id, None)
        if went_offline:
            user = db.session.get(User, user_id)
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
            return {"ok": False, "error": "Unauthorized"}

        if not isinstance(data, dict):
            return {"ok": False, "error": "Invalid message data", "retryable": False}
        chat_id = data.get('chatId')
        content = data.get('content')

        if not chat_id or content is None:
            emit('message_error', {"error": "Invalid message data"})
            return {"ok": False, "error": "Invalid message data"}

        try:
            chat_id = int(chat_id)
        except (TypeError, ValueError):
            emit('message_error', {"error": "Invalid message data"})
            return {"ok": False, "error": "Invalid message data"}

        if not user_can_access_chat(socket_user_id, chat_id):
            emit('message_error', {"error": "Sender is not a chat participant"})
            return {"ok": False, "error": "Sender is not a chat participant"}

        chat = db.session.get(Chat, chat_id)
        if chat and chat.is_group and getattr(chat, 'is_chat_disabled', False):
            if chat.group_admin_id != socket_user_id:
                emit('message_error', {"error": "Only admins can send messages in this group"})
                return {"ok": False, "error": "Only admins can send messages in this group"}

        # Check for blocks in direct chats
        participants = ChatParticipant.query.filter_by(chat_id=chat_id).all()
        if len(participants) == 2:
            other_uid = next(p.user_id for p in participants if p.user_id != socket_user_id)
            if is_blocked(socket_user_id, other_uid):
                emit('message_error', {"error": "Message blocked"})
                return {"ok": False, "error": "Message blocked"}

        participant_ids = {str(participant.user_id) for participant in participants}
        if not valid_encrypted_envelope(content):
            return {"ok": False, "error": "A valid encrypted message envelope is required", "retryable": False}
        try:
            envelope_recipient_ids = set(json.loads(content)['recipients'])
        except (TypeError, ValueError, KeyError):
            return {"ok": False, "error": "Invalid encrypted message envelope", "retryable": False}
        if not participant_ids.issubset(envelope_recipient_ids):
            return {"ok": False, "error": "Encrypted envelope is missing a chat participant", "retryable": False}

        client_message_id = str(data.get('clientMessageId') or '').strip()[:100] or None
        if not client_message_id:
            return {"ok": False, "error": "clientMessageId is required", "retryable": False}
        asset_id = str(data.get('assetId') or '').strip() or None
        message_type = str(data.get('type') or 'text')
        if message_type not in ALLOWED_MESSAGE_TYPES:
            return {"ok": False, "error": "Unsupported message type", "retryable": False}
        try:
            ttl = int(data.get('ttl') or 0)
        except (TypeError, ValueError):
            return {"ok": False, "error": "Invalid disappearing-message duration", "retryable": False}
        if ttl != 0 and not (MIN_MESSAGE_TTL <= ttl <= MAX_MESSAGE_TTL):
            return {"ok": False, "error": "Invalid disappearing-message duration", "retryable": False}
        snap_mode = bool(getattr(chat, 'snap_mode', False)) or data.get('snapMode') is True
        if snap_mode:
            ttl = 7 * 24 * 60 * 60
        allowed_asset_kinds = {
            'image': {'image'}, 'video': {'video'}, 'video_note': {'video'},
            'audio': {'audio'}, 'file': {'document'},
        }.get(message_type)
        if asset_id and not allowed_asset_kinds:
            return {"ok": False, "error": "Upload asset is not valid for this message type", "retryable": False}
        if client_message_id:
            existing = Message.query.filter_by(
                sender_id=socket_user_id, chat_id=chat_id, client_message_id=client_message_id
            ).first()
            if existing:
                if asset_id:
                    try:
                        claim_upload_asset(
                            asset_id, socket_user_id, 'message', existing.id, allowed_asset_kinds
                        )
                        db.session.commit()
                    except ValueError as error:
                        db.session.rollback()
                        return {"ok": False, "error": str(error), "retryable": False}
                return {"ok": True, "messageId": existing.id, "duplicate": True}

        if not allow_message_send(socket_user_id):
            return {"ok": False, "error": "Message rate limit exceeded", "retryable": True}

        reply_to_id = data.get('replyToId')
        if reply_to_id is not None:
            try:
                reply_to_id = int(reply_to_id)
            except (TypeError, ValueError):
                return {"ok": False, "error": "Invalid reply target", "retryable": False}
            reply_target = db.session.get(Message, reply_to_id)
            if not reply_target or reply_target.chat_id != chat_id:
                return {"ok": False, "error": "Invalid reply target", "retryable": False}

        new_msg = Message(
            chat_id=chat_id,
            sender_id=socket_user_id,
            client_message_id=client_message_id,
            content=content,
            type=message_type,
            ttl=ttl,
            snap_mode=snap_mode,
            snap_expires_at=None,
            reply_to_id=reply_to_id,
            # Reply preview plaintext must never bypass the encrypted envelope.
            reply_content=None,
            reply_sender_name=None,
        )
        db.session.add(new_msg)
        try:
            db.session.flush()
            if asset_id:
                claim_upload_asset(asset_id, socket_user_id, 'message', new_msg.id, allowed_asset_kinds)
            db.session.commit()
        except ValueError as error:
            db.session.rollback()
            return {"ok": False, "error": str(error), "retryable": False}

        payload = {
            "id": new_msg.id,
            "clientMessageId": new_msg.client_message_id,
            "senderId": new_msg.sender_id,
            "content": new_msg.content,
            "status": new_msg.status,
            "type": new_msg.type,
            "timestamp": iso_utc(new_msg.timestamp),
            "chatId": chat_id,
            "ttl": new_msg.ttl,
            "snapMode": bool(new_msg.snap_mode),
            "snapExpiresAt": iso_utc(new_msg.snap_expires_at),
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
            if participant.user_id != socket_user_id and not is_user_online(participant.user_id):
                socketio.start_background_task(
                    send_push_notification, participant.user_id, 'CHEETCHAT',
                    'New encrypted message', f'/?chat={chat_id}'
                )

        return {"ok": True, "messageId": new_msg.id, "duplicate": False}

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
        user = db.session.get(User, user_id)
        socketio.emit('typing_update', {
            "chatId": chat_id,
            "userId": user_id,
            "username": user.username if user else "Someone",
            "isTyping": bool(data.get('isTyping'))
        }, room=str(chat_id), include_self=False)

    @socketio.on('set_snap_mode')
    def on_set_snap_mode(data):
        user_id = get_socket_user_id()
        try:
            chat_id = int(data.get('chatId'))
        except (TypeError, ValueError, AttributeError):
            return {"ok": False, "error": "Invalid chat"}
        if not user_id or not user_can_access_chat(user_id, chat_id):
            return {"ok": False, "error": "Forbidden"}
        chat = db.session.get(Chat, chat_id)
        if not chat:
            return {"ok": False, "error": "Chat not found"}
        chat.snap_mode = data.get('enabled') is True
        snap_expires_at = None
        if not chat.snap_mode:
            snap_expires_at = utc_now() + datetime.timedelta(minutes=10)
            Message.query.filter(
                Message.chat_id == chat_id,
                Message.snap_mode.is_(True),
                Message.snap_expires_at.is_(None),
            ).update({Message.snap_expires_at: snap_expires_at}, synchronize_session=False)
        db.session.commit()
        initiator = db.session.get(User, user_id)
        payload = {
            "chatId": chat_id,
            "enabled": bool(chat.snap_mode),
            "snapExpiresAt": iso_utc(snap_expires_at),
            "initiatedBy": user_id,
            "initiatorName": initiator.username if initiator else "A participant",
        }
        # User rooms reach every participant even when that chat is not open.
        # This makes the privacy warning immediate on all connected devices.
        for participant_id in get_chat_participant_ids(chat_id):
            socketio.emit('snap_mode_update', payload, room=f"user_{participant_id}")
        return {"ok": True, **payload}

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
        # Enforce the product limit on the server as well as in the UI. A set is
        # used because the Socket.IO manager can return namespace/socket tuples.
        participants = list(socketio.server.manager.get_participants('/', room))
        participant_sids = {item[0] if isinstance(item, tuple) else item for item in participants}
        if request.sid not in participant_sids and len(participant_sids) >= 10:
            emit('call_error', {
                "error": "This call is full (maximum 10 people).",
                "code": "CALL_FULL"
            })
            return

        join_room(room)
        active_record = CallRecord.query.filter(
            CallRecord.chat_id == chat_id,
            CallRecord.status == 'ringing',
            CallRecord.started_at >= utc_now() - datetime.timedelta(hours=2),
        ).order_by(CallRecord.started_at.desc()).first()
        if active_record and active_record.caller_id != user_id:
            active_record.status = 'active'
            active_record.answered_at = active_record.answered_at or utc_now()
            db.session.commit()
        socketio.emit('user_joined_call', {
            "userId": user_id,
            "socketId": request.sid,
            "participantCount": len(participant_sids) + 1
        }, room=room, include_self=False)

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
        active_record = CallRecord.query.filter(
            CallRecord.chat_id == chat_id,
            CallRecord.status.in_(('ringing', 'active')),
        ).order_by(CallRecord.started_at.desc()).first()
        if active_record and active_record.caller_id == user_id:
            active_record.status = 'ended'
            active_record.ended_at = utc_now()
            db.session.commit()
        socketio.emit('user_left_call', {"userId": user_id, "socketId": request.sid}, room=room, include_self=False)

    @socketio.on('transition_call')
    def on_transition_call(data):
        user_id = get_socket_user_id()
        try:
            chat_id = int(data['chatId'])
            new_chat_id = int(data['newChatId'])
        except (KeyError, TypeError, ValueError):
            emit('call_error', {"error": "Invalid call transition"})
            return
        room = f"call_{chat_id}"
        members = socketio.server.manager.get_participants('/', room)
        member_sids = {item[0] if isinstance(item, tuple) else item for item in members}
        if (
            not user_id
            or request.sid not in member_sids
            or not user_can_access_chat(user_id, chat_id)
            or not user_can_access_chat(user_id, new_chat_id)
        ):
            emit('call_error', {"error": "Forbidden call transition"})
            return
        socketio.emit('call_transitioned', {"newChatId": new_chat_id}, room=room, include_self=False)

    @socketio.on('invite_to_call')
    def on_invite_to_call(data):
        user_id = get_socket_user_id()
        try:
            chat_id = int(data['chatId'])
            target_uid = int(data['userId'])
        except (KeyError, TypeError, ValueError):
            emit('call_error', {"error": "Invalid call invitation"})
            return
        participant_ids = get_chat_participant_ids(chat_id)
        if not user_id or user_id not in participant_ids or target_uid not in participant_ids or target_uid == user_id:
            emit('call_error', {"error": "Forbidden call invitation"})
            return
        call_type = data.get('callType') if data.get('callType') in ('voice', 'video') else 'video'
        caller = db.session.get(User, user_id)
        socketio.emit('incoming_call', {
            "chatId": chat_id,
            "callerName": caller.username if caller else 'Unknown',
            "callerId": user_id,
            "callType": call_type,
            "isGroupCall": True
        }, room=f"user_{target_uid}")

    @socketio.on('offer')
    def on_offer(data):
        if not authorized_call_target(data) or not valid_session_description(data, 'offer', 'offer'):
            emit('call_error', {"error": "Forbidden signaling target"})
            return
        socketio.emit('offer', {
            'chatId': int(data['chatId']), 'to': data['to'], 'from': get_socket_user_id(),
            'fromSocket': request.sid, 'offer': data['offer'],
        }, room=data['to'])

    @socketio.on('answer')
    def on_answer(data):
        if not authorized_call_target(data) or not valid_session_description(data, 'answer', 'answer'):
            emit('call_error', {"error": "Forbidden signaling target"})
            return
        socketio.emit('answer', {
            'chatId': int(data['chatId']), 'to': data['to'], 'from': get_socket_user_id(),
            'fromSocket': request.sid, 'answer': data['answer'],
        }, room=data['to'])

    @socketio.on('ice_candidate')
    def on_ice_candidate(data):
        candidate = sanitized_candidate(data)
        if not authorized_call_target(data) or candidate is None:
            emit('call_error', {"error": "Forbidden signaling target"})
            return
        socketio.emit('ice_candidate', {
            'chatId': int(data['chatId']), 'to': data['to'],
            'fromSocket': request.sid, 'candidate': candidate,
        }, room=data['to'])

    @socketio.on('request_video_upgrade')
    def on_request_video_upgrade(data):
        if not authorized_call_target(data):
            return
        socketio.emit('request_video_upgrade', {
            'chatId': int(data['chatId']), 'fromSocket': request.sid,
        }, room=data['to'])

    @socketio.on('video_upgrade_accepted')
    def on_video_upgrade_accepted(data):
        if not authorized_call_target(data):
            return
        socketio.emit('video_upgrade_accepted', {
            'chatId': int(data['chatId']), 'fromSocket': request.sid,
        }, room=data['to'])

    @socketio.on('screen_share_started')
    def on_screen_share_started(data):
        if not authorized_call_target(data):
            return
        socketio.emit('screen_share_started', {
            'chatId': int(data['chatId']), 'fromSocket': request.sid,
        }, room=data['to'])

    @socketio.on('screen_share_stopped')
    def on_screen_share_stopped(data):
        if not authorized_call_target(data):
            return
        socketio.emit('screen_share_stopped', {
            'chatId': int(data['chatId']), 'fromSocket': request.sid,
        }, room=data['to'])

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

        if not acquire_call_ring_cooldown(caller_id, chat_id):
            emit('ring_status', {
                "chatId": chat_id,
                "status": "ringing",
                "duplicate": True,
            })
            return

        caller = db.session.get(User, caller_id)
        participant_ids = get_chat_participant_ids(chat_id)
        call_type = data.get('callType') if data.get('callType') in ('voice', 'video') else 'video'
        call_record = CallRecord(
            chat_id=chat_id, caller_id=caller_id, call_type=call_type,
            status='ringing', started_at=utc_now(),
        )
        db.session.add(call_record)
        db.session.commit()
        
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
                    "callType": call_type
                }, room=f"user_{uid}")

        for uid in participant_ids:
            socketio.emit('call_started', {
                'chatId': chat_id, 'callerId': caller_id,
                'callType': call_type, 'callId': call_record.id,
                'timestamp': iso_utc(utc_now()),
            }, room=f"user_{uid}")

    @socketio.on('confirm_ring')
    def on_confirm_ring(data):
        peer_id = get_socket_user_id()
        try:
            caller_id = int(data['callerId'])
            chat_id = int(data['chatId'])
        except (KeyError, TypeError, ValueError):
            return
        participant_ids = get_chat_participant_ids(chat_id)
        if not peer_id or peer_id == caller_id or peer_id not in participant_ids or caller_id not in participant_ids:
            return
        recent_call = CallRecord.query.filter(
            CallRecord.chat_id == chat_id, CallRecord.caller_id == caller_id,
            CallRecord.status == 'ringing',
            CallRecord.started_at >= utc_now() - datetime.timedelta(minutes=2),
        ).first()
        if not recent_call:
            return
        socketio.emit('peer_ringing', {
            "chatId": chat_id, "peerId": peer_id, "callId": recent_call.id,
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
