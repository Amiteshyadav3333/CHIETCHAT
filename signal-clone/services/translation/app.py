"""Standalone translation provider service."""
import hashlib
import hmac
import json
import os
import re
import time

import requests
from flask import Flask, jsonify, request

INTERNAL_PATH = '/internal/v1/translate'
MAX_TEXT_LENGTH = 8000
LANGUAGE_PATTERN = re.compile(r'^[A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?$')
TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single'


def _signature(secret, timestamp, request_id, method, path, body):
    digest = hashlib.sha256(body).hexdigest()
    message = f'{timestamp}\n{request_id}\n{method.upper()}\n{path}\n{digest}'
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def translate_text(text, source_lang, target_lang):
    response = requests.get(
        TRANSLATE_URL,
        params={'client': 'gtx', 'sl': source_lang, 'tl': target_lang, 'dt': 't', 'q': text},
        headers={'User-Agent': 'CHEETCHAT-Translation-Service/1.0'},
        timeout=(2, 8),
    )
    response.raise_for_status()
    payload = response.json()
    try:
        translated = ''.join(
            segment[0] for segment in payload[0]
            if isinstance(segment, list) and segment and isinstance(segment[0], str)
        )
    except (IndexError, TypeError):
        translated = ''
    if not translated:
        raise ValueError('Translation provider returned an empty response')
    return translated


def create_app():
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = 64 * 1024

    @app.get('/health/live')
    def health_live():
        return jsonify({'service': 'cheetchat-translation', 'status': 'ok'})

    @app.get('/health/ready')
    def health_ready():
        ready = len((os.environ.get('TRANSLATION_SERVICE_HMAC_KEY') or '').strip()) >= 32
        return jsonify({'service': 'cheetchat-translation', 'status': 'ready' if ready else 'not_ready'}), 200 if ready else 503

    @app.post(INTERNAL_PATH)
    def internal_translate():
        if request.content_length and request.content_length > 64 * 1024:
            return jsonify({'error': 'Request is too large'}), 413
        secret = (os.environ.get('TRANSLATION_SERVICE_HMAC_KEY') or '').strip()
        timestamp = request.headers.get('X-Internal-Timestamp', '')
        request_id = request.headers.get('X-Internal-Request-Id', '')
        provided = request.headers.get('X-Internal-Signature', '')
        if len(secret) < 32 or len(request_id) != 32 or len(provided) != 64:
            return jsonify({'error': 'Unauthorized'}), 401
        try:
            signed_at = int(timestamp)
        except (TypeError, ValueError):
            return jsonify({'error': 'Unauthorized'}), 401
        if abs(int(time.time()) - signed_at) > 60:
            return jsonify({'error': 'Expired service request'}), 401
        body = request.get_data(cache=True)
        expected = _signature(secret, timestamp, request_id, request.method, request.path, body)
        if not hmac.compare_digest(expected, provided):
            return jsonify({'error': 'Unauthorized'}), 401
        try:
            payload = json.loads(body)
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid request'}), 400
        if not isinstance(payload, dict) or type(payload.get('userId')) is not int or payload['userId'] < 1:
            return jsonify({'error': 'Invalid identity assertion'}), 400
        text = payload.get('text')
        source_lang = payload.get('sourceLang')
        target_lang = payload.get('targetLang')
        if not isinstance(text, str) or not text.strip():
            return jsonify({'error': 'Missing text'}), 400
        if len(text) > MAX_TEXT_LENGTH:
            return jsonify({'error': 'Text is too long'}), 400
        if (source_lang != 'auto' and (not isinstance(source_lang, str) or not LANGUAGE_PATTERN.fullmatch(source_lang))):
            return jsonify({'error': 'Invalid source language'}), 400
        if not isinstance(target_lang, str) or not LANGUAGE_PATTERN.fullmatch(target_lang):
            return jsonify({'error': 'Invalid target language'}), 400
        try:
            translated = translate_text(text, source_lang, target_lang)
            return jsonify({'translatedText': translated})
        except (requests.RequestException, ValueError, IndexError, TypeError):
            app.logger.warning('translation_provider_unavailable request_id=%s', request_id)
            return jsonify({'error': 'Translation provider is temporarily unavailable'}), 502

    return app


app = create_app()
