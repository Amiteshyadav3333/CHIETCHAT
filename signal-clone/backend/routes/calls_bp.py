import base64
import hashlib
import hmac
import os
import time

from flask import Blueprint, jsonify

from models import CallRecord, ChatParticipant
from utils import get_current_user_id, iso_utc


calls_bp = Blueprint('calls', __name__)


@calls_bp.get('/api/calls/ice-config')
def ice_config():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    stun_urls = [value.strip() for value in os.environ.get(
        'STUN_URLS', 'stun:stun.l.google.com:19302,stun:stun.cloudflare.com:3478'
    ).split(',') if value.strip()]
    ice_servers = [{'urls': stun_urls}]
    turn_urls = [value.strip() for value in os.environ.get('TURN_URLS', '').split(',') if value.strip()]
    turn_secret = os.environ.get('TURN_SECRET', '')
    turn_username = os.environ.get('TURN_USERNAME', '').strip()
    turn_credential = os.environ.get('TURN_CREDENTIAL', '').strip()
    ttl_seconds = 3600
    if turn_urls and turn_username and turn_credential:
        ice_servers.append({
            'urls': turn_urls, 'username': turn_username, 'credential': turn_credential,
        })
        ttl_seconds = None
    elif turn_urls and turn_secret:
        expires_at = int(time.time()) + 3600
        username = f'{expires_at}:{user_id}'
        credential = base64.b64encode(
            hmac.new(turn_secret.encode(), username.encode(), hashlib.sha1).digest()
        ).decode()
        ice_servers.append({'urls': turn_urls, 'username': username, 'credential': credential})
    elif os.environ.get('APP_ENV') == 'production':
        return jsonify({'error': 'Call relay is not configured'}), 503

    return jsonify({'iceServers': ice_servers, 'ttlSeconds': ttl_seconds})


@calls_bp.get('/api/calls/history')
def call_history():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    chat_ids = [row.chat_id for row in ChatParticipant.query.filter_by(user_id=user_id).all()]
    records = CallRecord.query.filter(CallRecord.chat_id.in_(chat_ids)).order_by(
        CallRecord.started_at.desc()
    ).limit(100).all() if chat_ids else []
    return jsonify({'items': [{
        'id': record.id, 'chatId': record.chat_id, 'callerId': record.caller_id,
        'callType': record.call_type, 'status': record.status,
        'startedAt': iso_utc(record.started_at), 'answeredAt': iso_utc(record.answered_at),
        'endedAt': iso_utc(record.ended_at),
    } for record in records]})
