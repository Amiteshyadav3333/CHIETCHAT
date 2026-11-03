import os
import unittest
from unittest.mock import patch

from service_gateway import call_music_service, call_social_feed_ranker, call_translation_service, canonical_service_signature


class ServiceGatewayTests(unittest.TestCase):
    @patch('service_gateway.requests.post')
    @patch.dict(os.environ, {
        'SOCIAL_FEED_SERVICE_URL': 'https://feed.example.test',
        'SOCIAL_FEED_SERVICE_HMAC_KEY': 'social-feed-gateway-test-secret-' * 2,
    })
    def test_social_feed_gateway_sends_candidates_and_maps_a_signed_contract(self, post):
        from datetime import datetime, timezone
        from types import SimpleNamespace
        response = post.return_value
        response.json.return_value = {'orderedIds': [2, 1]}
        candidates = [
            SimpleNamespace(id=1, user_id=10, created_at=datetime(2026, 11, 4, tzinfo=timezone.utc)),
            SimpleNamespace(id=2, user_id=11, created_at=datetime(2026, 11, 3, tzinfo=timezone.utc)),
        ]
        ordered = call_social_feed_ranker(42, candidates, {1: {'likes': 2}, 99: {'shares': 1}}, 2)
        self.assertEqual(ordered, [2, 1])
        args, kwargs = post.call_args
        self.assertEqual(args[0], 'https://feed.example.test/internal/v1/social-feed/rank')
        body = kwargs['data']
        headers = kwargs['headers']
        self.assertEqual(headers['X-Internal-Signature'], canonical_service_signature(
            'social-feed-gateway-test-secret-' * 2,
            headers['X-Internal-Timestamp'], headers['X-Internal-Request-Id'],
            'POST', '/internal/v1/social-feed/rank', body,
        ))
        payload = __import__('json').loads(body)
        self.assertEqual(set(payload['engagement']), {'1', '2'})

    @patch('service_gateway.requests.post')
    @patch.dict(os.environ, {
        'MUSIC_SERVICE_URL': 'https://music.example.test',
        'MUSIC_SERVICE_HMAC_KEY': 'gateway-test-signing-key-' * 2,
    })
    def test_music_call_sends_a_signed_identity_assertion(self, post):
        response = post.return_value
        response.json.return_value = {'tracks': [{'id': 'track-1'}]}
        tracks = call_music_service(42, 'Hindi music', 7)

        self.assertEqual(tracks, [{'id': 'track-1'}])
        args, kwargs = post.call_args
        self.assertEqual(args[0], 'https://music.example.test/internal/v1/music/search')
        body = kwargs['data']
        headers = kwargs['headers']
        self.assertEqual(headers['X-Internal-Signature'], canonical_service_signature(
            'gateway-test-signing-key-' * 2,
            headers['X-Internal-Timestamp'],
            headers['X-Internal-Request-Id'],
            'POST', '/internal/v1/music/search', body,
        ))
        self.assertEqual(kwargs['timeout'], (2, 8))
        response.raise_for_status.assert_called_once()

    @patch.dict(os.environ, {'MUSIC_SERVICE_URL': 'https://music.example.test', 'MUSIC_SERVICE_HMAC_KEY': 'too-short'})
    def test_gateway_fails_closed_when_internal_secret_is_missing(self):
        with self.assertRaisesRegex(RuntimeError, 'not configured'):
            call_music_service(42, 'Hindi music', 7)

    @patch('service_gateway.requests.post')
    @patch.dict(os.environ, {
        'TRANSLATION_SERVICE_URL': 'https://translation.example.test',
        'TRANSLATION_SERVICE_HMAC_KEY': 'translation-gateway-test-secret-' * 2,
    })
    def test_translation_call_uses_the_shared_signed_service_contract(self, post):
        response = post.return_value
        response.json.return_value = {'translatedText': 'नमस्ते'}
        translated = call_translation_service(42, 'hello', 'auto', 'hi')
        self.assertEqual(translated, 'नमस्ते')
        args, kwargs = post.call_args
        self.assertEqual(args[0], 'https://translation.example.test/internal/v1/translate')
        body = kwargs['data']
        headers = kwargs['headers']
        self.assertEqual(headers['X-Internal-Signature'], canonical_service_signature(
            'translation-gateway-test-secret-' * 2,
            headers['X-Internal-Timestamp'],
            headers['X-Internal-Request-Id'],
            'POST', '/internal/v1/translate', body,
        ))


if __name__ == '__main__':
    unittest.main()
