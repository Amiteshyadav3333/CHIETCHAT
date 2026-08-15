import datetime
import json
from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import or_
from werkzeug.utils import secure_filename

from models import (
    db, User, Follow, SocialPost, SocialPostLike, SocialPostShare, SocialPostComment, SocialPollVote,
    Channel, ChannelMembership, CommentReply, Status
)
from utils import (
    get_current_user_id, get_json_data, iso_utc, serialize_user,
    upload_to_cloudinary, create_notification, queue_media_deletion, process_media_deletion_task, utc_now
)

social_bp = Blueprint('social_bp', __name__)

ALLOWED_MEDIA = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov', 'm4v'}
IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
FEED_DEFAULT_LIMIT = 30
FEED_MAX_LIMIT = 50
COMMENT_DEFAULT_LIMIT = 50
COMMENT_MAX_LIMIT = 100
MAX_POST_CAPTION_LENGTH = 1000
MAX_COMMENT_LENGTH = 1000
MAX_CHANNEL_QUERY_LENGTH = 100


def bounded_limit(default, maximum):
    return min(max(request.args.get('limit', default, type=int), 1), maximum)

def media_type_for(filename):
    extension = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if extension not in ALLOWED_MEDIA:
        return None
    return 'image' if extension in IMAGE_EXTENSIONS else 'video'

def serialize_post(post, current_user_id):
    is_liked = SocialPostLike.query.filter_by(post_id=post.id, user_id=current_user_id).first() is not None
    is_following = Follow.query.filter_by(follower_id=current_user_id, followed_id=post.user_id).first() is not None
    is_retweeted = SocialPost.query.filter_by(retweet_of_id=post.id, user_id=current_user_id).first() is not None
    user_data = serialize_user(post.user)
    user_data["isFollowing"] = is_following
    channel_data = None
    if post.channel:
        channel_data = {
            "id": post.channel.id,
            "name": post.channel.name,
            "ownerId": post.channel.owner_id
        }
    # Original post data if this is a retweet
    original_post = None
    if post.retweet_of_id and post.retweet_of:
        orig = post.retweet_of
        orig_user = serialize_user(orig.user)
        original_post = {
            "id": orig.id,
            "caption": orig.caption or "",
            "mediaUrl": orig.media_url,
            "mediaType": orig.media_type,
            "createdAt": iso_utc(orig.created_at),
            "user": orig_user,
            "likesCount": len(orig.likes),
            "commentsCount": len(orig.comments),
            "retweetCount": SocialPost.query.filter_by(retweet_of_id=orig.id).count()
        }
    retweet_count = SocialPost.query.filter_by(retweet_of_id=post.id).count()
    poll_options = []
    try:
        poll_options = json.loads(post.poll_options or '[]')
    except (TypeError, ValueError):
        poll_options = []
    vote_counts = [0] * len(poll_options)
    selected_poll_option = None
    for vote in post.poll_votes:
        if 0 <= vote.option_index < len(vote_counts):
            vote_counts[vote.option_index] += 1
        if vote.user_id == current_user_id:
            selected_poll_option = vote.option_index
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
        "retweetCount": retweet_count,
        "shareCount": post.share_count or 0,
        "isLiked": is_liked,
        "isRetweeted": is_retweeted,
        "isRetweet": post.retweet_of_id is not None,
        "originalPost": original_post,
        "canDelete": post.user_id == current_user_id or (post.channel and post.channel.owner_id == current_user_id)
        ,"postKind": post.post_kind or 'standard'
        ,"poll": {"options": poll_options, "counts": vote_counts, "totalVotes": sum(vote_counts), "selectedOption": selected_poll_option} if poll_options else None
    }

def serialize_comment(comment, current_user_id):
    replies = comment.replies
    sorted_replies = sorted(replies, key=lambda r: r.created_at)
    return {
        "id": comment.id,
        "content": comment.content,
        "createdAt": iso_utc(comment.created_at),
        "user": serialize_user(comment.user),
        "parentId": comment.parent_id,
        "replies": [serialize_comment(r, current_user_id) for r in sorted_replies]
    }


def serialize_reply(reply):
    return {
        "id": reply.id,
        "content": reply.content,
        "createdAt": iso_utc(reply.created_at),
        "user": serialize_user(reply.user)
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
        pending = ChannelMembership.query.filter_by(channel_id=channel.id, status='pending').order_by(
            ChannelMembership.created_at.asc()
        ).limit(100).all()
        payload["pendingRequests"] = [{
            "id": item.id,
            "createdAt": iso_utc(item.created_at),
            "user": serialize_user(item.user)
        } for item in pending]
    return payload

# ─── POSTS ────────────────────────────────────────────────────────────────────

@social_bp.route('/api/social/posts', methods=['GET'])
def get_social_posts():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    feed = request.args.get('feed', 'all')
    query = SocialPost.query.filter_by(channel_id=None)
    if feed == 'community':
        query = query.filter(SocialPost.post_kind == 'community')
    else:
        query = query.filter(or_(SocialPost.post_kind == 'standard', SocialPost.post_kind.is_(None)))
    if feed == 'following':
        followed_ids = [f.followed_id for f in Follow.query.filter_by(follower_id=user_id).all()]
        if not followed_ids:
            return jsonify([])
        query = query.filter(SocialPost.user_id.in_(followed_ids))

    posts = query.order_by(SocialPost.created_at.desc()).limit(
        bounded_limit(FEED_DEFAULT_LIMIT, FEED_MAX_LIMIT)
    ).all()
    return jsonify([serialize_post(post, user_id) for post in posts])

@social_bp.route('/api/social/posts', methods=['POST'])
def create_social_post():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    caption = request.form.get('caption', '').strip()
    post_kind = request.form.get('postKind', 'standard').strip().lower()
    if post_kind not in {'standard', 'community'}:
        return jsonify({"error": "Invalid post type"}), 400
    poll_options = []
    raw_poll_options = request.form.get('pollOptions', '')
    if raw_poll_options:
        try:
            poll_options = [str(item).strip()[:100] for item in json.loads(raw_poll_options) if str(item).strip()]
        except (TypeError, ValueError):
            return jsonify({"error": "Invalid poll options"}), 400
        if len(poll_options) < 2 or len(poll_options) > 4:
            return jsonify({"error": "A poll needs 2 to 4 options"}), 400
    if len(caption) > MAX_POST_CAPTION_LENGTH:
        return jsonify({"error": f"Caption must be {MAX_POST_CAPTION_LENGTH} characters or less"}), 400
    channel_id = request.form.get('channelId')
    channel = None
    if channel_id:
        channel = db.get_or_404(Channel, int(channel_id))
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
            try:
                media_url = upload_to_cloudinary(file, folder='chietchat/social', resource_type=resource_type)
            except ValueError as error:
                return jsonify({'error': str(error)}), 400

    if not caption and not media_url:
        return jsonify({"error": "Write something or choose a photo/video"}), 400

    post = SocialPost(
        user_id=user_id,
        channel_id=channel.id if channel else None,
        caption=caption,
        media_url=media_url,
        media_type=media_type,
        post_kind=post_kind,
        poll_options=json.dumps(poll_options) if poll_options else None,
    )
    db.session.add(post)
    db.session.commit()
    return jsonify(serialize_post(post, user_id)), 201

@social_bp.route('/api/social/posts/<int:post_id>/poll-vote', methods=['POST'])
def vote_social_poll(post_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    post = db.get_or_404(SocialPost, post_id)
    try:
        options = json.loads(post.poll_options or '[]')
        option_index = int(get_json_data().get('optionIndex'))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid poll vote"}), 400
    if option_index < 0 or option_index >= len(options):
        return jsonify({"error": "Invalid poll option"}), 400
    vote = SocialPollVote.query.filter_by(post_id=post.id, user_id=user_id).first()
    if vote:
        vote.option_index = option_index
    else:
        db.session.add(SocialPollVote(post_id=post.id, user_id=user_id, option_index=option_index))
    db.session.commit()
    return jsonify(serialize_post(post, user_id)["poll"])

# ─── RETWEET ──────────────────────────────────────────────────────────────────

@social_bp.route('/api/social/posts/<int:post_id>/retweet', methods=['POST'])
def retweet_post(post_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    original = db.get_or_404(SocialPost, post_id)
    # Prevent retweeting a retweet (retweet the original instead)
    if original.retweet_of_id:
        post_id = original.retweet_of_id
        original = db.get_or_404(SocialPost, post_id)

    # Toggle retweet
    existing = SocialPost.query.filter_by(retweet_of_id=post_id, user_id=user_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"isRetweeted": False, "retweetCount": SocialPost.query.filter_by(retweet_of_id=post_id).count()})

    retweet = SocialPost(
        user_id=user_id,
        channel_id=None,
        caption=None,
        media_url=None,
        media_type=None,
        retweet_of_id=post_id
    )
    db.session.add(retweet)
    db.session.commit()
    if original.user_id != user_id:
        create_notification(original.user_id, user_id, 'retweet', 'retweeted your post', post_id)
    return jsonify({"isRetweeted": True, "retweetCount": SocialPost.query.filter_by(retweet_of_id=post_id).count()})

# ─── SHARE ────────────────────────────────────────────────────────────────────

@social_bp.route('/api/social/posts/<int:post_id>/share', methods=['POST'])
def share_post(post_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    post = db.get_or_404(SocialPost, post_id)
    if not SocialPostShare.query.filter_by(post_id=post_id, user_id=user_id).first():
        db.session.add(SocialPostShare(post_id=post_id, user_id=user_id))
        post.share_count = (post.share_count or 0) + 1
        db.session.commit()
    return jsonify({"shareCount": post.share_count})

@social_bp.route('/api/social/posts/<int:post_id>/story', methods=['POST'])
def share_post_to_story(post_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    post = db.get_or_404(SocialPost, post_id)
    source = post.retweet_of if post.retweet_of_id and post.retweet_of else post
    media_url = source.media_url or f"{current_app.config['FRONTEND_URL'].rstrip('/')}/cheetchat-logo.png"
    media_type = source.media_type if source.media_url else 'image'
    caption = (source.caption or f"Post by @{source.user.username}").strip()[:300]
    status = Status(
        user_id=user_id,
        media_url=media_url,
        media_type=media_type,
        caption=caption,
        duration=15,
        expires_at=utc_now() + datetime.timedelta(hours=24),
    )
    db.session.add(status)
    db.session.commit()
    return jsonify({"message": "Post added to your story", "id": status.id}), 201

# ─── LIKE ─────────────────────────────────────────────────────────────────────

@social_bp.route('/api/social/posts/<int:post_id>/like', methods=['POST'])
def toggle_social_post_like(post_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    post = db.get_or_404(SocialPost, post_id)
    existing = SocialPostLike.query.filter_by(post_id=post_id, user_id=user_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"isLiked": False, "likesCount": SocialPostLike.query.filter_by(post_id=post_id).count()})

    db.session.add(SocialPostLike(post_id=post_id, user_id=user_id))
    db.session.commit()
    create_notification(post.user_id, user_id, 'like', 'liked your post', post_id)
    return jsonify({"isLiked": True, "likesCount": SocialPostLike.query.filter_by(post_id=post_id).count()})

# ─── COMMENTS ─────────────────────────────────────────────────────────────────

@social_bp.route('/api/social/posts/<int:post_id>/comments', methods=['GET'])
def get_social_post_comments(post_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    db.get_or_404(SocialPost, post_id)
    comments = SocialPostComment.query.filter_by(post_id=post_id, parent_id=None).order_by(
        SocialPostComment.created_at.asc()
    ).limit(bounded_limit(COMMENT_DEFAULT_LIMIT, COMMENT_MAX_LIMIT)).all()
    return jsonify([serialize_comment(c, user_id) for c in comments])

@social_bp.route('/api/social/posts/<int:post_id>/comments', methods=['POST'])
def create_social_post_comment(post_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    post = db.get_or_404(SocialPost, post_id)
    data = get_json_data()
    raw_content = data.get('content')
    if not isinstance(raw_content, str):
        return jsonify({"error": "Comment must be text"}), 400
    content = raw_content.strip()
    if not content:
        return jsonify({"error": "Comment cannot be empty"}), 400
    if len(content) > MAX_COMMENT_LENGTH:
        return jsonify({"error": f"Comment must be {MAX_COMMENT_LENGTH} characters or less"}), 400
    parent_id = data.get('parentId')
    if parent_id is not None:
        parent = SocialPostComment.query.filter_by(id=parent_id, post_id=post_id, parent_id=None).first()
        if not parent:
            return jsonify({"error": "Invalid parent comment"}), 400
    comment = SocialPostComment(post_id=post_id, user_id=user_id, content=content, parent_id=parent_id)
    db.session.add(comment)
    db.session.commit()
    create_notification(post.user_id, user_id, 'comment', f"commented: {content[:50]}", post_id)
    return jsonify(serialize_comment(comment, user_id)), 201

# ─── COMMENT REPLIES ──────────────────────────────────────────────────────────

@social_bp.route('/api/social/comments/<int:comment_id>/replies', methods=['POST'])
def reply_to_comment(comment_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    comment = db.get_or_404(SocialPostComment, comment_id)
    raw_content = get_json_data().get('content')
    if not isinstance(raw_content, str):
        return jsonify({"error": "Reply must be text"}), 400
    content = raw_content.strip()
    if not content:
        return jsonify({"error": "Reply cannot be empty"}), 400
    if len(content) > MAX_COMMENT_LENGTH:
        return jsonify({"error": f"Reply must be {MAX_COMMENT_LENGTH} characters or less"}), 400
    if comment.parent_id is not None:
        return jsonify({"error": "Replies can only be added to top-level comments"}), 400
    reply = SocialPostComment(
        post_id=comment.post_id,
        user_id=user_id,
        parent_id=comment_id,
        content=content
    )
    db.session.add(reply)
    db.session.commit()
    create_notification(comment.user_id, user_id, 'comment_reply', f"replied: {content[:50]}", comment.post_id)
    return jsonify(serialize_comment(reply, user_id)), 201

@social_bp.route('/api/social/comments/<int:comment_id>', methods=['DELETE'])
def delete_social_comment(comment_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    comment = db.get_or_404(SocialPostComment, comment_id)
    post = db.session.get(SocialPost, comment.post_id)
    if comment.user_id != user_id and (post and post.user_id != user_id):
        return jsonify({"error": "Forbidden"}), 403
    db.session.delete(comment)
    db.session.commit()
    return jsonify({"message": "Comment deleted"})



# ─── DELETE POST ──────────────────────────────────────────────────────────────

@social_bp.route('/api/social/posts/<int:post_id>', methods=['DELETE'])
def delete_social_post(post_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    post = db.get_or_404(SocialPost, post_id)
    if post.user_id != user_id and not (post.channel and post.channel.owner_id == user_id):
        return jsonify({"error": "Forbidden"}), 403
    deletion_task = queue_media_deletion(post.media_url, post.media_type or 'image')
    db.session.delete(post)
    db.session.commit()
    if deletion_task:
        process_media_deletion_task(deletion_task.id)
    return jsonify({"message": "Post deleted"})

# ─── USER PROFILE ─────────────────────────────────────────────────────────────

@social_bp.route('/api/social/users/<int:profile_user_id>', methods=['GET'])
def get_user_profile(profile_user_id):
    current_user_id = get_current_user_id()
    if not current_user_id:
        return jsonify({"error": "Unauthorized"}), 401

    profile_user = db.get_or_404(User, profile_user_id)
    followers_count = Follow.query.filter_by(followed_id=profile_user_id).count()
    following_count = Follow.query.filter_by(follower_id=profile_user_id).count()
    posts_count = SocialPost.query.filter_by(user_id=profile_user_id, channel_id=None, retweet_of_id=None).count()
    is_following = Follow.query.filter_by(follower_id=current_user_id, followed_id=profile_user_id).first() is not None

    user_data = serialize_user(profile_user)
    user_data["followersCount"] = followers_count
    user_data["followingCount"] = following_count
    user_data["postsCount"] = posts_count
    user_data["isFollowing"] = is_following
    user_data["bio"] = profile_user.bio or ""
    user_data["websiteUrl"] = profile_user.website_url or ""
    user_data["joinedAt"] = iso_utc(profile_user.created_at)

    posts = SocialPost.query.filter_by(user_id=profile_user_id, channel_id=None).order_by(SocialPost.created_at.desc()).limit(30).all()
    return jsonify({
        "user": user_data,
        "posts": [serialize_post(p, current_user_id) for p in posts]
    })

# ─── CHANNELS ─────────────────────────────────────────────────────────────────

@social_bp.route('/api/social/channels', methods=['GET'])
def get_channels():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    query = request.args.get('q', '').strip()
    if len(query) > MAX_CHANNEL_QUERY_LENGTH:
        return jsonify({"error": f"Search must be {MAX_CHANNEL_QUERY_LENGTH} characters or less"}), 400
    channels_query = Channel.query
    if query:
        channels_query = channels_query.filter(or_(Channel.name.ilike(f"%{query}%"), Channel.description.ilike(f"%{query}%")))
    channels = channels_query.order_by(Channel.created_at.desc()).limit(
        bounded_limit(FEED_DEFAULT_LIMIT, FEED_MAX_LIMIT)
    ).all()
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
    if len(name) > 120:
        return jsonify({"error": "Channel name must be 120 characters or less"}), 400
    if len(description) > 500:
        return jsonify({"error": "Channel description must be 500 characters or less"}), 400
    cover_url = None
    if 'cover' in request.files and request.files['cover'].filename:
        filename = secure_filename(request.files['cover'].filename)
        if media_type_for(filename) != 'image':
            return jsonify({"error": "Cover must be an image"}), 400
        try:
            cover_url = upload_to_cloudinary(request.files['cover'], folder='chietchat/channels', resource_type='image')
        except ValueError as error:
            return jsonify({'error': str(error)}), 400
    channel = Channel(owner_id=user_id, name=name, description=description, cover_url=cover_url)
    db.session.add(channel)
    db.session.commit()
    return jsonify(serialize_channel(channel, user_id, include_pending=True)), 201

@social_bp.route('/api/social/channels/<int:channel_id>', methods=['GET'])
def get_channel(channel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    channel = db.get_or_404(Channel, channel_id)
    posts = SocialPost.query.filter_by(channel_id=channel.id).order_by(SocialPost.created_at.desc()).limit(
        bounded_limit(FEED_DEFAULT_LIMIT, FEED_MAX_LIMIT)
    ).all()
    return jsonify({
        "channel": serialize_channel(channel, user_id, include_pending=True),
        "posts": [serialize_post(post, user_id) for post in posts]
    })

@social_bp.route('/api/social/channels/<int:channel_id>/subscribe', methods=['POST'])
def request_channel_subscription(channel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    channel = db.get_or_404(Channel, channel_id)
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
    channel = db.get_or_404(Channel, channel_id)
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
