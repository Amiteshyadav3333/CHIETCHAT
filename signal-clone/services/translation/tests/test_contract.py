import hashlib
import hmac
import json
import os
import time
import unittest
from unittest.mock import patch

from app import app


class TranslationServiceContractTests(unittest.TestCase):
    def setUp(self):
        self.secret = 'translation-service-test-key-' * 2
        self.env = patch.dict(os.environ, {'TRANSLATION_SERVICE_HMAC_KEY': self.secret})
        self.env.start()
        self.client = app.test_client()

    def tearDown(self):
        self.env.stop()

    def headers_for(self, body, timestamp=None):
        timestamp = str(timestamp or int(time.time()))
        request_id = 'b' * 32
        body_hash = hashlib.sha256(body).hexdigest()
        message = f'{timestamp}\n{request_id}\nPOST\n/internal/v1/translate\n{body_hash}'
        signature = hmac.new(self.secret.encode(), message.encode(), hashlib.sha256).hexdigest()
        return {
            'Content-Type': 'application/json',
            'X-Internal-Timestamp': timestamp,
            'X-Internal-Request-Id': request_id,
            'X-Internal-Signature': signature,
        }

    def test_unsigned_public_request_is_rejected(self):
        with patch('app.translate_text') as translate:
            response = self.client.post('/internal/v1/translate', json={
                'userId': 7, 'text': 'hello', 'sourceLang': 'auto', 'targetLang': 'hi',
            })
        self.assertEqual(response.status_code, 401)
        translate.assert_not_called()

    def test_oversized_request_body_is_rejected_before_parsing(self):
        response = self.client.post('/internal/v1/translate', data=b' ' * (64 * 1024 + 1))
        self.assertEqual(response.status_code, 413)

    def test_signed_request_translates_and_validates_languages(self):
        payload = {'userId': 7, 'text': 'hello', 'sourceLang': 'auto', 'targetLang': 'hi'}
        body = json.dumps(payload, separators=(',', ':'), sort_keys=True).encode()
        with patch('app.translate_text', return_value='नमस्ते') as translate:
            response = self.client.post('/internal/v1/translate', data=body, headers=self.headers_for(body))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['translatedText'], 'नमस्ते')
        translate.assert_called_once_with('hello', 'auto', 'hi')

        invalid = {'userId': 7, 'text': 'hello', 'sourceLang': 'auto', 'targetLang': 'https://example.test'}
        bad_body = json.dumps(invalid, separators=(',', ':'), sort_keys=True).encode()
        with patch('app.translate_text') as translate:
            bad_response = self.client.post('/internal/v1/translate', data=bad_body, headers=self.headers_for(bad_body))
        self.assertEqual(bad_response.status_code, 400)
        translate.assert_not_called()


if __name__ == '__main__':
    unittest.main()
