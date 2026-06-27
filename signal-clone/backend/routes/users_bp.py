from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename
from models import db, User, Block, Follow
from utils import (
    get_current_user_id, get_contact_user_ids, serialize_user, get_json_data,
    normalize_phone, is_valid_phone, add_contact, upload_to_cloudinary,
    emit_to_user_chat_contacts, has_contact, create_notification, iso_utc, utc_now
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
        return jsonify({"error": "Enter a phone number or @userid"}), 400

    # Phone search — exactly 10 digits
    if query.isdigit() and len(query) == 10:
        user = User.query.filter_by(phone=query).first()
    else:
        # Search by platform_id (with or without @)
        handle = query.lstrip('@').strip().lower()
        user = User.query.filter(
            db.func.lower(User.platform_id) == handle
        ).first()

    if user:
        added = add_contact(user_id, user.id)
        payload = serialize_user(user)
        payload["isContact"] = True
        payload["contactAdded"] = added
        return jsonify(payload)
    return jsonify({"error": "User not found"}), 200


@users_bp.route('/api/user/check-platform-id/<string:handle>', methods=['GET'])
def check_platform_id(handle):
    """Check if a @handle is available (real-time, no auth needed for UX)."""
    import re
    handle = handle.lstrip('@').strip().lower()
    if not re.match(r'^[a-z0-9_]{3,30}$', handle):
        return jsonify({"available": False, "error": "Handle must be 3-30 characters: letters, numbers, underscores only"})
    existing = User.query.filter(
        db.func.lower(User.platform_id) == handle
    ).first()
    return jsonify({"available": existing is None, "handle": handle})


@users_bp.route('/api/user/setup-profile', methods=['POST'])
def setup_profile():
    """First-time profile setup: platform_id (handle), avatar, bio, website."""
    import re
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Handle multipart or JSON
    platform_id = (request.form.get('platformId') or '').strip().lstrip('@').lower()
    bio = (request.form.get('bio') or '').strip()
    website_url = (request.form.get('websiteUrl') or '').strip()
    display_name = (request.form.get('username') or '').strip()

    # Validate handle only if provided (it's auto-generated during registration)
    if platform_id:
        if not re.match(r'^[a-z0-9_]{3,30}$', platform_id):
            return jsonify({"error": "Handle must be 3-30 chars: letters, numbers, underscores only"}), 400
        # Uniqueness check (exclude current user)
        existing = User.query.filter(
            db.func.lower(User.platform_id) == platform_id,
            User.id != user_id
        ).first()
        if existing:
            return jsonify({"error": "This handle is already taken. Try another one."}), 409
        user.platform_id = platform_id

    # Optional avatar upload
    if 'avatar' in request.files:
        file = request.files['avatar']
        if file and file.filename:
            filename = file.filename
            extension = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
            if extension in {'jpg', 'jpeg', 'png', 'gif', 'webp'}:
                try:
                    url = upload_to_cloudinary(file, folder='chietchat/avatars', resource_type='image')
                    user.avatar = url
                except Exception as e:
                    return jsonify({"error": f"Avatar upload failed: {str(e)}"}), 500

    if display_name:
        user.username = display_name
    if 'bio' in request.form:
        user.bio = bio
        if bio:
            from datetime import timedelta
            user.bio_expires_at = utc_now() + timedelta(hours=24)
        else:
            user.bio_expires_at = None
    user.website_url = website_url or user.website_url
    user.profile_setup_done = True
    db.session.commit()

    payload = serialize_user(user)
    emit_to_user_chat_contacts(user_id, 'user_profile_updated', {"user": payload})
    return jsonify({"user": payload, "message": "Profile setup complete!"}), 200

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

@users_bp.route('/api/user/blocked-details', methods=['GET'])
def get_blocked_details():
    """Returns blocked users with full user details for the activity screen."""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    blocks = Block.query.filter_by(blocker_id=user_id).order_by(Block.created_at.desc()).all()
    result = []
    for b in blocks:
        blocked_user = User.query.get(b.blocked_id)
        if blocked_user:
            result.append({
                "id": b.id,
                "user": serialize_user(blocked_user),
                "blockedAt": iso_utc(b.created_at)
            })
    return jsonify(result)

@users_bp.route('/api/user/activity', methods=['GET'])
def get_user_activity():
    """Instagram-style activity: liked reels, liked posts, reel comments, post comments."""
    from models import ReelLike, Reel, ReelComment, SocialPostLike, SocialPost, SocialPostComment
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    # Liked Reels
    reel_likes = ReelLike.query.filter_by(user_id=user_id).order_by(ReelLike.created_at.desc()).limit(50).all()
    liked_reels = []
    for rl in reel_likes:
        reel = Reel.query.get(rl.reel_id)
        if reel:
            liked_reels.append({
                "id": rl.id,
                "reelId": reel.id,
                "videoUrl": reel.video_url,
                "caption": reel.caption or "",
                "user": serialize_user(reel.user),
                "likedAt": iso_utc(rl.created_at)
            })

    # Liked Posts
    post_likes = SocialPostLike.query.filter_by(user_id=user_id).order_by(SocialPostLike.created_at.desc()).limit(50).all()
    liked_posts = []
    for pl in post_likes:
        post = SocialPost.query.get(pl.post_id)
        if post:
            liked_posts.append({
                "id": pl.id,
                "postId": post.id,
                "caption": post.caption or "",
                "mediaUrl": post.media_url,
                "mediaType": post.media_type,
                "user": serialize_user(post.user),
                "likedAt": iso_utc(pl.created_at)
            })

    # Reel Comments
    reel_comments = ReelComment.query.filter_by(user_id=user_id).order_by(ReelComment.created_at.desc()).limit(50).all()
    my_reel_comments = []
    for rc in reel_comments:
        reel = Reel.query.get(rc.reel_id)
        if reel:
            my_reel_comments.append({
                "id": rc.id,
                "reelId": reel.id,
                "content": rc.content,
                "videoUrl": reel.video_url,
                "reelCaption": reel.caption or "",
                "reelUser": serialize_user(reel.user),
                "commentedAt": iso_utc(rc.created_at)
            })

    # Post Comments
    post_comments = SocialPostComment.query.filter_by(user_id=user_id).order_by(SocialPostComment.created_at.desc()).limit(50).all()
    my_post_comments = []
    for pc in post_comments:
        post = SocialPost.query.get(pc.post_id)
        if post:
            my_post_comments.append({
                "id": pc.id,
                "postId": post.id,
                "content": pc.content,
                "postCaption": post.caption or "",
                "mediaUrl": post.media_url,
                "postUser": serialize_user(post.user),
                "commentedAt": iso_utc(pc.created_at)
            })

    return jsonify({
        "likedReels": liked_reels,
        "likedPosts": liked_posts,
        "reelComments": my_reel_comments,
        "postComments": my_post_comments
    })

@users_bp.route('/api/users/profile', methods=['POST'])
def update_profile():
    import re
    user_id = get_current_user_id()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    user = User.query.get(user_id)
    if data.get('username'):
        user.username = data['username'].strip()
    if 'bio' in data:
        bio_val = data['bio'].strip() if data['bio'] else ""
        user.bio = bio_val
        if bio_val:
            from datetime import timedelta
            user.bio_expires_at = utc_now() + timedelta(hours=24)
        else:
            user.bio_expires_at = None
    user.website_url = data.get('websiteUrl', user.website_url)
    # Update platform handle if provided
    new_platform_id = (data.get('platformId') or '').strip().lstrip('@').lower()
    if new_platform_id and new_platform_id != (user.platform_id or ''):
        if not re.match(r'^[a-z0-9_]{3,30}$', new_platform_id):
            return jsonify({"error": "Handle must be 3-30 chars: letters, numbers, underscores only"}), 400
        existing = User.query.filter(
            db.func.lower(User.platform_id) == new_platform_id,
            User.id != user_id
        ).first()
        if existing:
            return jsonify({"error": "This handle is already taken"}), 409
        user.platform_id = new_platform_id
    db.session.commit()
    payload = serialize_user(user)
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

@users_bp.route('/api/user/privacy', methods=['PUT'])
def update_privacy_settings():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    data = request.get_json(silent=True) or {}
    
    if 'hideLastSeen' in data:
        user.hide_last_seen = bool(data.get('hideLastSeen'))
    if 'hideOnlineStatus' in data:
        user.hide_online_status = bool(data.get('hideOnlineStatus'))
    if 'readReceipts' in data:
        user.read_receipts = bool(data.get('readReceipts'))
    if 'profilePhotoPrivacy' in data:
        val = data.get('profilePhotoPrivacy')
        if val in ['everyone', 'contacts', 'nobody']:
            user.profile_photo_privacy = val

    db.session.commit()
    
    payload = serialize_user(user, viewer_id=user.id)
    emit_to_user_chat_contacts(user_id, 'user_profile_updated', {"user": payload})
    return jsonify(payload)

@users_bp.route('/api/user/report', methods=['POST'])
def report_user():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.get_json(silent=True) or {}
    reported_id = data.get('userId')
    reason = (data.get('reason') or '').strip()
    
    if not reported_id or not reason:
        return jsonify({"error": "User ID and reason are required"}), 400
        
    reported_user = User.query.get(reported_id)
    if not reported_user:
        return jsonify({"error": "User not found"}), 404
        
    from models import UserReport
    report = UserReport(reporter_id=user_id, reported_id=reported_id, reason=reason[:250])
    db.session.add(report)
    db.session.commit()
    
    return jsonify({"ok": True, "message": "User reported successfully"})
