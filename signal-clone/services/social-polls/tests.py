import json
import unittest
import uuid
from datetime import datetime, timezone
from app import Base, create_app, signature


class SocialPollServiceTests(unittest.TestCase):
    def setUp(self):
        self.key = 'test-social-polls-signing-key-' * 2
        self.app = create_app({'DATABASE_URL': 'sqlite:///:memory:', 'HMAC_KEY': self.key})
        self.engine = self.app.extensions['social_polls_engine']
        Base.metadata.create_all(self.engine)
        self.client = self.app.test_client()

    def signed(self, path, data):
        body = json.dumps(data, separators=(',', ':'), sort_keys=True).encode()
        ts, rid = str(int(datetime.now(timezone.utc).timestamp())), uuid.uuid4().hex
        return self.client.post(path, data=body, content_type='application/json', headers={
            'X-Internal-Timestamp': ts, 'X-Internal-Request-Id': rid,
            'X-Internal-Signature': signature(self.key, ts, rid, 'POST', path, body),
        })

    def test_vote_upserts_and_results_are_user_specific(self):
        path = '/internal/v1/social-polls/vote'
        payload = {'postId': 8, 'userId': 12, 'optionIndex': 1, 'options': ['A', 'B']}
        self.assertEqual(self.signed(path, payload).json['counts'], [0, 1])
        payload.update(userId=13, optionIndex=0)
        self.assertEqual(self.signed(path, payload).json['counts'], [1, 1])
        payload.update(userId=12, optionIndex=0)
        self.assertEqual(self.signed(path, payload).json['counts'], [2, 0])
        result = self.signed('/internal/v1/social-polls/results', {
            'userId': 13, 'polls': [{'postId': 8, 'options': ['A', 'B']}, {'postId': 9, 'options': ['X', 'Y']}],
        })
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['polls']['8'], {'counts': [2, 0], 'selectedOption': 0})
        self.assertEqual(result.json['polls']['9'], {'counts': [0, 0], 'selectedOption': None})

    def test_import_is_idempotent_and_invalid_options_rejected(self):
        path = '/internal/v1/social-polls/import'
        vote = {'postId': 3, 'userId': 4, 'optionIndex': 1, 'createdAt': '2026-11-04T10:00:00Z'}
        self.assertEqual(self.signed(path, {'votes': [vote]}).json, {'imported': 1, 'totalRows': 1})
        self.assertEqual(self.signed(path, {'votes': [vote]}).json, {'imported': 0, 'totalRows': 1})
        bad = self.signed('/internal/v1/social-polls/vote', {
            'postId': 3, 'userId': 5, 'optionIndex': 0, 'options': ['only one'],
        })
        self.assertEqual(bad.status_code, 400)

    def test_rejects_unsigned_internal_requests(self):
        self.assertEqual(self.client.post('/internal/v1/social-polls/vote', json={}).status_code, 401)

    def tearDown(self):
        self.engine.dispose()


if __name__ == '__main__':
    unittest.main()
