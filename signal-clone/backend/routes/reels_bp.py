import datetime
from flask import Blueprint, jsonify, request
from models import db, Reel, ReelLike, ReelView, ReelShare, ReelRepost, ReelComment, Follow, User, Status, UserReport
from utils import (
    get_current_user_id, iso_utc, serialize_user, upload_to_cloudinary,
    get_json_data, create_notification, queue_media_deletion, process_media_deletion_task, utc_now
)
from content_moderation import ModerationUnavailable, reject_adult_content

reels_bp = Blueprint('reels_bp', __name__)

FEED_DEFAULT_LIMIT = 30
FEED_MAX_LIMIT = 50
COMMENT_DEFAULT_LIMIT = 50
COMMENT_MAX_LIMIT = 100
MAX_REEL_CAPTION_LENGTH = 500
MAX_COMMENT_LENGTH = 1000
MAX_REPOST_NOTE_LENGTH = 280
FREE_DAILY_REEL_LIMIT = 3
PREMIUM_DAILY_REEL_LIMIT = 10
REEL_CATEGORIES = {'entertainment', 'comedy', 'dance', 'music', 'sports', 'gaming', 'food', 'travel', 'fashion', 'fitness', 'education', 'technology', 'devotional', 'news'}

@reels_bp.route('/api/reels/<int:reel_id>/report', methods=['POST'])
def report_reel(reel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    reel = db.get_or_404(Reel, reel_id)
    if reel.user_id == user_id:
        return jsonify({"error": "You cannot report your own Reel"}), 400
    reason = str(get_json_data().get('reason') or 'Adult or inappropriate video').strip()[:255]
    existing = UserReport.query.filter_by(reporter_id=user_id, content_type='reel', content_id=reel.id).first()
    if existing:
        return jsonify({"message": "This Reel is already reported"})
    db.session.add(UserReport(reporter_id=user_id, reported_id=reel.user_id, reason=reason, content_type='reel', content_id=reel.id))
    db.session.commit()
    return jsonify({"message": "Report submitted for review"}), 201


def serialize_reel(reel, current_user_id, is_following=None):
    user_data = serialize_user(reel.user, viewer_id=current_user_id)
    if is_following is None:
        is_following = Follow.query.filter_by(
            follower_id=current_user_id, followed_id=reel.user_id
        ).first() is not None
    user_data["isFollowing"] = is_following
    repost = ReelRepost.query.filter_by(reel_id=reel.id, user_id=current_user_id).first()
    return {
        "id": reel.id,
        "videoUrl": reel.video_url,
        "musicUrl": reel.music_url,
        "musicName": reel.music_name,
        "musicVolume": reel.music_volume if reel.music_volume is not None else 0.8,
        "caption": reel.caption,
        "category": reel.category or 'entertainment',
        "createdAt": iso_utc(reel.created_at),
        "user": user_data,
        "likesCount": len(reel.likes),
        "commentsCount": len(reel.comments),
        "sharesCount": reel.shares_count or 0,
        "viewsCount": reel.views_count or 0,
        "isMonetized": bool(reel.is_monetized),
        "earningsPaise": reel.earnings_paise or 0 if reel.user_id == current_user_id else None,
        "reactionsCount": Reel.query.filter_by(parent_reel_id=reel.id).count(),
        "repostsCount": len(reel.reposts),
        "isLiked": ReelLike.query.filter_by(reel_id=reel.id, user_id=current_user_id).first() is not None,
        "isReposted": repost is not None,
        "repostNote": repost.note if repost else "",
        "parentReelId": reel.parent_reel_id,
        "filterName": reel.filter_name
    }


def bounded_limit(default, maximum):
    return min(max(request.args.get('limit', default, type=int), 1), maximum)

@reels_bp.route('/api/reels', methods=['GET'])
def get_reels():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    filter_type = request.args.get('filter', 'foryou')
    
    query = Reel.query
    if filter_type == 'following':
        followed_ids = [f.followed_id for f in Follow.query.filter_by(follower_id=user_id).all()]
        query = query.filter(Reel.user_id.in_(followed_ids))
    elif filter_type == 'custom':
        interests = {item.strip().lower() for item in request.args.get('interests', '').split(',')} & REEL_CATEGORIES
        if interests:
            query = query.filter(Reel.category.in_(interests))
    
    reels = query.order_by(Reel.created_at.desc()).limit(
        bounded_limit(FEED_DEFAULT_LIMIT, FEED_MAX_LIMIT)
    ).all()
    result = [serialize_reel(r, user_id) for r in reels]
    return jsonify(result)

@reels_bp.route('/api/users/<int:uid>/reels', methods=['GET'])
def get_user_reels(uid):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    user = db.get_or_404(User, uid)
    reels = Reel.query.filter_by(user_id=uid).order_by(Reel.created_at.desc()).limit(
        bounded_limit(FEED_DEFAULT_LIMIT, FEED_MAX_LIMIT)
    ).all()
    
    follower_count = Follow.query.filter_by(followed_id=uid).count()
    following_count = Follow.query.filter_by(follower_id=uid).count()
    is_following = Follow.query.filter_by(follower_id=user_id, followed_id=uid).first() is not None

    result = [serialize_reel(r, user_id, is_following) for r in reels]
    repost_rows = ReelRepost.query.filter_by(user_id=uid).order_by(ReelRepost.created_at.desc()).limit(
        bounded_limit(FEED_DEFAULT_LIMIT, FEED_MAX_LIMIT)
    ).all()
    reposts = []
    for row in repost_rows:
        item = serialize_reel(row.reel, user_id)
        item["repostNote"] = row.note or ""
        item["repostedAt"] = iso_utc(row.created_at)
        reposts.append(item)
    
    return jsonify({
        "user": {
            **serialize_user(user, viewer_id=user_id),
            "followerCount": follower_count,
            "followingCount": following_count,
            "isFollowing": is_following
        },
        "reels": result,
        "reposts": reposts
    })

@reels_bp.route('/api/reels', methods=['POST'])
def create_reel():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    if 'video' not in request.files:
        return jsonify({"error": "No video file"}), 400
    
    file = request.files['video']
    caption = request.form.get('caption', '').strip()
    category = request.form.get('category', 'entertainment').strip().lower()
    if category not in REEL_CATEGORIES:
        return jsonify({"error": "Invalid Reel category"}), 400
    user = User.query.filter_by(id=user_id).with_for_update().one()
    today = utc_now().date()
    day_start = datetime.datetime.combine(today, datetime.time.min)
    day_end = day_start + datetime.timedelta(days=1)
    premium_active = bool(user.is_premium and (not user.premium_expires_at or user.premium_expires_at > utc_now()))
    daily_limit = PREMIUM_DAILY_REEL_LIMIT if premium_active else FREE_DAILY_REEL_LIMIT
    daily_count = Reel.query.filter(Reel.user_id == user_id, Reel.created_at >= day_start, Reel.created_at < day_end).count()
    if daily_count >= daily_limit:
        return jsonify({"error": f"Your daily Reel limit is {daily_limit}", "code": "DAILY_REEL_LIMIT_REACHED", "limit": daily_limit}), 429
    is_monetized = request.form.get('isMonetized', 'false').lower() == 'true'
    if is_monetized and not premium_active:
        return jsonify({"error": "Premium membership is required for paid reels"}), 403
    if len(caption) > MAX_REEL_CAPTION_LENGTH:
        return jsonify({"error": f"Caption must be {MAX_REEL_CAPTION_LENGTH} characters or less"}), 400
    music_url = request.form.get('musicUrl', '')
    music_name = request.form.get('musicName', '')
    try:
        media_duration = float(request.form.get('mediaDuration', 60))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid Reel duration"}), 400
    if media_duration <= 0 or media_duration > 60:
        return jsonify({"error": "Reels must be 60 seconds or shorter"}), 400
    try:
        music_volume = float(request.form.get('musicVolume', 0.8))
        music_volume = min(max(music_volume, 0), 1)
    except (TypeError, ValueError):
        music_volume = 0.8
    
    try:
        blocked, adult_score = reject_adult_content(file, 'video')
        if blocked:
            return jsonify({
                "error": "Upload blocked: adult content is not allowed",
                "code": "ADULT_CONTENT_BLOCKED",
                "adultScore": round(adult_score, 3),
            }), 422
        video_url = upload_to_cloudinary(file, folder='chietchat/reels', resource_type='video')
        parent_reel_id = request.form.get('parentReelId')
        filter_name = request.form.get('filterName', '')
        if parent_reel_id == 'null' or not parent_reel_id:
            parent_reel_id = None
        else:
            try:
                parent_reel_id = int(parent_reel_id)
            except ValueError:
                parent_reel_id = None

        new_reel = Reel(
            user_id=user_id, 
            video_url=video_url, 
            caption=caption, 
            category=category,
            music_url=music_url, 
            music_name=music_name,
            music_volume=music_volume,
            parent_reel_id=parent_reel_id,
            filter_name=filter_name
            ,is_monetized=is_monetized
        )
        db.session.add(new_reel)
        db.session.commit()
        return jsonify({"message": "Reel posted", "id": new_reel.id}), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except ModerationUnavailable as e:
        return jsonify({"error": str(e), "code": "MODERATION_UNAVAILABLE"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@reels_bp.route('/api/reels/<int:reel_id>/public', methods=['GET'])
def get_public_reel(reel_id):
    """Public endpoint — no auth required. Returns a single reel for shared links."""
    reel = db.session.get(Reel, reel_id)
    if not reel:
        return jsonify({"error": "Reel not found"}), 404

    user_data = serialize_user(reel.user, viewer_id=-1)
    reactions_count = Reel.query.filter_by(parent_reel_id=reel.id).count()

    return jsonify({
        "id": reel.id,
        "videoUrl": reel.video_url,
        "musicUrl": reel.music_url,
        "musicName": reel.music_name,
        "musicVolume": reel.music_volume if reel.music_volume is not None else 0.8,
        "caption": reel.caption,
        "createdAt": iso_utc(reel.created_at),
        "user": user_data,
        "likesCount": len(reel.likes),
        "commentsCount": len(reel.comments),
        "sharesCount": reel.shares_count or 0,
        "viewsCount": reel.views_count or 0,
        "reactionsCount": reactions_count,
        "isLiked": False,
        "parentReelId": reel.parent_reel_id,
        "filterName": reel.filter_name
    })

@reels_bp.route('/api/reels/<int:reel_id>/like', methods=['POST'])
def like_reel(reel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    reel = db.get_or_404(Reel, reel_id)
    existing = ReelLike.query.filter_by(reel_id=reel_id, user_id=user_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"isLiked": False})
    
    db.session.add(ReelLike(reel_id=reel_id, user_id=user_id))
    db.session.commit()
    
    if reel.user_id != user_id:
        create_notification(
            recipient_id=reel.user_id,
            sender_id=user_id,
            n_type='like',
            content="liked your reel",
            target_id=reel_id
        )
    
    return jsonify({"isLiked": True})

def serialize_reel_comment(comment, current_user_id):
    replies = comment.replies
    sorted_replies = sorted(replies, key=lambda r: (not bool(r.user.is_premium), r.created_at))
    return {
        "id": comment.id,
        "content": comment.content,
        "createdAt": iso_utc(comment.created_at),
        "user": serialize_user(comment.user, viewer_id=current_user_id),
        "parentId": comment.parent_id,
        "replies": [serialize_reel_comment(r, current_user_id) for r in sorted_replies]
        ,"isBoosted": bool(comment.user.is_premium)
    }

@reels_bp.route('/api/reels/<int:reel_id>/comments', methods=['GET'])
def get_reel_comments(reel_id):
    db.get_or_404(Reel, reel_id)
    comments = ReelComment.query.filter_by(reel_id=reel_id, parent_id=None).order_by(
        ReelComment.created_at.asc()
    ).limit(bounded_limit(COMMENT_DEFAULT_LIMIT, COMMENT_MAX_LIMIT)).all()
    user_id = get_current_user_id()
    return jsonify([serialize_reel_comment(c, user_id) for c in comments])

@reels_bp.route('/api/reels/<int:reel_id>/comments', methods=['POST'])
def comment_on_reel(reel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = get_json_data()
    raw_content = data.get('content')
    if not isinstance(raw_content, str):
        return jsonify({"error": "Comment must be text"}), 400
    content = raw_content.strip()
    if not content:
        return jsonify({"error": "Comment cannot be empty"}), 400
    if len(content) > MAX_COMMENT_LENGTH:
        return jsonify({"error": f"Comment must be {MAX_COMMENT_LENGTH} characters or less"}), 400
    reel = db.get_or_404(Reel, reel_id)
    parent_id = data.get('parentId')
    if parent_id is not None:
        parent = ReelComment.query.filter_by(id=parent_id, reel_id=reel_id, parent_id=None).first()
        if not parent:
            return jsonify({"error": "Invalid parent comment"}), 400
    
    comment = ReelComment(reel_id=reel_id, user_id=user_id, content=content, parent_id=parent_id)
    db.session.add(comment)
    db.session.commit()
    
    if reel.user_id != user_id:
        create_notification(
            recipient_id=reel.user_id,
            sender_id=user_id,
            n_type='comment',
            content=f"commented: {content[:50]}...",
            target_id=reel_id
        )
    
    return jsonify({"id": comment.id, "message": "Comment added", "comment": serialize_reel_comment(comment, user_id)})

@reels_bp.route('/api/reels/comments/<int:comment_id>/replies', methods=['POST'])
def reply_to_reel_comment(comment_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    parent_comment = db.get_or_404(ReelComment, comment_id)
    raw_content = get_json_data().get('content')
    if not isinstance(raw_content, str):
        return jsonify({"error": "Reply must be text"}), 400
    content = raw_content.strip()
    if not content:
        return jsonify({"error": "Reply cannot be empty"}), 400
    if len(content) > MAX_COMMENT_LENGTH:
        return jsonify({"error": f"Reply must be {MAX_COMMENT_LENGTH} characters or less"}), 400
    if parent_comment.parent_id is not None:
        return jsonify({"error": "Replies can only be added to top-level comments"}), 400
    
    reply = ReelComment(
        reel_id=parent_comment.reel_id,
        user_id=user_id,
        parent_id=comment_id,
        content=content
    )
    db.session.add(reply)
    db.session.commit()
    
    create_notification(
        recipient_id=parent_comment.user_id,
        sender_id=user_id,
        n_type='comment_reply',
        content=f"replied to your comment: {content[:50]}...",
        target_id=parent_comment.reel_id
    )
    
    return jsonify(serialize_reel_comment(reply, user_id)), 201

@reels_bp.route('/api/reels/comments/<int:comment_id>', methods=['DELETE'])
def delete_reel_comment(comment_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    comment = db.get_or_404(ReelComment, comment_id)
    reel = db.session.get(Reel, comment.reel_id)
    if comment.user_id != user_id and (reel and reel.user_id != user_id):
        return jsonify({"error": "Forbidden"}), 403
    db.session.delete(comment)
    db.session.commit()
    return jsonify({"message": "Comment deleted"})

@reels_bp.route('/api/reels/comments/<int:comment_id>', methods=['PATCH'])
def edit_reel_comment(comment_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    comment = db.get_or_404(ReelComment, comment_id)
    if comment.user_id != user_id:
        return jsonify({"error": "You can only edit your own comment"}), 403
    raw_content = get_json_data().get('content')
    if not isinstance(raw_content, str):
        return jsonify({"error": "Comment must be text"}), 400
    content = raw_content.strip()
    if not content:
        return jsonify({"error": "Comment cannot be empty"}), 400
    if len(content) > MAX_COMMENT_LENGTH:
        return jsonify({"error": f"Comment must be {MAX_COMMENT_LENGTH} characters or less"}), 400
    comment.content = content
    db.session.commit()
    return jsonify(serialize_reel_comment(comment, user_id))



@reels_bp.route('/api/reels/<int:reel_id>/share', methods=['POST'])
def share_reel(reel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    reel = db.get_or_404(Reel, reel_id)
    if not ReelShare.query.filter_by(reel_id=reel_id, user_id=user_id).first():
        db.session.add(ReelShare(reel_id=reel_id, user_id=user_id))
        reel.shares_count = (reel.shares_count or 0) + 1
        db.session.commit()
    return jsonify({"sharesCount": reel.shares_count})

@reels_bp.route('/api/reels/<int:reel_id>/repost', methods=['POST', 'DELETE'])
def repost_reel(reel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    reel = db.get_or_404(Reel, reel_id)
    existing = ReelRepost.query.filter_by(reel_id=reel_id, user_id=user_id).first()
    if request.method == 'DELETE':
        if existing:
            db.session.delete(existing)
            db.session.commit()
        reposts_count = ReelRepost.query.filter_by(reel_id=reel_id).count()
        return jsonify({"isReposted": False, "repostsCount": reposts_count, "repostNote": ""})

    raw_note = get_json_data().get('note', '')
    if not isinstance(raw_note, str):
        return jsonify({"error": "Repost reaction must be text"}), 400
    note = raw_note.strip()
    if len(note) > MAX_REPOST_NOTE_LENGTH:
        return jsonify({"error": f"Repost reaction must be {MAX_REPOST_NOTE_LENGTH} characters or less"}), 400
    created = existing is None
    if existing:
        existing.note = note
    else:
        existing = ReelRepost(reel_id=reel_id, user_id=user_id, note=note)
        db.session.add(existing)
    db.session.commit()
    if created and reel.user_id != user_id:
        create_notification(reel.user_id, user_id, 'repost', 'reposted your reel', reel_id)
    return jsonify({"isReposted": True, "repostsCount": len(reel.reposts), "repostNote": existing.note or ""})

@reels_bp.route('/api/reels/<int:reel_id>/story', methods=['POST'])
def share_reel_to_story(reel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    reel = db.get_or_404(Reel, reel_id)
    raw_caption = get_json_data().get('caption', '')
    if not isinstance(raw_caption, str):
        return jsonify({"error": "Caption must be text"}), 400
    caption = raw_caption.strip()[:300] or f"Reel by @{reel.user.username}"
    status = Status(
        user_id=user_id, media_url=reel.video_url, media_type='video', caption=caption,
        music_url=reel.music_url, music_name=reel.music_name, duration=15,
        expires_at=utc_now() + datetime.timedelta(hours=24)
    )
    db.session.add(status)
    db.session.commit()
    return jsonify({"message": "Reel added to your story", "id": status.id}), 201

@reels_bp.route('/api/reels/<int:reel_id>/view', methods=['POST'])
def view_reel(reel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    reel = db.get_or_404(Reel, reel_id)
    if not ReelView.query.filter_by(reel_id=reel_id, user_id=user_id).first():
        db.session.add(ReelView(reel_id=reel_id, user_id=user_id))
        reel.views_count = (reel.views_count or 0) + 1
        db.session.commit()
    return jsonify({"viewsCount": reel.views_count})

@reels_bp.route('/api/reels/<int:reel_id>/analytics', methods=['GET'])
def reel_analytics(reel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    reel = db.get_or_404(Reel, reel_id)
    if reel.user_id != user_id:
        return jsonify({"error": "Only the creator can view analytics"}), 403
    if not reel.user.is_premium:
        return jsonify({"error": "Premium membership is required"}), 403
    return jsonify({
        "views": reel.views_count or 0, "likes": len(reel.likes),
        "comments": len(reel.comments), "reposts": len(reel.reposts),
        "shares": reel.shares_count or 0,
        "engagement": len(reel.likes) + len(reel.comments) + len(reel.reposts) + (reel.shares_count or 0),
        "earningsPaise": reel.earnings_paise or 0,
    })

@reels_bp.route('/api/reels/<int:reel_id>', methods=['DELETE'])
def delete_reel(reel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    reel = db.get_or_404(Reel, reel_id)
    if reel.user_id != user_id:
        return jsonify({"error": "Unauthorized"}), 403
    deletion_task = queue_media_deletion(reel.video_url, 'video')
    db.session.delete(reel)
    db.session.commit()
    if deletion_task:
        process_media_deletion_task(deletion_task.id)
    return jsonify({"message": "Reel deleted"})

@reels_bp.route('/api/reels/<int:reel_id>', methods=['PUT'])
def update_reel(reel_id):
    user_id = get_current_user_id()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    reel = db.get_or_404(Reel, reel_id)
    if reel.user_id != user_id:
        return jsonify({"error": "Unauthorized"}), 403
    caption = str(data.get('caption', reel.caption) or '').strip()
    if len(caption) > MAX_REEL_CAPTION_LENGTH:
        return jsonify({"error": f"Caption must be {MAX_REEL_CAPTION_LENGTH} characters or less"}), 400
    reel.caption = caption
    db.session.commit()
    return jsonify({"message": "Reel updated", "caption": reel.caption})
