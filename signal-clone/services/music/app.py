"""Standalone, stateless music-search microservice."""
import hashlib
import hmac
import json
import os
import time

import requests
from flask import Flask, jsonify, request

MAX_QUERY_LENGTH = 120
ITUNES_SEARCH_URL = 'https://itunes.apple.com/search'
INTERNAL_PATH = '/internal/v1/music/search'


def _service_signature(secret, timestamp, request_id, method, path, body):
    digest = hashlib.sha256(body).hexdigest()
    message = f'{timestamp}\n{request_id}\n{method.upper()}\n{path}\n{digest}'
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def search_tracks(query, limit):
    response = requests.get(
        ITUNES_SEARCH_URL,
        params={
            'term': query, 'media': 'music', 'entity': 'song', 'limit': limit,
            'country': 'IN', 'lang': 'hi_in', 'explicit': 'No',
        },
        headers={'User-Agent': 'CHIETCHAT-Music-Service/1.0'},
        timeout=(2, 6),
    )
    response.raise_for_status()
    payload = response.json()
    tracks = []
    for item in payload.get('results', []):
        preview_url = item.get('previewUrl')
        if not preview_url:
            continue
        artwork = item.get('artworkUrl100')
        if artwork:
            artwork = artwork.replace('100x100bb', '300x300bb')
        tracks.append({
            'id': str(item.get('trackId') or preview_url),
            'title': item.get('trackName') or 'Unknown song',
            'artist': item.get('artistName') or 'Unknown artist',
            'album': item.get('collectionName') or '',
            'previewUrl': preview_url,
            'artwork': artwork,
            'source': 'itunes',
            'durationMs': item.get('trackTimeMillis'),
        })
    return tracks


def create_app():
    app = Flask(__name__)

    @app.get('/health/live')
    def health_live():
        return jsonify({'service': 'cheetchat-music', 'status': 'ok'})

    @app.get('/health/ready')
    def health_ready():
        ready = len((os.environ.get('MUSIC_SERVICE_HMAC_KEY') or '').strip()) >= 32
        return jsonify({'service': 'cheetchat-music', 'status': 'ready' if ready else 'not_ready'}), 200 if ready else 503

    @app.post(INTERNAL_PATH)
    def internal_search():
        secret = (os.environ.get('MUSIC_SERVICE_HMAC_KEY') or '').strip()
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
        expected = _service_signature(secret, timestamp, request_id, request.method, request.path, body)
        if not hmac.compare_digest(expected, provided):
            return jsonify({'error': 'Unauthorized'}), 401
        try:
            payload = json.loads(body)
        except (TypeError, ValueError):
            return jsonify({'error': 'Invalid request'}), 400
        if not isinstance(payload, dict) or type(payload.get('userId')) is not int or payload['userId'] < 1:
            return jsonify({'error': 'Invalid identity assertion'}), 400
        query = payload.get('q')
        if not isinstance(query, str):
            return jsonify({'error': 'Search query must be text'}), 400
        query = query.strip()
        if len(query) < 2:
            return jsonify({'tracks': []})
        if len(query) > MAX_QUERY_LENGTH:
            return jsonify({'error': 'Search query is too long'}), 400
        raw_limit = payload.get('limit', 12)
        if type(raw_limit) is not int or raw_limit < 1 or raw_limit > 25:
            return jsonify({'error': 'Invalid result limit'}), 400
        try:
            return jsonify({'tracks': search_tracks(query, raw_limit)})
        except (requests.RequestException, ValueError, KeyError, TypeError):
            app.logger.warning('music_provider_unavailable request_id=%s', request_id)
            return jsonify({'error': 'Music search is temporarily unavailable'}), 502

    return app


app = create_app()
