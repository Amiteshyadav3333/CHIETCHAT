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
SOCIAL_POLLS_VOTE_PATH = '/internal/v1/social-polls/vote'
SOCIAL_POLLS_RESULTS_PATH = '/internal/v1/social-polls/results'
SOCIAL_POLLS_IMPORT_PATH = '/internal/v1/social-polls/import'
AI_GENERATE_PATH = '/internal/v1/ai/generate'


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



def call_social_poll_vote(user_id, post_id, option_index, options, timeout=(1, 5)):
    if (type(user_id) is not int or user_id < 1 or type(post_id) is not int or post_id < 1
            or type(option_index) is not int or not isinstance(options, list)
            or not 2 <= len(options) <= 4 or any(not isinstance(value, str) or not value.strip() or len(value) > 100 for value in options)
            or not 0 <= option_index < len(options)):
        raise ValueError('Invalid poll vote')
    result = call_signed_domain_service('SOCIAL_POLLS_SERVICE_URL', 'SOCIAL_POLLS_SERVICE_HMAC_KEY',
        SOCIAL_POLLS_VOTE_PATH, {'userId': user_id, 'postId': post_id, 'optionIndex': option_index, 'options': options},
        timeout=timeout, response_field='counts')
    counts = result['counts']
    if (not isinstance(counts, list) or len(counts) != len(options) or any(type(value) is not int or value < 0 for value in counts)
            or result.get('options') != options or result.get('selectedOption') != option_index or result.get('totalVotes') != sum(counts)):
        raise ValueError('Social Polls service returned invalid vote results')
    return result


def call_social_poll_results(user_id, polls, timeout=(1, 5)):
    if type(user_id) is not int or user_id < 1 or not isinstance(polls, list) or len(polls) > 500:
        raise ValueError('Invalid poll query')
    result = call_signed_domain_service('SOCIAL_POLLS_SERVICE_URL', 'SOCIAL_POLLS_SERVICE_HMAC_KEY',
        SOCIAL_POLLS_RESULTS_PATH, {'userId': user_id, 'polls': polls}, timeout=timeout, response_field='polls')
    rows = result['polls']
    if not isinstance(rows, dict):
        raise ValueError('Social Polls service returned invalid results')
    expected = {str(poll['postId']): len(poll['options']) for poll in polls}
    if set(rows) != set(expected):
        raise ValueError('Social Polls service returned invalid results')
    for post_id, count in expected.items():
        row = rows[post_id]
        if (not isinstance(row, dict) or not isinstance(row.get('counts'), list) or len(row['counts']) != count
                or any(type(value) is not int or value < 0 for value in row['counts'])
                or (row.get('selectedOption') is not None and (type(row['selectedOption']) is not int or not 0 <= row['selectedOption'] < count))):
            raise ValueError('Social Polls service returned invalid results')
    return rows


def call_social_poll_import(votes, timeout=(2, 15)):
    if not isinstance(votes, list) or len(votes) > 5000:
        raise ValueError('Invalid poll import batch')
    result = call_signed_domain_service('SOCIAL_POLLS_SERVICE_URL', 'SOCIAL_POLLS_SERVICE_HMAC_KEY',
        SOCIAL_POLLS_IMPORT_PATH, {'votes': votes}, timeout=timeout, response_field='totalRows')
    if (type(result.get('imported')) is not int or result['imported'] < 0 or type(result['totalRows']) is not int or result['totalRows'] < 0):
        raise ValueError('Social Polls service returned invalid import results')
    return result

def call_ai_generation_service(user_id, messages, max_tokens=400, timeout=(2, 18)):
    """Generate bounded text with the isolated AI provider service."""
    if (not isinstance(messages, list) or not messages or len(messages) > 32
            or type(max_tokens) is not int or not 1 <= max_tokens <= 2048):
        raise ValueError('Invalid AI generation request')
    safe_messages = []
    for message in messages:
        if (not isinstance(message, dict) or message.get('role') not in ('system', 'user', 'assistant')
                or not isinstance(message.get('content'), str)
                or len(message['content']) > 8000):
            raise ValueError('Invalid AI generation request')
        safe_messages.append({'role': message['role'], 'content': message['content']})
    result = call_signed_domain_service(
        'AI_GENERATION_SERVICE_URL', 'AI_GENERATION_SERVICE_HMAC_KEY', AI_GENERATE_PATH,
        {'userId': int(user_id), 'messages': safe_messages, 'maxTokens': max_tokens},
        timeout=timeout, response_field='generatedText',
    )
    generated = result['generatedText']
    if not isinstance(generated, str) or not generated.strip() or len(generated) > 50000:
        raise ValueError('AI generation service returned invalid text')
    return generated.strip()
