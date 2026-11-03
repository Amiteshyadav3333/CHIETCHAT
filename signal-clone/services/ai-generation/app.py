"""Private, signed AI text-generation service with provider failover."""
import hashlib
import hmac
import json
import os
import re
import time

import requests
from flask import Flask, jsonify, request

INTERNAL_PATH = '/internal/v1/ai/generate'
MAX_BODY_BYTES = 64 * 1024
MAX_MESSAGES = 32
MAX_TEXT_CHARS = 8000
GEMINI_MODELS = ('gemini-3.1-flash-lite', 'gemini-2.5-flash')


def _signature(secret, timestamp, request_id, method, path, body):
    digest = hashlib.sha256(body).hexdigest()
    message = f'{timestamp}\n{request_id}\n{method.upper()}\n{path}\n{digest}'
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def _valid_messages(messages, max_tokens):
    if (not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES
            or type(max_tokens) is not int or not 1 <= max_tokens <= 2048):
        return False
    for item in messages:
        if (not isinstance(item, dict) or item.get('role') not in ('system', 'user', 'assistant')
                or not isinstance(item.get('content'), str) or len(item['content']) > MAX_TEXT_CHARS):
            return False
    return True


def _generate(messages, max_tokens):
    """Try configured providers in order; never log prompt content or keys."""
    gemini_key = os.environ.get('GEMINI_API_KEY', '').strip()
    if gemini_key:
        system = next((item['content'] for item in messages if item['role'] == 'system'), None)
        contents = [
            {'role': 'user' if item['role'] == 'user' else 'model', 'parts': [{'text': item['content']}]}
            for item in messages if item['role'] != 'system'
        ]
        payload = {'contents': contents, 'generationConfig': {'maxOutputTokens': max_tokens, 'temperature': 0.55}}
        if system:
            payload['systemInstruction'] = {'parts': [{'text': system}]}
        for model in GEMINI_MODELS:
            try:
                response = requests.post(
                    f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
                    params={'key': gemini_key}, json=payload, timeout=(3, 10),
                )
                response.raise_for_status()
                parts = response.json().get('candidates', [{}])[0].get('content', {}).get('parts', [])
                generated = ''.join(part.get('text', '') for part in parts if isinstance(part, dict)).strip()
                if generated:
                    return generated, 'gemini'
            except (requests.RequestException, ValueError, IndexError, KeyError, TypeError):
                continue

    providers = (
        ('GROQ_API_KEY', 'https://api.groq.com/openai/v1/chat/completions', 'llama-3.3-70b-versatile', 'groq'),
        ('GROK_API_KEY', 'https://api.x.ai/v1/chat/completions', 'grok-3-mini', 'grok'),
        ('OPENAI_API_KEY', 'https://api.openai.com/v1/chat/completions', 'gpt-4o-mini', 'openai'),
    )
    for env_key, endpoint, model, provider in providers:
        key = os.environ.get(env_key, '').strip()
        if not key:
            continue
        try:
            response = requests.post(
                endpoint, headers={'Authorization': f'Bearer {key}'},
                json={'model': model, 'messages': messages, 'max_tokens': max_tokens, 'temperature': 0.55},
                timeout=(3, 12),
            )
            response.raise_for_status()
            generated = response.json()['choices'][0]['message']['content']
            if isinstance(generated, str) and generated.strip():
                return generated.strip(), provider
        except (requests.RequestException, ValueError, IndexError, KeyError, TypeError):
            continue
    return None, None


def create_app():
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = MAX_BODY_BYTES

    @app.get('/health/live')
    def live():
        return jsonify({'service': 'chietchat-ai-generation', 'status': 'ok'})

    @app.get('/health/ready')
    def ready():
        configured = len((os.environ.get('AI_GENERATION_SERVICE_HMAC_KEY') or '').strip()) >= 32
        return jsonify({'service': 'chietchat-ai-generation', 'status': 'ready' if configured else 'not_ready'}), 200 if configured else 503

    @app.post(INTERNAL_PATH)
    def generate():
        secret = (os.environ.get('AI_GENERATION_SERVICE_HMAC_KEY') or '').strip()
        timestamp = request.headers.get('X-Internal-Timestamp', '')
        request_id = request.headers.get('X-Internal-Request-Id', '')
        provided = request.headers.get('X-Internal-Signature', '')
        if len(secret) < 32 or not re.fullmatch(r'[a-f0-9]{32}', request_id) or not re.fullmatch(r'[a-f0-9]{64}', provided):
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
            if (not isinstance(payload, dict) or type(payload.get('userId')) is not int
                    or payload['userId'] < 1
                    or not _valid_messages(payload.get('messages'), payload.get('maxTokens'))):
                raise ValueError('Invalid request')
            generated, provider = _generate(payload['messages'], payload['maxTokens'])
            if not generated:
                return jsonify({'error': 'AI provider unavailable'}), 503
            return jsonify({'generatedText': generated, 'provider': provider})
        except (TypeError, ValueError, OverflowError):
            return jsonify({'error': 'Invalid generation request'}), 400

    return app


app = create_app()
