from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    phone = db.Column(db.String(20), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    public_key = db.Column(db.Text, nullable=True)
    email_verified = db.Column(db.Boolean, default=False)
    failed_login_attempts = db.Column(db.Integer, default=0)
    password_login_locked = db.Column(db.Boolean, default=False)
    avatar = db.Column(db.String(200), default="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix")
    last_seen = db.Column(db.DateTime, default=utc_now)
    bio = db.Column(db.String(200), nullable=True)
    website_url = db.Column(db.String(200), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)

class PendingRegistration(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    phone = db.Column(db.String(20), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    public_key = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)

class Chat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    is_group = db.Column(db.Boolean, default=False)
    name = db.Column(db.String(100), nullable=True)
    group_admin_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    is_public = db.Column(db.Boolean, default=False)
    is_chat_disabled = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utc_now)

    messages = db.relationship('Message', backref='chat', lazy=True)
    participants = db.relationship('ChatParticipant', backref='chat', lazy=True)

class ChatParticipant(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User')

class GroupJoinRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending | approved | rejected
    created_at = db.Column(db.DateTime, default=utc_now)

    user = db.relationship('User')
    chat = db.relationship('Chat')
    __table_args__ = (db.UniqueConstraint('chat_id', 'user_id', name='uq_group_user_request'),)

class Contact(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    contact_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)

    owner = db.relationship('User', foreign_keys=[owner_id])
    contact_user = db.relationship('User', foreign_keys=[contact_user_id])
    __table_args__ = (
        db.UniqueConstraint('owner_id', 'contact_user_id', name='uq_owner_contact_user'),
    )

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='sent')  # sent | delivered | read
    type = db.Column(db.String(20), default='text')
    timestamp = db.Column(db.DateTime, default=utc_now)
    ttl = db.Column(db.Integer, default=0)
    reply_to_id = db.Column(db.Integer, nullable=True)
    reply_content = db.Column(db.Text, nullable=True)
    reply_sender_name = db.Column(db.String(80), nullable=True)

    sender = db.relationship('User')

class Status(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    media_url = db.Column(db.String(500), nullable=False)
    media_type = db.Column(db.String(20), default='image')  # image | video
    caption = db.Column(db.String(300), nullable=True)
    music_url = db.Column(db.String(500), nullable=True)
    music_name = db.Column(db.String(200), nullable=True)
    duration = db.Column(db.Integer, default=15)  # seconds, max 15
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    user = db.relationship('User')
    views = db.relationship('StatusView', backref='status', lazy=True, cascade='all, delete-orphan')

class StatusView(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    status_id = db.Column(db.Integer, db.ForeignKey('status.id'), nullable=False)
    viewer_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    viewed_at = db.Column(db.DateTime, default=utc_now)
    viewer = db.relationship('User')

class Block(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    blocker_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    blocked_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)

class Reel(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    video_url = db.Column(db.String(500), nullable=False)
    music_url = db.Column(db.String(500), nullable=True)
    music_name = db.Column(db.String(200), nullable=True)
    music_volume = db.Column(db.Float, default=0.8)
    caption = db.Column(db.String(500), nullable=True)
    shares_count = db.Column(db.Integer, default=0)
    views_count = db.Column(db.Integer, default=0)
    parent_reel_id = db.Column(db.Integer, db.ForeignKey('reel.id'), nullable=True)
    filter_name = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)
    
    user = db.relationship('User', backref='reels')
    likes = db.relationship('ReelLike', backref='reel', lazy=True, cascade='all, delete-orphan')
    comments = db.relationship('ReelComment', backref='reel', lazy=True, cascade='all, delete-orphan')

class ReelLike(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    reel_id = db.Column(db.Integer, db.ForeignKey('reel.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    __table_args__ = (db.UniqueConstraint('reel_id', 'user_id', name='uq_reel_user_like'),)

class ReelComment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    reel_id = db.Column(db.Integer, db.ForeignKey('reel.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    user = db.relationship('User')

class Follow(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    follower_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    followed_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    __table_args__ = (db.UniqueConstraint('follower_id', 'followed_id', name='uq_follow_follower_followed'),)

class Notification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    recipient_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    type = db.Column(db.String(50), nullable=False)  # like | comment | follow | mention
    content = db.Column(db.String(500), nullable=True)
    target_id = db.Column(db.Integer, nullable=True)  # reel_id, chat_id etc
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=utc_now)

    recipient = db.relationship('User', foreign_keys=[recipient_id])
    sender = db.relationship('User', foreign_keys=[sender_id])

class SocialPost(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    channel_id = db.Column(db.Integer, db.ForeignKey('channel.id'), nullable=True)
    caption = db.Column(db.String(1000), nullable=True)
    media_url = db.Column(db.String(500), nullable=True)
    media_type = db.Column(db.String(20), nullable=True)  # image | video
    retweet_of_id = db.Column(db.Integer, db.ForeignKey('social_post.id'), nullable=True)
    share_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=utc_now)

    user = db.relationship('User')
    channel = db.relationship('Channel', back_populates='posts')
    likes = db.relationship('SocialPostLike', backref='post', lazy=True, cascade='all, delete-orphan')
    comments = db.relationship('SocialPostComment', backref='post', lazy=True, cascade='all, delete-orphan')
    retweet_of = db.relationship('SocialPost', remote_side='SocialPost.id', foreign_keys='SocialPost.retweet_of_id', backref='retweets')

class SocialPostLike(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('social_post.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    __table_args__ = (db.UniqueConstraint('post_id', 'user_id', name='uq_social_post_user_like'),)

class SocialPostComment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('social_post.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    user = db.relationship('User')
    replies = db.relationship('CommentReply', backref='comment', lazy=True, cascade='all, delete-orphan')

class CommentReply(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    comment_id = db.Column(db.Integer, db.ForeignKey('social_post_comment.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    user = db.relationship('User')

class Channel(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.String(500), nullable=True)
    cover_url = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)

    owner = db.relationship('User')
    memberships = db.relationship('ChannelMembership', backref='channel', lazy=True, cascade='all, delete-orphan')
    posts = db.relationship('SocialPost', back_populates='channel', lazy=True, cascade='all, delete-orphan')

class ChannelMembership(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    channel_id = db.Column(db.Integer, db.ForeignKey('channel.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending | approved | rejected
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)

    user = db.relationship('User')
    __table_args__ = (db.UniqueConstraint('channel_id', 'user_id', name='uq_channel_user_membership'),)
