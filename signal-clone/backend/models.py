from datetime import datetime, timezone
import json
import uuid
from flask_sqlalchemy import SQLAlchemy

def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    phone = db.Column(db.String(20), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=True)
    auth_provider = db.Column(db.String(20), nullable=False, default='password')
    supabase_user_id = db.Column(db.String(64), unique=True, nullable=True, index=True)
    phone_verified = db.Column(db.Boolean, nullable=False, default=False)
    public_key = db.Column(db.Text, nullable=True)
    encrypted_private_key = db.Column(db.Text, nullable=True)
    encrypted_recovery_key = db.Column(db.Text, nullable=True)
    email_verified = db.Column(db.Boolean, default=False)
    failed_login_attempts = db.Column(db.Integer, default=0)
    password_login_locked = db.Column(db.Boolean, default=False)
    avatar = db.Column(db.String(200), default="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix")
    last_seen = db.Column(db.DateTime, default=utc_now)
    bio = db.Column(db.String(200), nullable=True)
    website_url = db.Column(db.String(200), nullable=True)
    platform_id = db.Column(db.String(30), unique=True, nullable=True)  # unique @handle, e.g. 'amitesh_123'
    profile_setup_done = db.Column(db.Boolean, default=False)  # True once user completes profile setup
    hide_last_seen = db.Column(db.Boolean, default=False)
    hide_online_status = db.Column(db.Boolean, default=False)
    read_receipts = db.Column(db.Boolean, default=True)
    profile_photo_privacy = db.Column(db.String(20), default='everyone')  # everyone | contacts | nobody
    phone_number_privacy = db.Column(db.String(20), nullable=False, default='nobody')  # everyone | contacts | nobody
    two_factor_enabled = db.Column(db.Boolean, default=False)
    two_factor_secret = db.Column(db.String(100), nullable=True)
    bio_expires_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)
    gender = db.Column(db.String(10), nullable=True)  # 'male' | 'female' | None
    is_premium = db.Column(db.Boolean, nullable=False, default=False)
    is_verified = db.Column(db.Boolean, nullable=False, default=False)
    birth_date = db.Column(db.Date, nullable=True)
    referral_code = db.Column(db.String(16), unique=True, nullable=True, index=True)
    referred_by_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True, index=True)
    premium_unlocked_at = db.Column(db.DateTime, nullable=True)

class PendingRegistration(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    phone = db.Column(db.String(20), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    public_key = db.Column(db.Text, nullable=True)
    encrypted_private_key = db.Column(db.Text, nullable=True)
    encrypted_recovery_key = db.Column(db.Text, nullable=True)
    referral_code = db.Column(db.String(16), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)

class Chat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    is_group = db.Column(db.Boolean, default=False)
    name = db.Column(db.String(100), nullable=True)
    avatar = db.Column(db.String(500), nullable=True)
    group_admin_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    is_public = db.Column(db.Boolean, default=False)
    is_chat_disabled = db.Column(db.Boolean, default=False)
    snap_mode = db.Column(db.Boolean, nullable=False, default=False)
    description = db.Column(db.String(500), nullable=True)
    group_username = db.Column(db.String(64), nullable=True, unique=True)
    slow_mode_seconds = db.Column(db.Integer, nullable=False, default=0)
    members_can_send_media = db.Column(db.Boolean, nullable=False, default=True)
    members_can_add_members = db.Column(db.Boolean, nullable=False, default=False)
    reactions_enabled = db.Column(db.Boolean, nullable=False, default=True)
    join_approval_required = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=utc_now)

    messages = db.relationship('Message', backref='chat', lazy=True)
    participants = db.relationship('ChatParticipant', backref='chat', lazy=True)

class ChatParticipant(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    is_archived = db.Column(db.Boolean, default=False)
    deleted_at = db.Column(db.DateTime, nullable=True)
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

class ProfileAudienceAvatar(db.Model):
    """A profile photo that an owner exposes only to one specific contact."""
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    viewer_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    avatar_url = db.Column(db.String(500), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)

    __table_args__ = (
        db.UniqueConstraint('owner_id', 'viewer_id', name='uq_profile_audience_avatar'),
    )

class BusinessProfile(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), unique=True, nullable=False)
    business_name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(80), default='Other')
    description = db.Column(db.String(500), default='')
    address = db.Column(db.String(300), default='')
    support_email = db.Column(db.String(120), default='')
    support_phone = db.Column(db.String(20), default='')
    website_url = db.Column(db.String(200), default='')
    opening_hours = db.Column(db.String(160), default='')
    catalog_visible = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)

class CatalogProduct(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.String(500), default='')
    price = db.Column(db.Float, nullable=False)
    currency = db.Column(db.String(3), default='INR')
    image_url = db.Column(db.String(500), default='')
    in_stock = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)

class BusinessAutomation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), unique=True, nullable=False)
    enabled = db.Column(db.Boolean, default=False)
    welcome_message = db.Column(db.String(500), default='Thanks for contacting us. How can we help?')
    away_message = db.Column(db.String(500), default='We are currently away and will reply soon.')
    keyword_rules = db.Column(db.Text, default='{}')
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)

class BusinessProfileView(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    business_user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    viewer_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    viewed_at = db.Column(db.DateTime, default=utc_now)

class BusinessAutoReplyLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    incoming_message_id = db.Column(db.Integer, db.ForeignKey('message.id'), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)

class PaymentOrder(db.Model):
    """Server-owned payment state. Client chat cards never define success."""
    __table_args__ = (db.UniqueConstraint('payer_id', 'client_request_id', name='uq_payment_payer_request'),)
    id = db.Column(db.Integer, primary_key=True)
    payer_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    payee_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    payer_ref = db.Column(db.String(64), nullable=True, index=True)
    payee_ref = db.Column(db.String(64), nullable=True, index=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'), nullable=True)
    chat_ref = db.Column(db.String(64), nullable=True, index=True)
    amount_paise = db.Column(db.Integer, nullable=False)
    currency = db.Column(db.String(3), default='INR', nullable=False)
    description = db.Column(db.String(160), default='')
    provider = db.Column(db.String(30), default='razorpay', nullable=False)
    provider_order_id = db.Column(db.String(100), unique=True, nullable=False)
    provider_payment_id = db.Column(db.String(100), unique=True, nullable=True)
    provider_refund_id = db.Column(db.String(100), unique=True, nullable=True)
    client_request_id = db.Column(db.String(100), nullable=True)
    status = db.Column(db.String(30), default='created', nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    paid_at = db.Column(db.DateTime, nullable=True)
    refund_requested_at = db.Column(db.DateTime, nullable=True)
    refunded_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)
    retention_until = db.Column(db.DateTime, nullable=True, index=True)

class WorkerHeartbeat(db.Model):
    name = db.Column(db.String(80), primary_key=True)
    last_run_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    last_success_at = db.Column(db.DateTime, nullable=True)
    status = db.Column(db.String(20), nullable=False, default='ok')
    summary_json = db.Column(db.Text, nullable=True)

class PushSubscription(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    session_id = db.Column(db.Integer, db.ForeignKey('active_session.id'), nullable=True, index=True)
    endpoint = db.Column(db.String(1000), unique=True, nullable=False)
    subscription_json = db.Column(db.Text, nullable=False)
    user_agent = db.Column(db.String(300), default='')
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)

class MediaDeletionTask(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    media_url = db.Column(db.String(1000), nullable=False, unique=True)
    resource_type = db.Column(db.String(20), nullable=False, default='image')
    attempts = db.Column(db.Integer, nullable=False, default=0)
    last_error = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now, nullable=False)

class UploadAsset(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    media_url = db.Column(db.String(1000), nullable=False, unique=True)
    media_kind = db.Column(db.String(20), nullable=False)
    resource_type = db.Column(db.String(20), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='pending', index=True)
    claim_type = db.Column(db.String(30), nullable=True, index=True)
    claim_id = db.Column(db.String(100), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=utc_now, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False, index=True)
    claimed_at = db.Column(db.DateTime, nullable=True)

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    client_message_id = db.Column(db.String(100), nullable=True, index=True)
    content = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='sent')  # sent | delivered | read
    type = db.Column(db.String(20), default='text')
    timestamp = db.Column(db.DateTime, default=utc_now)
    ttl = db.Column(db.Integer, default=0)
    snap_mode = db.Column(db.Boolean, nullable=False, default=False)
    snap_expires_at = db.Column(db.DateTime, nullable=True, index=True)
    reply_to_id = db.Column(db.Integer, nullable=True)
    reply_content = db.Column(db.Text, nullable=True)
    reply_sender_name = db.Column(db.String(80), nullable=True)
    edited_at = db.Column(db.DateTime, nullable=True)
    deleted_at = db.Column(db.DateTime, nullable=True)
    read_at = db.Column(db.DateTime, nullable=True)
    delivered_at = db.Column(db.DateTime, nullable=True)
    reactions = db.Column(db.Text, default='{}')
    is_pinned = db.Column(db.Boolean, default=False)

    sender = db.relationship('User')

    __table_args__ = (
        db.UniqueConstraint('sender_id', 'client_message_id', name='uq_message_sender_client_id'),
    )

    def reactions_dict(self):
        try:
            return json.loads(self.reactions or '{}')
        except Exception:
            return {}

class ScheduledMessage(db.Model):
    """An opaque E2EE envelope held until its server-side delivery time."""
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'), nullable=False, index=True)
    client_message_id = db.Column(db.String(100), nullable=False)
    encrypted_content = db.Column(db.Text, nullable=False)
    type = db.Column(db.String(20), nullable=False, default='text')
    ttl = db.Column(db.Integer, nullable=False, default=0)
    scheduled_for = db.Column(db.DateTime, nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default='pending', index=True)
    delivered_message_id = db.Column(db.Integer, db.ForeignKey('message.id'), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utc_now)
    delivered_at = db.Column(db.DateTime, nullable=True)

    __table_args__ = (
        db.UniqueConstraint('sender_id', 'client_message_id', name='uq_scheduled_sender_client_id'),
    )

class CallRecord(db.Model):
    """Content-free call lifecycle metadata for history and abuse controls."""
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'), nullable=False, index=True)
    caller_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    call_type = db.Column(db.String(10), nullable=False, default='video')
    status = db.Column(db.String(20), nullable=False, default='ringing', index=True)
    started_at = db.Column(db.DateTime, nullable=False, default=utc_now, index=True)
    answered_at = db.Column(db.DateTime, nullable=True)
    ended_at = db.Column(db.DateTime, nullable=True)

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
    __table_args__ = (db.UniqueConstraint('status_id', 'viewer_id', name='uq_status_viewer'),)

class StatusReaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    status_id = db.Column(db.Integer, db.ForeignKey('status.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    emoji = db.Column(db.String(12), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    user = db.relationship('User')
    status = db.relationship('Status', backref='reactions')
    __table_args__ = (db.UniqueConstraint('status_id', 'user_id', name='uq_status_user_reaction'),)

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
    is_monetized = db.Column(db.Boolean, nullable=False, default=False)
    earnings_paise = db.Column(db.Integer, nullable=False, default=0)
    parent_reel_id = db.Column(db.Integer, db.ForeignKey('reel.id'), nullable=True)
    filter_name = db.Column(db.String(50), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)
    
    user = db.relationship('User', backref='reels')
    likes = db.relationship('ReelLike', backref='reel', lazy=True, cascade='all, delete-orphan')
    unique_views = db.relationship('ReelView', backref='reel', lazy=True, cascade='all, delete-orphan')
    unique_shares = db.relationship('ReelShare', backref='reel', lazy=True, cascade='all, delete-orphan')
    reposts = db.relationship('ReelRepost', backref='reel', lazy=True, cascade='all, delete-orphan')
    comments = db.relationship('ReelComment', backref='reel', lazy=True, cascade='all, delete-orphan')

class ReelLike(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    reel_id = db.Column(db.Integer, db.ForeignKey('reel.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    __table_args__ = (db.UniqueConstraint('reel_id', 'user_id', name='uq_reel_user_like'),)


class ReelView(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    reel_id = db.Column(db.Integer, db.ForeignKey('reel.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    __table_args__ = (db.UniqueConstraint('reel_id', 'user_id', name='uq_reel_user_view'),)


class ReelShare(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    reel_id = db.Column(db.Integer, db.ForeignKey('reel.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    __table_args__ = (db.UniqueConstraint('reel_id', 'user_id', name='uq_reel_user_share'),)

class ReelRepost(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    reel_id = db.Column(db.Integer, db.ForeignKey('reel.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    note = db.Column(db.String(280), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)
    user = db.relationship('User')
    __table_args__ = (db.UniqueConstraint('reel_id', 'user_id', name='uq_reel_user_repost'),)

class ReelComment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    reel_id = db.Column(db.Integer, db.ForeignKey('reel.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('reel_comment.id'), nullable=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    user = db.relationship('User')
    replies = db.relationship('ReelComment', backref=db.backref('parent', remote_side=[id]), lazy=True, cascade='all, delete-orphan')

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
    post_kind = db.Column(db.String(20), nullable=False, default='standard')  # standard | community
    poll_options = db.Column(db.Text, nullable=True)  # JSON string array
    article_title = db.Column(db.String(200), nullable=True)
    is_monetized = db.Column(db.Boolean, nullable=False, default=False)
    views_count = db.Column(db.Integer, nullable=False, default=0)
    earnings_paise = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=utc_now)

    user = db.relationship('User')
    channel = db.relationship('Channel', back_populates='posts')
    likes = db.relationship('SocialPostLike', backref='post', lazy=True, cascade='all, delete-orphan')
    unique_shares = db.relationship('SocialPostShare', backref='post', lazy=True, cascade='all, delete-orphan')
    comments = db.relationship('SocialPostComment', backref='post', lazy=True, cascade='all, delete-orphan')
    poll_votes = db.relationship('SocialPollVote', backref='post', lazy=True, cascade='all, delete-orphan')
    retweet_of = db.relationship('SocialPost', remote_side='SocialPost.id', foreign_keys='SocialPost.retweet_of_id', backref=db.backref('retweets', cascade='all, delete-orphan'))

class SocialPostLike(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('social_post.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    __table_args__ = (db.UniqueConstraint('post_id', 'user_id', name='uq_social_post_user_like'),)

class SocialPollVote(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('social_post.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    option_index = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    __table_args__ = (db.UniqueConstraint('post_id', 'user_id', name='uq_social_poll_user_vote'),)


class SocialPostShare(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('social_post.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    __table_args__ = (db.UniqueConstraint('post_id', 'user_id', name='uq_social_post_user_share'),)

class SocialPostComment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('social_post.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('social_post_comment.id'), nullable=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    user = db.relationship('User')
    replies = db.relationship('SocialPostComment', backref=db.backref('parent', remote_side=[id]), lazy=True, cascade='all, delete-orphan')
    legacy_replies = db.relationship('CommentReply', backref='comment', lazy=True, cascade='all, delete-orphan')

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

class ActiveSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    token_hash = db.Column(db.String(255), unique=True, nullable=False)
    device_fingerprint = db.Column(db.String(255), nullable=True)
    ip_address = db.Column(db.String(80), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)
    user = db.relationship('User', backref=db.backref('sessions', lazy=True, cascade='all, delete-orphan'))

class UserReport(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    reporter_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    reported_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    reason = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    reporter = db.relationship('User', foreign_keys=[reporter_id])
    reported = db.relationship('User', foreign_keys=[reported_id])

class StarredMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    message_id = db.Column(db.Integer, db.ForeignKey('message.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    __table_args__ = (db.UniqueConstraint('user_id', 'message_id', name='uq_user_starred_message'),)

class PollVote(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey('message.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    option_idx = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)
    __table_args__ = (db.UniqueConstraint('message_id', 'user_id', name='uq_poll_user_vote'),)

class MessageDeletion(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey('message.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    deleted_at = db.Column(db.DateTime, default=utc_now)
    __table_args__ = (db.UniqueConstraint('message_id', 'user_id', name='uq_message_user_deletion'),)


class AiConversation(db.Model):
    """Stores AI chat history per user for memory"""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, index=True)
    role = db.Column(db.String(20), nullable=False)   # 'user' | 'assistant'
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now, index=True)
    user = db.relationship('User')
