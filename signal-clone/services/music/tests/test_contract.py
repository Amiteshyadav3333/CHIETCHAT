import hashlib
import hmac
import json
import os
import time
import unittest
from unittest.mock import patch

from app import app


class MusicServiceContractTests(unittest.TestCase):
    def setUp(self):
        self.secret = 'test-music-internal-key-' * 2
        self.env = patch.dict(os.environ, {'MUSIC_SERVICE_HMAC_KEY': self.secret})
        self.env.start()
        self.client = app.test_client()

    def tearDown(self):
        self.env.stop()

    def headers_for(self, body, timestamp=None):
        timestamp = str(timestamp or int(time.time()))
        request_id = 'a' * 32
        body_hash = hashlib.sha256(body).hexdigest()
        message = f'{timestamp}\n{request_id}\nPOST\n/internal/v1/music/search\n{body_hash}'
        signature = hmac.new(self.secret.encode(), message.encode(), hashlib.sha256).hexdigest()
        return {
            'Content-Type': 'application/json',
            'X-Internal-Timestamp': timestamp,
            'X-Internal-Request-Id': request_id,
            'X-Internal-Signature': signature,
        }

    def test_public_requests_cannot_reach_the_internal_endpoint(self):
        with patch('app.search_tracks') as search:
            response = self.client.post('/internal/v1/music/search', json={'userId': 1, 'q': 'song', 'limit': 5})
        self.assertEqual(response.status_code, 401)
        search.assert_not_called()

    def test_signed_identity_assertion_returns_provider_tracks(self):
        body = json.dumps({'userId': 12, 'q': '  song  ', 'limit': 5}, separators=(',', ':'), sort_keys=True).encode()
        with patch('app.search_tracks', return_value=[{'id': '1', 'title': 'Song'}]) as search:
            response = self.client.post('/internal/v1/music/search', data=body, headers=self.headers_for(body))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['tracks'][0]['title'], 'Song')
        search.assert_called_once_with('song', 5)

    def test_expired_signed_request_is_rejected(self):
        body = json.dumps({'userId': 12, 'q': 'song', 'limit': 5}, separators=(',', ':'), sort_keys=True).encode()
        with patch('app.search_tracks') as search:
            response = self.client.post('/internal/v1/music/search', data=body, headers=self.headers_for(body, int(time.time()) - 120))
        self.assertEqual(response.status_code, 401)
        search.assert_not_called()


if __name__ == '__main__':
    unittest.main()
