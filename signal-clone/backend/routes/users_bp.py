from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename
from models import db, User, Block, Follow
from utils import (
    get_current_user_id, get_contact_user_ids, serialize_user, get_json_data,
    normalize_phone, is_valid_phone, add_contact, upload_to_cloudinary,
    emit_to_user_chat_contacts, has_contact, create_notification
)

users_bp = Blueprint('users_bp', __name__)

@users_bp.route('/api/users', methods=['GET'])
def get_users():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    contact_ids = get_contact_user_ids(user_id)
    if not contact_ids:
        return jsonify([])
    users = User.query.filter(User.id.in_(contact_ids)).all()
    return jsonify([serialize_user(u) for u in users])

@users_bp.route('/api/user/search', methods=['POST'])
def search_user():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    data = get_json_data()
    query = (data.get('query') or data.get('phone') or '').strip()
    phone = normalize_phone(query)
    if not query:
        return jsonify({"error": "Phone number or name is required"}), 400

    # Only treat as phone search if query is exactly 10 digits
    if query.isdigit() and len(query) == 10:
        user = User.query.filter_by(phone=query).first()
    else:
        # Search by username
        user = User.query.filter(
            User.username.ilike(f"%{query}%")
        ).order_by(User.username.asc()).first()

    if user:
        added = add_contact(user_id, user.id)
        payload = serialize_user(user)
        payload["isContact"] = True
        payload["contactAdded"] = added
        return jsonify(payload)
    return jsonify({"error": "User not registered with this number"}), 200

@users_bp.route('/api/user/avatar', methods=['POST'])
def update_avatar():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    if 'avatar' not in request.files:
        return jsonify({"error": "No avatar selected"}), 400

    file = request.files['avatar']
    if file.filename == '':
        return jsonify({"error": "No avatar selected"}), 400

    filename = secure_filename(file.filename)
    extension = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if extension not in {'jpg', 'jpeg', 'png', 'gif', 'webp'}:
        return jsonify({"error": "Please upload an image file"}), 400

    try:
        url = upload_to_cloudinary(file, folder='chietchat/avatars', resource_type='image')
    except Exception as e:
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.avatar = url
    db.session.commit()

    payload = {"user": serialize_user(user)}
    emit_to_user_chat_contacts(user_id, 'user_profile_updated', payload)
    return jsonify(payload)

@users_bp.route('/api/user/avatar', methods=['DELETE'])
def delete_avatar():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    user.avatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
    db.session.commit()
    payload = {"user": serialize_user(user)}
    emit_to_user_chat_contacts(user_id, 'user_profile_updated', payload)
    return jsonify(payload)

@users_bp.route('/api/users/<int:req_user_id>/key', methods=['GET'])
def get_user_public_key(req_user_id):
    current_user_id = get_current_user_id()
    if not current_user_id:
        return jsonify({"error": "Unauthorized"}), 401
    if req_user_id != current_user_id and not has_contact(current_user_id, req_user_id):
        return jsonify({"error": "Forbidden"}), 403
    user = User.query.get(req_user_id)
    if user:
        return jsonify({"publicKey": user.public_key})
    return jsonify({"error": "User not found"}), 404

@users_bp.route('/api/user/key', methods=['POST'])
def update_public_key():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = get_json_data()
    public_key = data.get('publicKey')
    if not public_key:
        return jsonify({"error": "Public key is required"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.public_key = public_key
    db.session.commit()
    return jsonify({"message": "Key updated"})

@users_bp.route('/api/user/block', methods=['POST'])
def block_user():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    data = get_json_data()
    blocked_id = data.get('userId')
    if not blocked_id:
        return jsonify({"error": "userId required"}), 400
    existing = Block.query.filter_by(blocker_id=user_id, blocked_id=blocked_id).first()
    if not existing:
        db.session.add(Block(blocker_id=user_id, blocked_id=blocked_id))
        db.session.commit()
    return jsonify({"ok": True})

@users_bp.route('/api/user/unblock', methods=['POST'])
def unblock_user():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    data = get_json_data()
    blocked_id = data.get('userId')
    Block.query.filter_by(blocker_id=user_id, blocked_id=blocked_id).delete()
    db.session.commit()
    return jsonify({"ok": True})

@users_bp.route('/api/user/blocked', methods=['GET'])
def get_blocked():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    blocked = Block.query.filter_by(blocker_id=user_id).all()
    return jsonify([b.blocked_id for b in blocked])

@users_bp.route('/api/users/profile', methods=['POST'])
def update_profile():
    user_id = get_current_user_id()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    user = User.query.get(user_id)
    if data.get('username'):
        user.username = data['username'].strip()
    user.bio = data.get('bio', user.bio)
    user.website_url = data.get('websiteUrl', user.website_url)
    db.session.commit()
    payload = serialize_user(user)
    payload['bio'] = user.bio or ''
    payload['websiteUrl'] = user.website_url or ''
    emit_to_user_chat_contacts(user_id, 'user_profile_updated', {"user": payload})
    return jsonify(payload)

@users_bp.route('/api/users/<int:followed_id>/follow', methods=['POST'])
def toggle_follow(followed_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    if user_id == followed_id:
        return jsonify({"error": "Cannot follow yourself"}), 400
    
    existing = Follow.query.filter_by(follower_id=user_id, followed_id=followed_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"isFollowing": False})
    
    db.session.add(Follow(follower_id=user_id, followed_id=followed_id))
    db.session.commit()
    
    create_notification(
        recipient_id=followed_id,
        sender_id=user_id,
        n_type='follow',
        content="started following you",
        target_id=user_id
    )
    
    return jsonify({"isFollowing": True})
