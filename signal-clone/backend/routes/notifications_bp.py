import json
import os
from flask import Blueprint, jsonify, request
from models import db, Notification, SocialPost, PushSubscription
from utils import get_current_user_id, get_current_session_id, iso_utc, serialize_user

notifications_bp = Blueprint('notifications_bp', __name__)

@notifications_bp.route('/api/push/config', methods=['GET'])
def push_config():
    if not get_current_user_id():
        return jsonify({'error': 'Unauthorized'}), 401
    public_key = os.environ.get('VAPID_PUBLIC_KEY', '')
    private_key = os.environ.get('VAPID_PRIVATE_KEY', '')
    subject = os.environ.get('VAPID_SUBJECT', '')
    enabled = bool(public_key and private_key and (subject.startswith('mailto:') or subject.startswith('https://')))
    return jsonify({'enabled': enabled, 'publicKey': public_key if enabled else None})

@notifications_bp.route('/api/push/subscriptions', methods=['POST'])
def save_push_subscription():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.get_json(silent=True) or {}
    endpoint = str(data.get('endpoint') or '')
    keys = data.get('keys') or {}
    if not endpoint.startswith('https://') or not keys.get('p256dh') or not keys.get('auth'):
        return jsonify({'error': 'Invalid push subscription'}), 400
    serialized = json.dumps({'endpoint': endpoint, 'keys': {'p256dh': keys['p256dh'], 'auth': keys['auth']}})
    session_id = get_current_session_id()
    subscription = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if subscription:
        subscription.user_id = user_id
        subscription.session_id = session_id
        subscription.subscription_json = serialized
        subscription.user_agent = request.headers.get('User-Agent', '')[:300]
    else:
        subscription = PushSubscription(
            user_id=user_id, endpoint=endpoint, subscription_json=serialized,
            session_id=session_id,
            user_agent=request.headers.get('User-Agent', '')[:300],
        )
        db.session.add(subscription)
    db.session.commit()
    return jsonify({'ok': True}), 201

@notifications_bp.route('/api/push/subscriptions', methods=['DELETE'])
def delete_push_subscription():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    endpoint = str((request.get_json(silent=True) or {}).get('endpoint') or '')
    PushSubscription.query.filter_by(user_id=user_id, endpoint=endpoint).delete(synchronize_session=False)
    db.session.commit()
    return jsonify({'ok': True})

def serialize_notification(n):
    """Serialize a notification with rich context for frontend navigation."""
    post_preview = None
    # Fetch post caption preview for like/comment/retweet/share notifications
    if n.type in ('like', 'comment', 'comment_reply', 'retweet', 'share') and n.target_id:
        post = db.session.get(SocialPost, n.target_id)
        if post and post.caption:
            post_preview = post.caption[:80] + ('…' if len(post.caption) > 80 else '')

    return {
        "id": n.id,
        "type": n.type,
        "content": n.content,
        "targetId": n.target_id,
        "isRead": n.is_read,
        "createdAt": iso_utc(n.created_at),
        "sender": serialize_user(n.sender) if n.sender else None,
        "postPreview": post_preview,
    }

@notifications_bp.route('/api/notifications', methods=['GET'])
def get_notifications():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    notifications = (
        Notification.query
        .filter_by(recipient_id=user_id)
        .order_by(Notification.created_at.desc())
        .limit(100)
        .all()
    )
    return jsonify([serialize_notification(n) for n in notifications])

@notifications_bp.route('/api/notifications/read', methods=['POST'])
def mark_all_read():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    Notification.query.filter_by(recipient_id=user_id, is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify({"ok": True})

@notifications_bp.route('/api/notifications/<int:n_id>/read', methods=['POST'])
def mark_read(n_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    n = db.session.get(Notification, n_id)
    if n and n.recipient_id == user_id:
        n.is_read = True
        db.session.commit()
    return jsonify({"ok": True})
