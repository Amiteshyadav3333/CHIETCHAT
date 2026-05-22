from flask import Blueprint, jsonify, request
from sqlalchemy import or_
from werkzeug.utils import secure_filename

from models import (
    db, User, Follow, SocialPost, SocialPostLike, SocialPostComment,
    Channel, ChannelMembership
)
from utils import (
    get_current_user_id, get_json_data, iso_utc, serialize_user,
    upload_to_cloudinary, create_notification
)

social_bp = Blueprint('social_bp', __name__)

ALLOWED_MEDIA = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'm4v'}
IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}

def media_type_for(filename):
    extension = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if extension not in ALLOWED_MEDIA:
        return None
    return 'image' if extension in IMAGE_EXTENSIONS else 'video'

def serialize_post(post, current_user_id):
    is_liked = SocialPostLike.query.filter_by(post_id=post.id, user_id=current_user_id).first() is not None
    is_following = Follow.query.filter_by(follower_id=current_user_id, followed_id=post.user_id).first() is not None
    user_data = serialize_user(post.user)
    user_data["isFollowing"] = is_following
    channel_data = None
    if post.channel:
        channel_data = {
            "id": post.channel.id,
            "name": post.channel.name,
            "ownerId": post.channel.owner_id
        }
    return {
        "id": post.id,
        "caption": post.caption or "",
        "mediaUrl": post.media_url,
        "mediaType": post.media_type,
        "createdAt": iso_utc(post.created_at),
        "user": user_data,
        "channel": channel_data,
        "likesCount": len(post.likes),
        "commentsCount": len(post.comments),
        "isLiked": is_liked,
        "canDelete": post.user_id == current_user_id or (post.channel and post.channel.owner_id == current_user_id)
    }

def get_channel_role(channel, user_id):
    if channel.owner_id == user_id:
        return 'owner'
    membership = ChannelMembership.query.filter_by(channel_id=channel.id, user_id=user_id).first()
    if membership:
        return membership.status
    return 'none'

def serialize_channel(channel, current_user_id, include_pending=False):
    approved_count = ChannelMembership.query.filter_by(channel_id=channel.id, status='approved').count()
    pending_count = ChannelMembership.query.filter_by(channel_id=channel.id, status='pending').count()
    payload = {
        "id": channel.id,
        "name": channel.name,
        "description": channel.description or "",
        "coverUrl": channel.cover_url,
        "createdAt": iso_utc(channel.created_at),
        "owner": serialize_user(channel.owner),
        "subscriberCount": approved_count,
        "pendingCount": pending_count if channel.owner_id == current_user_id else 0,
        "role": get_channel_role(channel, current_user_id),
        "canPost": channel.owner_id == current_user_id or get_channel_role(channel, current_user_id) == 'approved'
    }
    if include_pending and channel.owner_id == current_user_id:
        pending = ChannelMembership.query.filter_by(channel_id=channel.id, status='pending').order_by(ChannelMembership.created_at.asc()).all()
        payload["pendingRequests"] = [{
            "id": item.id,
            "createdAt": iso_utc(item.created_at),
            "user": serialize_user(item.user)
        } for item in pending]
    return payload

@social_bp.route('/api/social/posts', methods=['GET'])
def get_social_posts():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    feed = request.args.get('feed', 'all')
    query = SocialPost.query.filter_by(channel_id=None)
    if feed == 'following':
        followed_ids = [f.followed_id for f in Follow.query.filter_by(follower_id=user_id).all()]
        if not followed_ids:
            return jsonify([])
        query = query.filter(SocialPost.user_id.in_(followed_ids))

    posts = query.order_by(SocialPost.created_at.desc()).all()
    return jsonify([serialize_post(post, user_id) for post in posts])

@social_bp.route('/api/social/posts', methods=['POST'])
def create_social_post():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    caption = request.form.get('caption', '').strip()
    channel_id = request.form.get('channelId')
    channel = None
    if channel_id:
        channel = Channel.query.get_or_404(int(channel_id))
        role = get_channel_role(channel, user_id)
        if role not in {'owner', 'approved'}:
            return jsonify({"error": "Channel approval required before posting"}), 403

    media_url = None
    media_type = None
    if 'media' in request.files:
        file = request.files['media']
        if file.filename:
            filename = secure_filename(file.filename)
            media_type = media_type_for(filename)
            if not media_type:
                return jsonify({"error": "Upload image or video only"}), 400
            resource_type = 'image' if media_type == 'image' else 'video'
            media_url = upload_to_cloudinary(file, folder='chietchat/social', resource_type=resource_type)

    if not caption and not media_url:
        return jsonify({"error": "Write something or choose a photo/video"}), 400

    post = SocialPost(user_id=user_id, channel_id=channel.id if channel else None, caption=caption, media_url=media_url, media_type=media_type)
    db.session.add(post)
    db.session.commit()
    return jsonify(serialize_post(post, user_id)), 201

@social_bp.route('/api/social/posts/<int:post_id>/like', methods=['POST'])
def toggle_social_post_like(post_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    post = SocialPost.query.get_or_404(post_id)
    existing = SocialPostLike.query.filter_by(post_id=post_id, user_id=user_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"isLiked": False, "likesCount": SocialPostLike.query.filter_by(post_id=post_id).count()})

    db.session.add(SocialPostLike(post_id=post_id, user_id=user_id))
    db.session.commit()
    create_notification(post.user_id, user_id, 'like', 'liked your post', post_id)
    return jsonify({"isLiked": True, "likesCount": SocialPostLike.query.filter_by(post_id=post_id).count()})

@social_bp.route('/api/social/posts/<int:post_id>/comments', methods=['GET'])
def get_social_post_comments(post_id):
    SocialPost.query.get_or_404(post_id)
    comments = SocialPostComment.query.filter_by(post_id=post_id).order_by(SocialPostComment.created_at.asc()).all()
    return jsonify([{
        "id": comment.id,
        "content": comment.content,
        "createdAt": iso_utc(comment.created_at),
        "user": serialize_user(comment.user)
    } for comment in comments])

@social_bp.route('/api/social/posts/<int:post_id>/comments', methods=['POST'])
def create_social_post_comment(post_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    post = SocialPost.query.get_or_404(post_id)
    content = get_json_data().get('content', '').strip()
    if not content:
        return jsonify({"error": "Comment cannot be empty"}), 400
    comment = SocialPostComment(post_id=post_id, user_id=user_id, content=content)
    db.session.add(comment)
    db.session.commit()
    create_notification(post.user_id, user_id, 'comment', f"commented: {content[:50]}", post_id)
    return jsonify({"id": comment.id, "message": "Comment added"}), 201

@social_bp.route('/api/social/posts/<int:post_id>', methods=['DELETE'])
def delete_social_post(post_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    post = SocialPost.query.get_or_404(post_id)
    if post.user_id != user_id and not (post.channel and post.channel.owner_id == user_id):
        return jsonify({"error": "Forbidden"}), 403
    db.session.delete(post)
    db.session.commit()
    return jsonify({"message": "Post deleted"})

@social_bp.route('/api/social/channels', methods=['GET'])
def get_channels():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    query = request.args.get('q', '').strip()
    channels_query = Channel.query
    if query:
        channels_query = channels_query.filter(or_(Channel.name.ilike(f"%{query}%"), Channel.description.ilike(f"%{query}%")))
    channels = channels_query.order_by(Channel.created_at.desc()).all()
    return jsonify([serialize_channel(channel, user_id) for channel in channels])

@social_bp.route('/api/social/channels', methods=['POST'])
def create_channel():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    name = request.form.get('name', '').strip()
    description = request.form.get('description', '').strip()
    if not name:
        return jsonify({"error": "Channel name is required"}), 400
    cover_url = None
    if 'cover' in request.files and request.files['cover'].filename:
        filename = secure_filename(request.files['cover'].filename)
        if media_type_for(filename) != 'image':
            return jsonify({"error": "Cover must be an image"}), 400
        cover_url = upload_to_cloudinary(request.files['cover'], folder='chietchat/channels', resource_type='image')
    channel = Channel(owner_id=user_id, name=name, description=description, cover_url=cover_url)
    db.session.add(channel)
    db.session.commit()
    return jsonify(serialize_channel(channel, user_id, include_pending=True)), 201

@social_bp.route('/api/social/channels/<int:channel_id>', methods=['GET'])
def get_channel(channel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    channel = Channel.query.get_or_404(channel_id)
    posts = SocialPost.query.filter_by(channel_id=channel.id).order_by(SocialPost.created_at.desc()).all()
    return jsonify({
        "channel": serialize_channel(channel, user_id, include_pending=True),
        "posts": [serialize_post(post, user_id) for post in posts]
    })

@social_bp.route('/api/social/channels/<int:channel_id>/subscribe', methods=['POST'])
def request_channel_subscription(channel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    channel = Channel.query.get_or_404(channel_id)
    if channel.owner_id == user_id:
        return jsonify({"role": "owner"})
    membership = ChannelMembership.query.filter_by(channel_id=channel_id, user_id=user_id).first()
    if membership:
        if membership.status == 'rejected':
            membership.status = 'pending'
            db.session.commit()
        return jsonify({"role": membership.status})
    membership = ChannelMembership(channel_id=channel_id, user_id=user_id, status='pending')
    db.session.add(membership)
    db.session.commit()
    create_notification(channel.owner_id, user_id, 'channel_request', f"requested to join {channel.name}", channel.id)
    return jsonify({"role": "pending"})

@social_bp.route('/api/social/channels/<int:channel_id>/members/<int:membership_id>', methods=['POST'])
def review_channel_subscription(channel_id, membership_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    channel = Channel.query.get_or_404(channel_id)
    if channel.owner_id != user_id:
        return jsonify({"error": "Only channel owner can approve requests"}), 403
    action = get_json_data().get('action')
    if action not in {'approve', 'reject'}:
        return jsonify({"error": "action must be approve or reject"}), 400
    membership = ChannelMembership.query.filter_by(id=membership_id, channel_id=channel_id).first_or_404()
    membership.status = 'approved' if action == 'approve' else 'rejected'
    db.session.commit()
    create_notification(membership.user_id, user_id, 'channel_request', f"your {channel.name} request was {membership.status}", channel.id)
    return jsonify(serialize_channel(channel, user_id, include_pending=True))
