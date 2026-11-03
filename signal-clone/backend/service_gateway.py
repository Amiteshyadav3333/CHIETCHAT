"""Signed internal requests from the public API to domain services."""
import hashlib
import hmac
import json
import os
import time
import uuid
from urllib.parse import urlsplit

import requests


MUSIC_SEARCH_PATH = '/internal/v1/music/search'
TRANSLATE_PATH = '/internal/v1/translate'
SOCIAL_FEED_RANK_PATH = '/internal/v1/social-feed/rank'


def canonical_service_signature(secret, timestamp, request_id, method, path, body):
    body_digest = hashlib.sha256(body).hexdigest()
    message = f'{timestamp}\n{request_id}\n{method.upper()}\n{path}\n{body_digest}'
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def call_signed_domain_service(url_env, key_env, path, payload, timeout=(2, 8), response_field=None):
    base_url = (os.environ.get(url_env) or '').strip().rstrip('/')
    secret = (os.environ.get(key_env) or '').strip()
    if not base_url or len(secret) < 32:
        raise RuntimeError(f'{url_env} service is not configured')
    parsed_base = urlsplit(base_url)
    production = os.environ.get('RENDER') == 'true' or os.environ.get('APP_ENV') == 'production'
    if (not parsed_base.hostname or parsed_base.username or parsed_base.password
            or parsed_base.query or parsed_base.fragment or parsed_base.path not in ('', '/')
            or parsed_base.scheme not in ({'https'} if production else {'http', 'https'})):
        raise RuntimeError(f'{url_env} must use HTTPS in production')

    body = json.dumps(payload, separators=(',', ':'), sort_keys=True).encode()
    timestamp = str(int(time.time()))
    request_id = uuid.uuid4().hex
    signature = canonical_service_signature(secret, timestamp, request_id, 'POST', path, body)
    response = requests.post(
        f'{base_url}{path}', data=body,
        headers={
            'Content-Type': 'application/json',
            'X-Internal-Timestamp': timestamp,
            'X-Internal-Request-Id': request_id,
            'X-Internal-Signature': signature,
        },
        timeout=timeout,
    )
    response.raise_for_status()
    result = response.json()
    if not isinstance(result, dict):
        raise ValueError('Domain service returned an invalid response')
    if response_field and response_field not in result:
        raise ValueError('Domain service response is missing a required field')
    return result


def call_music_service(user_id, query, limit, timeout=(2, 8)):
    result = call_signed_domain_service(
        'MUSIC_SERVICE_URL', 'MUSIC_SERVICE_HMAC_KEY', MUSIC_SEARCH_PATH,
        {'userId': int(user_id), 'q': query, 'limit': int(limit)},
        timeout=timeout, response_field='tracks',
    )
    if not isinstance(result['tracks'], list):
        raise ValueError('Music service returned an invalid response')
    return result['tracks']


def call_translation_service(user_id, text, source_lang, target_lang, timeout=(2, 8)):
    result = call_signed_domain_service(
        'TRANSLATION_SERVICE_URL', 'TRANSLATION_SERVICE_HMAC_KEY', TRANSLATE_PATH,
        {'userId': int(user_id), 'text': text, 'sourceLang': source_lang, 'targetLang': target_lang},
        timeout=timeout, response_field='translatedText',
    )
    translated = result['translatedText']
    if not isinstance(translated, str) or not translated.strip():
        raise ValueError('Translation service returned invalid text')
    return translated


def call_social_feed_ranker(user_id, posts, engagement, limit, now=None, timeout=(1, 3)):
    """Ask the isolated Social Feed service to rank already-authorized candidates."""
    payload = {
        'userId': int(user_id),
        'limit': int(limit),
        'now': now.isoformat() if hasattr(now, 'isoformat') else now,
        'posts': [
            {'id': int(post.id), 'userId': int(post.user_id),
             'createdAt': post.created_at.isoformat() if post.created_at else None}
            for post in posts
        ],
        'engagement': {
            str(int(post.id)): engagement.get(post.id, {}) for post in posts
        },
    }
    result = call_signed_domain_service(
        'SOCIAL_FEED_SERVICE_URL', 'SOCIAL_FEED_SERVICE_HMAC_KEY',
        SOCIAL_FEED_RANK_PATH, payload, timeout=timeout, response_field='orderedIds',
    )
    ordered_ids = result['orderedIds']
    known_ids = {int(post.id) for post in posts}
    expected_count = min(max(int(limit), 0), len(posts))
    if (not isinstance(ordered_ids, list) or len(ordered_ids) != expected_count
            or any(type(post_id) is not int or post_id not in known_ids for post_id in ordered_ids)
            or len(set(ordered_ids)) != len(ordered_ids)):
        raise ValueError('Social feed service returned an invalid ranking')
    return ordered_ids
