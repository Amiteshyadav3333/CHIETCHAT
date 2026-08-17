from features.calls import CallInviteRegistry
from features.location import normalize_location_update
from features.polls import normalize_poll_option
import features.location.socket_handlers as location_sockets


def test_location_normalization_rejects_invalid_coordinates():
    assert normalize_location_update({'lat': '28.6', 'lng': '77.2'}) == {'lat': 28.6, 'lng': 77.2}
    assert normalize_location_update({'lat': 91, 'lng': 10}) is None
    assert normalize_location_update({'lat': 'bad', 'lng': 10}) is None


def test_poll_option_contract():
    assert normalize_poll_option('0') == 0
    assert normalize_poll_option(3) == 3
    assert normalize_poll_option(4) is None


def test_call_invite_registry_expiry():
    now = [10.0]
    registry = CallInviteRegistry(ttl_seconds=5, clock=lambda: now[0])
    registry.grant(1, 2)
    assert registry.allows(1, 2)
    now[0] = 16.0
    assert not registry.allows(1, 2)


def test_location_socket_broadcasts_to_every_participant(monkeypatch):
    handlers = {}
    emitted = []

    class FakeSocket:
        def on(self, event):
            return lambda handler: handlers.setdefault(event, handler) or handler

        def emit(self, event, payload, room=None):
            emitted.append((event, payload, room))

    monkeypatch.setattr(location_sockets, 'get_socket_user_id', lambda: 7)
    monkeypatch.setattr(location_sockets, 'user_can_access_chat', lambda user_id, chat_id: True)
    monkeypatch.setattr(location_sockets, 'get_chat_participant_ids', lambda chat_id: [7, 8, 9])
    location_sockets.register_location_socket_handlers(FakeSocket())
    handlers['live_location_update']({'chatId': 4, 'lat': 28.6, 'lng': 77.2})

    assert [room for _, _, room in emitted] == ['user_7', 'user_8', 'user_9']
    assert all(payload['chatId'] == 4 for _, payload, _ in emitted)
