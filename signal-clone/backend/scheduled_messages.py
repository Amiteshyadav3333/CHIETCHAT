import json
import datetime

from extensions import socketio
from models import db, Chat, ChatParticipant, Message, ScheduledMessage
from utils import iso_utc, is_blocked, is_user_online, send_push_notification, utc_now


def valid_encrypted_envelope(value):
    if not isinstance(value, str) or not value or len(value.encode('utf-8')) > 2_000_000:
        return False
    try:
        envelope = json.loads(value)
    except (TypeError, ValueError):
        return False
    recipients = envelope.get('recipients') if isinstance(envelope, dict) else None
    return bool(
        envelope.get('encrypted') is True and isinstance(recipients, dict) and
        0 < len(recipients) <= 1000 and
        all(isinstance(key, str) and key.isdigit() and isinstance(wrapped, str) and wrapped
            for key, wrapped in recipients.items()) and
        isinstance(envelope.get('iv'), str) and envelope.get('iv') and
        isinstance(envelope.get('data'), str) and envelope.get('data')
    )


def scheduled_delivery_allowed(item):
    chat = db.session.get(Chat, item.chat_id)
    participants = ChatParticipant.query.filter_by(chat_id=item.chat_id).all()
    participant_ids = {participant.user_id for participant in participants}
    if not chat or item.sender_id not in participant_ids:
        return False, participants
    if chat.is_group and chat.is_chat_disabled and chat.group_admin_id != item.sender_id:
        return False, participants
    if len(participants) == 2:
        other_id = next(user_id for user_id in participant_ids if user_id != item.sender_id)
        if is_blocked(item.sender_id, other_id):
            return False, participants
    return True, participants


def message_payload(message):
    return {
        'id': message.id, 'clientMessageId': message.client_message_id,
        'senderId': message.sender_id, 'content': message.content,
        'status': message.status, 'type': message.type,
        'timestamp': iso_utc(message.timestamp), 'chatId': message.chat_id,
        'ttl': message.ttl, 'replyToId': None, 'replyContent': None,
        'replySenderName': None, 'editedAt': None, 'deletedAt': None,
        'readAt': None, 'deliveredAt': iso_utc(message.delivered_at),
        'reactions': {}, 'isPinned': False,
    }


def deliver_due_scheduled_messages(limit=100):
    now = utc_now()
    stale_ids = [row.id for row in ScheduledMessage.query.filter(
        ScheduledMessage.status.in_(('delivered', 'cancelled')),
        ScheduledMessage.created_at < now - datetime.timedelta(days=7),
    ).order_by(ScheduledMessage.id.asc()).limit(limit).all()]
    if stale_ids:
        ScheduledMessage.query.filter(ScheduledMessage.id.in_(stale_ids)).delete(synchronize_session=False)
        db.session.commit()
    query = ScheduledMessage.query.filter(
        ScheduledMessage.status == 'pending', ScheduledMessage.scheduled_for <= now,
    ).order_by(ScheduledMessage.scheduled_for.asc()).limit(limit)
    if db.engine.dialect.name == 'postgresql':
        query = query.with_for_update(skip_locked=True)
    items = query.all()
    deliveries = []
    for item in items:
        allowed, participants = scheduled_delivery_allowed(item)
        if not allowed:
            item.status = 'cancelled'
            item.encrypted_content = ''
            continue
        existing = Message.query.filter_by(
            sender_id=item.sender_id, client_message_id=item.client_message_id,
        ).first()
        if existing:
            item.status = 'delivered'
            item.delivered_message_id = existing.id
            item.delivered_at = item.delivered_at or now
            item.encrypted_content = ''
            continue
        message = Message(
            chat_id=item.chat_id, sender_id=item.sender_id,
            client_message_id=item.client_message_id, content=item.encrypted_content,
            type=item.type, ttl=item.ttl, timestamp=now,
        )
        if any(p.user_id != item.sender_id and is_user_online(p.user_id) for p in participants):
            message.status = 'delivered'
            message.delivered_at = now
        db.session.add(message)
        db.session.flush()
        item.status = 'delivered'
        item.delivered_message_id = message.id
        item.delivered_at = now
        item.encrypted_content = ''
        deliveries.append((message, [participant.user_id for participant in participants]))
    db.session.commit()

    for message, participant_ids in deliveries:
        payload = message_payload(message)
        for participant_id in participant_ids:
            socketio.emit('receive_message', payload, room=f'user_{participant_id}')
            if participant_id != message.sender_id and not is_user_online(participant_id):
                socketio.start_background_task(
                    send_push_notification, participant_id, 'CHEETCHAT',
                    'New encrypted message', f'/?chat={message.chat_id}',
                )
    return {'processed': len(items), 'delivered': len(deliveries), 'pruned': len(stale_ids)}
