"""Isolated Social Feed ranking service; it receives only gateway-filtered candidates."""
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from math import exp, log1p

from flask import Flask, jsonify, request

INTERNAL_PATH = '/internal/v1/social-feed/rank'
MAX_CANDIDATES = 500


def _signature(secret, timestamp, request_id, method, path, body):
    digest = hashlib.sha256(body).hexdigest()
    message = f'{timestamp}\n{request_id}\n{method.upper()}\n{path}\n{digest}'
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def _timestamp(value):
    if value is None:
        return datetime.now(timezone.utc)
    if not isinstance(value, str):
        raise ValueError('Invalid timestamp')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def rank_candidates(posts, engagement, now, limit):
    parsed = []
    ids = set()
    for item in posts:
        if not isinstance(item, dict) or type(item.get('id')) is not int or item['id'] < 1:
            raise ValueError('Invalid candidate')
        if type(item.get('userId')) is not int or item['userId'] < 1 or item['id'] in ids:
            raise ValueError('Invalid candidate')
        created_at = _timestamp(item.get('createdAt'))
        ids.add(item['id'])
        parsed.append((item['id'], item['userId'], created_at))

    if not isinstance(engagement, dict) or any(key not in {str(post_id) for post_id in ids} for key in engagement):
        raise ValueError('Invalid engagement')

    def score(post):
        post_id, _, created_at = post
        stats = engagement.get(str(post_id), {})
        if not isinstance(stats, dict):
            raise ValueError('Invalid engagement')
        values = [stats.get(name, 0) for name in ('comments', 'likes', 'shares', 'creator_posts')]
        if any(type(value) is not int or value < 0 or value > 10_000_000 for value in values):
            raise ValueError('Invalid engagement')
        comments, likes, shares, creator_posts = values
        age_hours = max(0.0, (now - created_at).total_seconds() / 3600)
        freshness = 5.0 * exp(-age_hours / 72.0)
        interaction = min(4.0, log1p(likes + comments * 2 + shares * 2))
        exploration = 1.2 / (1.0 + log1p(creator_posts or 1))
        return freshness + interaction + exploration

    remaining = sorted(parsed, key=lambda post: (score(post), post[2], post[0]), reverse=True)
    output, creator_seen = [], {}
    while remaining and len(output) < limit:
        best = max(range(len(remaining)), key=lambda i: (
            score(remaining[i]) / (1.0 + 0.8 * creator_seen.get(remaining[i][1], 0)),
            remaining[i][2], remaining[i][0],
        ))
        post_id, user_id, _ = remaining.pop(best)
        output.append(post_id)
        creator_seen[user_id] = creator_seen.get(user_id, 0) + 1
    return output


def create_app():
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = 256 * 1024

    @app.get('/health/live')
    def health_live():
        return jsonify({'service': 'cheetchat-social-feed', 'status': 'ok'})

    @app.get('/health/ready')
    def health_ready():
        ready = len((os.environ.get('SOCIAL_FEED_SERVICE_HMAC_KEY') or '').strip()) >= 32
        return jsonify({'service': 'cheetchat-social-feed', 'status': 'ready' if ready else 'not_ready'}), 200 if ready else 503

    @app.post(INTERNAL_PATH)
    def rank_feed():
        secret = (os.environ.get('SOCIAL_FEED_SERVICE_HMAC_KEY') or '').strip()
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
            if (not isinstance(payload, dict) or type(payload.get('userId')) is not int
                    or payload['userId'] < 1 or not isinstance(payload.get('posts'), list)
                    or type(payload.get('limit')) is not int
                    or not 0 <= payload['limit'] <= MAX_CANDIDATES):
                raise ValueError('Invalid request')
            if len(payload['posts']) > MAX_CANDIDATES:
                return jsonify({'error': 'Too many feed candidates'}), 413
            now = _timestamp(payload.get('now'))
            ordered_ids = rank_candidates(payload['posts'], payload.get('engagement', {}), now, payload['limit'])
            return jsonify({'orderedIds': ordered_ids})
        except (TypeError, ValueError, OverflowError):
            return jsonify({'error': 'Invalid ranking request'}), 400

    return app


app = create_app()
