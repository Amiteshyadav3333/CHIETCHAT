import threading
import time


class CallInviteRegistry:
    """Thread-safe, process-local authorization for ephemeral call guests.

    The registry intentionally does not change chat membership. A shared-store
    adapter can replace it later without changing Socket.IO handlers.
    """

    def __init__(self, ttl_seconds=3600, clock=time.monotonic):
        self._ttl_seconds = ttl_seconds
        self._clock = clock
        self._entries = {}
        self._lock = threading.Lock()

    def grant(self, chat_id, user_id):
        with self._lock:
            self._entries[(int(chat_id), int(user_id))] = self._clock() + self._ttl_seconds

    def allows(self, chat_id, user_id):
        key = (int(chat_id), int(user_id))
        with self._lock:
            expires_at = self._entries.get(key, 0)
            if expires_at <= self._clock():
                self._entries.pop(key, None)
                return False
            return True

    def revoke(self, chat_id, user_id):
        with self._lock:
            self._entries.pop((int(chat_id), int(user_id)), None)
