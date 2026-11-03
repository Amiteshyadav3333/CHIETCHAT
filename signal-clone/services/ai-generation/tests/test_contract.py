import hashlib
import hmac
import json
import os
import time
import unittest
from unittest.mock import patch

from app import app


class AiGenerationContractTests(unittest.TestCase):
    def setUp(self):
        self.secret = 'test-ai-generation-internal-key-' * 2
        self.env = patch.dict(os.environ, {'AI_GENERATION_SERVICE_HMAC_KEY': self.secret})
        self.env.start()
        self.client = app.test_client()

    def tearDown(self):
        self.env.stop()

    def headers_for(self, body, request_id='a' * 32, timestamp=None):
        timestamp = str(timestamp or int(time.time()))
        body_hash = hashlib.sha256(body).hexdigest()
        message = f'{timestamp}\n{request_id}\nPOST\n/internal/v1/ai/generate\n{body_hash}'
        signature = hmac.new(self.secret.encode(), message.encode(), hashlib.sha256).hexdigest()
        return {
            'Content-Type': 'application/json',
            'X-Internal-Timestamp': timestamp,
            'X-Internal-Request-Id': request_id,
            'X-Internal-Signature': signature,
        }

    def test_public_requests_cannot_invoke_providers(self):
        with patch('app._generate') as generate:
            response = self.client.post('/internal/v1/ai/generate', json={})
        self.assertEqual(response.status_code, 401)
        generate.assert_not_called()

    def test_signed_request_generates_bounded_text(self):
        payload = {'userId': 12, 'messages': [{'role': 'user', 'content': 'helo'}], 'maxTokens': 400}
        body = json.dumps(payload, separators=(',', ':'), sort_keys=True).encode()
        with patch('app._generate', return_value=('hello', 'gemini')) as generate:
            response = self.client.post('/internal/v1/ai/generate', data=body, headers=self.headers_for(body))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['generatedText'], 'hello')
        generate.assert_called_once_with(payload['messages'], 400)

    def test_expired_request_is_rejected(self):
        payload = {'userId': 12, 'messages': [{'role': 'user', 'content': 'hello'}], 'maxTokens': 10}
        body = json.dumps(payload, separators=(',', ':'), sort_keys=True).encode()
        with patch('app._generate') as generate:
            response = self.client.post('/internal/v1/ai/generate', data=body, headers=self.headers_for(body, timestamp=int(time.time()) - 120))
        self.assertEqual(response.status_code, 401)
        generate.assert_not_called()

    def test_invalid_roles_or_oversized_message_are_rejected(self):
        for message in (
            {'role': 'tool', 'content': 'not allowed'},
            {'role': 'user', 'content': 'x' * 8001},
        ):
            payload = {'userId': 12, 'messages': [message], 'maxTokens': 20}
            body = json.dumps(payload, separators=(',', ':'), sort_keys=True).encode()
            with patch('app._generate') as generate:
                response = self.client.post('/internal/v1/ai/generate', data=body, headers=self.headers_for(body, request_id='b' * 32))
            self.assertEqual(response.status_code, 400)
            generate.assert_not_called()

    @patch.dict(os.environ, {'OPENAI_API_KEY': 'private-test-key', 'GEMINI_API_KEY': ''})
    @patch('app.requests.post')
    def test_provider_adapter_returns_text_without_exposing_key(self, post):
        post.return_value.json.return_value = {'choices': [{'message': {'content': 'corrected'}}]}
        post.return_value.raise_for_status.return_value = None
        from app import _generate
        result, provider = _generate([{'role': 'user', 'content': 'helo'}], 100)
        self.assertEqual((result, provider), ('corrected', 'openai'))
        self.assertNotIn('private-test-key', result)


if __name__ == '__main__':
    unittest.main()
