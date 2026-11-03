import hashlib
import hmac
import json
import os
import importlib.util
import time
import unittest
from unittest.mock import patch

APP_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'app.py'))
SPEC = importlib.util.spec_from_file_location('social_feed_service_app', APP_PATH)
SERVICE_APP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVICE_APP)
INTERNAL_PATH = SERVICE_APP.INTERNAL_PATH
create_app = SERVICE_APP.create_app
rank_candidates = SERVICE_APP.rank_candidates

SECRET = 'social-feed-contract-test-key-0123456789abcdef'


def signed_headers(body, request_id='a' * 32, timestamp=None):
    timestamp = str(timestamp or int(time.time()))
    digest = hashlib.sha256(body).hexdigest()
    message = f'{timestamp}\n{request_id}\nPOST\n{INTERNAL_PATH}\n{digest}'
    signature = hmac.new(SECRET.encode(), message.encode(), hashlib.sha256).hexdigest()
    return {
        'X-Internal-Timestamp': timestamp,
        'X-Internal-Request-Id': request_id,
        'X-Internal-Signature': signature,
        'Content-Type': 'application/json',
    }


class SocialFeedContractTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {'SOCIAL_FEED_SERVICE_HMAC_KEY': SECRET})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.client = create_app().test_client()

    def test_rank_endpoint_returns_only_candidate_ids(self):
        payload = {
            'userId': 3,
            'limit': 2,
            'now': '2026-11-04T12:00:00+00:00',
            'posts': [
                {'id': 1, 'userId': 7, 'createdAt': '2026-11-04T11:00:00+00:00'},
                {'id': 2, 'userId': 8, 'createdAt': '2026-11-04T10:00:00+00:00'},
                {'id': 3, 'userId': 7, 'createdAt': '2026-11-04T09:00:00+00:00'},
            ],
            'engagement': {'1': {'likes': 0, 'comments': 0, 'shares': 0, 'creator_posts': 4}},
        }
        body = json.dumps(payload, separators=(',', ':'), sort_keys=True).encode()
        response = self.client.post(INTERNAL_PATH, data=body, headers=signed_headers(body))
        self.assertEqual(response.status_code, 200)
        ids = response.get_json()['orderedIds']
        self.assertEqual(len(ids), 2)
        self.assertLessEqual(set(ids), {1, 2, 3})

    def test_rejects_unsigned_and_oversized_candidate_requests(self):
        self.assertEqual(self.client.post(INTERNAL_PATH, json={}).status_code, 401)
        payload = {'userId': 1, 'limit': 1, 'posts': [{}] * 501, 'engagement': {}}
        body = json.dumps(payload, separators=(',', ':'), sort_keys=True).encode()
        response = self.client.post(INTERNAL_PATH, data=body, headers=signed_headers(body))
        self.assertEqual(response.status_code, 413)

    def test_ranker_explores_multiple_creators(self):
        now = '2026-11-04T12:00:00+00:00'
        ordered = rank_candidates([
            {'id': 1, 'userId': 7, 'createdAt': now},
            {'id': 2, 'userId': 7, 'createdAt': now},
            {'id': 3, 'userId': 8, 'createdAt': now},
        ], {'1': {'likes': 1000}, '2': {'likes': 1000}, '3': {'likes': 0}},
            __import__('datetime').datetime.fromisoformat(now), 3)
        self.assertIn(ordered[0], {1, 2})
        self.assertEqual(ordered[1], 3)


if __name__ == '__main__':
    unittest.main()
