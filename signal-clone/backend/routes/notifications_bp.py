from flask import Blueprint, jsonify
from models import db, Notification
from utils import get_current_user_id, iso_utc, serialize_user

notifications_bp = Blueprint('notifications_bp', __name__)

@notifications_bp.route('/api/notifications', methods=['GET'])
def get_notifications():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    notifications = Notification.query.filter_by(recipient_id=user_id).order_by(Notification.created_at.desc()).limit(50).all()
    
    return jsonify([{
        "id": n.id,
        "type": n.type,
        "content": n.content,
        "targetId": n.target_id,
        "isRead": n.is_read,
        "createdAt": iso_utc(n.created_at),
        "sender": serialize_user(n.sender) if n.sender else None
    } for n in notifications])

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

    n = Notification.query.get(n_id)
    if n and n.recipient_id == user_id:
        n.is_read = True
        db.session.commit()
    
    return jsonify({"ok": True})
