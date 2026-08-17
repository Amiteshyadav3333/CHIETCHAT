from utils import get_chat_participant_ids, get_socket_user_id, user_can_access_chat
from .service import normalize_location_update


def register_location_socket_handlers(socketio):
    """Register the location transport while keeping domain validation isolated."""

    @socketio.on('live_location_update')
    def on_live_location_update(data):
        user_id = get_socket_user_id()
        try:
            chat_id = int(data.get('chatId'))
        except (AttributeError, TypeError, ValueError):
            return
        if not user_id or not user_can_access_chat(user_id, chat_id):
            return
        coordinates = normalize_location_update(data)
        if not coordinates:
            return
        payload = {'chatId': chat_id, 'userId': user_id, **coordinates}
        for participant_id in get_chat_participant_ids(chat_id):
            socketio.emit('live_location_update', payload, room=f'user_{participant_id}')
