from flask import Blueprint, jsonify, request
from models import db, Reel, ReelLike, ReelComment, Follow, User
from utils import (
    get_current_user_id, iso_utc, serialize_user, upload_to_cloudinary,
    get_json_data
)

reels_bp = Blueprint('reels_bp', __name__)

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
    
    reels = query.order_by(Reel.created_at.desc()).all()
    result = []
    for r in reels:
        is_liked = ReelLike.query.filter_by(reel_id=r.id, user_id=user_id).first() is not None
        is_following = Follow.query.filter_by(follower_id=user_id, followed_id=r.user_id).first() is not None
        
        user_data = serialize_user(r.user)
        user_data["isFollowing"] = is_following

        reactions_count = Reel.query.filter_by(parent_reel_id=r.id).count()
        result.append({
            "id": r.id,
            "videoUrl": r.video_url,
            "musicUrl": r.music_url,
            "musicName": r.music_name,
            "caption": r.caption,
            "createdAt": iso_utc(r.created_at),
            "user": user_data,
            "likesCount": len(r.likes),
            "commentsCount": len(r.comments),
            "sharesCount": r.shares_count or 0,
            "viewsCount": r.views_count or 0,
            "reactionsCount": reactions_count,
            "isLiked": is_liked,
            "parentReelId": r.parent_reel_id
        })
    return jsonify(result)

@reels_bp.route('/api/users/<int:uid>/reels', methods=['GET'])
def get_user_reels(uid):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    user = User.query.get_or_404(uid)
    reels = Reel.query.filter_by(user_id=uid).order_by(Reel.created_at.desc()).all()
    
    follower_count = Follow.query.filter_by(followed_id=uid).count()
    following_count = Follow.query.filter_by(follower_id=uid).count()
    is_following = Follow.query.filter_by(follower_id=user_id, followed_id=uid).first() is not None

    result = []
    for r in reels:
        reactions_count = Reel.query.filter_by(parent_reel_id=r.id).count()
        result.append({
            "id": r.id,
            "videoUrl": r.video_url,
            "musicUrl": r.music_url,
            "musicName": r.music_name,
            "caption": r.caption,
            "createdAt": iso_utc(r.created_at),
            "likesCount": len(r.likes),
            "commentsCount": len(r.comments),
            "sharesCount": r.shares_count or 0,
            "reactionsCount": reactions_count,
            "isLiked": is_liked,
            "parentReelId": r.parent_reel_id
        })
    
    return jsonify({
        "user": {
            **serialize_user(user),
            "followerCount": follower_count,
            "followingCount": following_count,
            "isFollowing": is_following
        },
        "reels": result
    })

@reels_bp.route('/api/reels', methods=['POST'])
def create_reel():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    if 'video' not in request.files:
        return jsonify({"error": "No video file"}), 400
    
    file = request.files['video']
    caption = request.form.get('caption', '')
    music_url = request.form.get('musicUrl', '')
    music_name = request.form.get('musicName', '')
    
    try:
        video_url = upload_to_cloudinary(file, folder='chietchat/reels', resource_type='video')
        parent_reel_id = request.form.get('parentReelId')
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
            music_url=music_url, 
            music_name=music_name,
            parent_reel_id=parent_reel_id
        )
        db.session.add(new_reel)
        db.session.commit()
        return jsonify({"message": "Reel posted", "id": new_reel.id}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@reels_bp.route('/api/reels/<int:reel_id>/like', methods=['POST'])
def like_reel(reel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    existing = ReelLike.query.filter_by(reel_id=reel_id, user_id=user_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"isLiked": False})
    
    db.session.add(ReelLike(reel_id=reel_id, user_id=user_id))
    db.session.commit()
    return jsonify({"isLiked": True})

@reels_bp.route('/api/reels/<int:reel_id>/comments', methods=['GET'])
def get_reel_comments(reel_id):
    comments = ReelComment.query.filter_by(reel_id=reel_id).order_by(ReelComment.created_at.asc()).all()
    return jsonify([{
        "id": c.id,
        "content": c.content,
        "createdAt": iso_utc(c.created_at),
        "user": serialize_user(c.user)
    } for c in comments])

@reels_bp.route('/api/reels/<int:reel_id>/comments', methods=['POST'])
def comment_on_reel(reel_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    data = get_json_data()
    content = data.get('content', '').strip()
    if not content:
        return jsonify({"error": "Comment cannot be empty"}), 400
    
    comment = ReelComment(reel_id=reel_id, user_id=user_id, content=content)
    db.session.add(comment)
    db.session.commit()
    return jsonify({"id": comment.id, "message": "Comment added"})

@reels_bp.route('/api/reels/<int:reel_id>/share', methods=['POST'])
def share_reel(reel_id):
    reel = Reel.query.get_or_404(reel_id)
    reel.shares_count = (reel.shares_count or 0) + 1
    db.session.commit()
    return jsonify({"sharesCount": reel.shares_count})

@reels_bp.route('/api/reels/<int:reel_id>/view', methods=['POST'])
def view_reel(reel_id):
    reel = Reel.query.get_or_404(reel_id)
    reel.views_count = (reel.views_count or 0) + 1
    db.session.commit()
    return jsonify({"viewsCount": reel.views_count})

@reels_bp.route('/api/reels/<int:reel_id>', methods=['DELETE'])
def delete_reel(reel_id):
    user_id = get_current_user_id()
    reel = Reel.query.get_or_404(reel_id)
    if reel.user_id != user_id:
        return jsonify({"error": "Unauthorized"}), 403
    db.session.delete(reel)
    db.session.commit()
    return jsonify({"message": "Reel deleted"})

@reels_bp.route('/api/reels/<int:reel_id>', methods=['PUT'])
def update_reel(reel_id):
    user_id = get_current_user_id()
    if not user_id: return jsonify({"error": "Unauthorized"}), 401
    data = request.json
    reel = Reel.query.get_or_404(reel_id)
    if reel.user_id != user_id:
        return jsonify({"error": "Unauthorized"}), 403
    reel.caption = data.get('caption', reel.caption)
    db.session.commit()
    return jsonify({"message": "Reel updated", "caption": reel.caption})
