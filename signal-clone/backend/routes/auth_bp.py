from flask import Blueprint, jsonify, current_app, request
from werkzeug.security import generate_password_hash, check_password_hash
from sqlalchemy.exc import IntegrityError
import jwt
import datetime
import hashlib
import hmac
import json
import urllib.error
import urllib.parse
import urllib.request
import secrets
import re
from observability import report_safe_exception
from models import (
    db, User, PendingRegistration, Chat, ChatParticipant, GroupJoinRequest,
    Contact, Message, Status, StatusView, StatusReaction, Block, Reel,
    ReelLike, ReelComment, Follow, Notification, SocialPost, SocialPostLike,
    SocialPostComment, CommentReply, Channel, ChannelMembership, ActiveSession,
    UserReport, StarredMessage, PollVote, ProfileAudienceAvatar, BusinessProfile,
    CatalogProduct, BusinessAutomation, BusinessProfileView, BusinessAutoReplyLog,
    PaymentOrder, PushSubscription, UploadAsset, ScheduledMessage, CallRecord,
    AiConversation
)
from utils import (
    get_json_data, get_current_user_id, normalize_phone, is_valid_phone, utc_now,
    serialize_user, queue_media_deletion, process_media_deletion_task,
    queue_claimed_upload_assets,
    get_request_auth_token,
)

auth_bp = Blueprint('auth_bp', __name__)
MAX_PASSWORD_ATTEMPTS = 3

def create_token(user, session_id=None):
    payload = {
        'user_id': user.id,
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)
    }
    if session_id:
        payload['session_id'] = session_id
    return jwt.encode(payload, current_app.config['JWT_SECRET_KEY'], algorithm='HS256')

def create_socket_ticket(user_id, session_id):
    return jwt.encode({
        'user_id': user_id,
        'session_id': session_id,
        'purpose': 'socket',
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=5),
    }, current_app.config['JWT_SECRET_KEY'], algorithm='HS256')

def current_token_payload():
    token = get_request_auth_token()
    if not token:
        return None
    try:
        return jwt.decode(token, current_app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
    except jwt.InvalidTokenError:
        return None

def supabase_auth_request(path, payload, method='POST', bearer_token=None):
    supabase_url = current_app.config.get('SUPABASE_URL')
    anon_key = current_app.config.get('SUPABASE_ANON_KEY')
    if not supabase_url or not anon_key:
        raise RuntimeError("Supabase URL and anon key are not configured")

    headers = {
        'apikey': anon_key,
        'Authorization': f"Bearer {bearer_token or anon_key}",
        'Content-Type': 'application/json',
    }
    req = urllib.request.Request(
        f"{supabase_url}/auth/v1/{path}",
        data=json.dumps(payload).encode('utf-8') if payload is not None else None,
        headers=headers,
        method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            body = response.read().decode('utf-8')
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            detail = json.loads(body)
            message = detail.get('msg') or detail.get('message') or detail.get('error_description') or body
        except Exception:
            message = body or str(e)
        raise RuntimeError(message)

def send_email_otp(email, create_user=True):
    return supabase_auth_request('otp', {
        'email': email,
        'create_user': create_user,
    })

def verify_email_otp(email, token):
    return supabase_auth_request('verify', {
        'email': email,
        'token': token,
        'type': 'email',
    })

def send_password_recovery(email):
    redirect_to = urllib.parse.quote(f"{current_app.config['FRONTEND_URL']}/reset-password", safe='')
    return supabase_auth_request(f"recover?redirect_to={redirect_to}", {'email': email})

def get_supabase_user(access_token):
    return supabase_auth_request('user', None, method='GET', bearer_token=access_token)

def verified_google_identity(access_token):
    supabase_user = get_supabase_user(access_token)
    app_metadata = supabase_user.get('app_metadata') or {}
    providers = set(app_metadata.get('providers') or [])
    if app_metadata.get('provider'):
        providers.add(app_metadata['provider'])
    providers.update(
        identity.get('provider') for identity in (supabase_user.get('identities') or [])
        if isinstance(identity, dict) and identity.get('provider')
    )
    email = str(supabase_user.get('email') or '').strip().lower()
    subject = str(supabase_user.get('id') or '').strip()
    if 'google' not in providers or not email or not subject or not supabase_user.get('email_confirmed_at'):
        raise ValueError('A verified Google account is required')
    return supabase_user, subject, email

def available_platform_id(display_name):
    reserved = {'admin', 'support', 'official', 'cheetchat', 'system', 'security'}
    base = re.sub(r'[^a-z0-9]+', '_', str(display_name or '').lower()).strip('_')[:24] or 'user'
    if len(base) < 3 or base in reserved:
        base = f'user_{base}'[:24]
    if not User.query.filter(db.func.lower(User.platform_id) == base).first():
        return base
    for _ in range(20):
        candidate = f'{base[:23]}_{secrets.token_hex(2)}'
        if not User.query.filter(db.func.lower(User.platform_id) == candidate).first():
            return candidate
    return f'user_{secrets.token_hex(8)}'

def complete_login(user):
    if user.two_factor_enabled:
        try:
            send_email_otp(user.email, create_user=True)
        except Exception as exc:
            return jsonify({"error": f"Could not send security code: {str(exc)}"}), 503
        return jsonify({
            "twoFactorRequired": True,
            "userId": user.id,
            "method": "email",
            "maskedEmail": mask_email(user.email),
            "message": "A security code was sent to your registered email"
        }), 200
    return finalize_login(user)

def mask_email(email):
    local, _, domain = (email or '').partition('@')
    if not domain:
        return 'your registered email'
    return f"{local[:2]}{'*' * max(2, len(local) - 2)}@{domain}"

def finalize_login(user):
    user.last_seen = utc_now()
    user.failed_login_attempts = 0
    user.password_login_locked = False
    
    device_fingerprint = None
    try:
        data = request.get_json(silent=True) or {}
        device_fingerprint = data.get('deviceFingerprint')
    except Exception:
        pass

    session = ActiveSession(
        user_id=user.id,
        token_hash=secrets.token_hex(32),
        device_fingerprint=device_fingerprint,
        ip_address=request.remote_addr,
        user_agent=request.headers.get('User-Agent')
    )
    db.session.add(session)
    db.session.commit()

    token = create_token(user, session_id=session.id)
    csrf_token = secrets.token_urlsafe(32)
    response = jsonify({
        "csrfToken": csrf_token,
        "user": serialize_user(user, viewer_id=user.id),
        "keyBackup": user.encrypted_private_key,
        "recoveryKeyBackup": user.encrypted_recovery_key,
    })
    response.set_cookie(
        current_app.config['AUTH_COOKIE_NAME'], token, httponly=True,
        secure=current_app.config['AUTH_COOKIE_SECURE'],
        samesite=current_app.config['AUTH_COOKIE_SAMESITE'], max_age=7 * 24 * 60 * 60,
        partitioned=current_app.config['IS_PRODUCTION'],
        path='/',
    )
    response.set_cookie(
        'cheetchat_csrf', csrf_token, httponly=False,
        secure=current_app.config['AUTH_COOKIE_SECURE'],
        samesite=current_app.config['AUTH_COOKIE_SAMESITE'], max_age=7 * 24 * 60 * 60,
        partitioned=current_app.config['IS_PRODUCTION'],
        path='/',
    )
    return response, 200

@auth_bp.route('/api/auth/me', methods=['GET'])
def validate_current_session():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    payload = current_token_payload() or {}
    session = db.session.get(ActiveSession, payload.get('session_id')) if payload.get('session_id') else None
    return jsonify({
        'user': serialize_user(user, viewer_id=user.id),
        'session': {
            'id': session.id if session else None,
            'deviceName': session.user_agent if session else None,
            'lastActiveAt': session.created_at.isoformat() + 'Z' if session and session.created_at else None,
        },
    })

@auth_bp.route('/api/auth/csrf', methods=['GET'])
def get_csrf_token():
    if not get_current_user_id():
        return jsonify({'error': 'Unauthorized'}), 401
    csrf_token = request.cookies.get('cheetchat_csrf') or secrets.token_urlsafe(32)
    response = jsonify({'csrfToken': csrf_token})
    if not request.cookies.get('cheetchat_csrf'):
        response.set_cookie(
            'cheetchat_csrf', csrf_token, httponly=False,
            secure=current_app.config['AUTH_COOKIE_SECURE'],
            samesite=current_app.config['AUTH_COOKIE_SAMESITE'], max_age=7 * 24 * 60 * 60,
            partitioned=current_app.config['IS_PRODUCTION'],
            path='/',
        )
    return response

@auth_bp.route('/api/auth/socket-ticket', methods=['GET'])
def get_socket_ticket():
    user_id = get_current_user_id()
    session_id = (current_token_payload() or {}).get('session_id')
    if not user_id or not session_id:
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify({'ticket': create_socket_ticket(user_id, session_id)}), 200

@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout_current_session():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    session_id = (current_token_payload() or {}).get('session_id')
    if session_id:
        PushSubscription.query.filter_by(user_id=user_id, session_id=session_id).delete(synchronize_session=False)
        ActiveSession.query.filter_by(id=session_id, user_id=user_id).delete(synchronize_session=False)
        db.session.commit()
    response = jsonify({'ok': True})
    response.delete_cookie(current_app.config['AUTH_COOKIE_NAME'], path='/', partitioned=current_app.config['IS_PRODUCTION'])
    response.delete_cookie('cheetchat_csrf', path='/', partitioned=current_app.config['IS_PRODUCTION'])
    return response

@auth_bp.route('/api/auth/google/exchange', methods=['POST'])
def exchange_google_session():
    try:
        data = get_json_data()
        supabase_user, subject, email = verified_google_identity(data.get('accessToken') or '')
        user = User.query.filter_by(supabase_user_id=subject).first()
        if user:
            return finalize_login(user)
        if User.query.filter(db.func.lower(User.email) == email).first():
            return jsonify({
                'error': 'This email already uses email/password login. Sign in with your existing method.',
                'code': 'EXISTING_EMAIL_ACCOUNT',
            }), 409
        metadata = supabase_user.get('user_metadata') or {}
        display_name = str(metadata.get('full_name') or metadata.get('name') or email.split('@')[0]).strip()[:80]
        avatar_url = str(metadata.get('avatar_url') or metadata.get('picture') or '').strip()
        return jsonify({
            'onboardingRequired': True,
            'email': email,
            'displayName': display_name or 'CHEETCHAT user',
            'suggestedPlatformId': available_platform_id(display_name),
            'googleAvatarUrl': avatar_url if avatar_url.startswith('https://') else '',
        }), 200
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 401
    except Exception as exc:
        report_safe_exception('google_exchange_failed', exc)
        return jsonify({'error': 'Google sign-in could not be verified'}), 401

@auth_bp.route('/api/auth/google/complete', methods=['POST'])
def complete_google_registration():
    try:
        data = get_json_data()
        supabase_user, subject, email = verified_google_identity(data.get('accessToken') or '')
        existing_google = User.query.filter_by(supabase_user_id=subject).first()
        if existing_google:
            return finalize_login(existing_google)
        if User.query.filter(db.func.lower(User.email) == email).first():
            return jsonify({'error': 'This email already has a CHEETCHAT account'}), 409
        phone = normalize_phone(data.get('phone'))
        if not is_valid_phone(phone):
            return jsonify({'error': 'Phone number must be exactly 10 digits'}), 400
        if User.query.filter_by(phone=phone).first() or PendingRegistration.query.filter_by(phone=phone).first():
            return jsonify({'error': 'This phone number is unavailable'}), 409
        public_key = data.get('publicKey')
        encrypted_recovery_key = data.get('encryptedRecoveryKey')
        if not isinstance(public_key, str) or not 50 <= len(public_key) <= 20000:
            return jsonify({'error': 'Encryption key setup is required'}), 400
        if not isinstance(encrypted_recovery_key, str) or not 50 <= len(encrypted_recovery_key) <= 20000:
            return jsonify({'error': 'Recovery key setup is required'}), 400
        metadata = supabase_user.get('user_metadata') or {}
        display_name = str(metadata.get('full_name') or metadata.get('name') or email.split('@')[0]).strip()[:80] or 'CHEETCHAT user'
        avatar_url = str(metadata.get('avatar_url') or metadata.get('picture') or '').strip()
        use_google_avatar = data.get('useGoogleAvatar') is True and avatar_url.startswith('https://')
        user = User(
            username=display_name,
            email=email,
            phone=phone,
            password_hash=None,
            auth_provider='google',
            supabase_user_id=subject,
            phone_verified=False,
            public_key=public_key,
            encrypted_private_key=None,
            encrypted_recovery_key=encrypted_recovery_key,
            email_verified=True,
            avatar=avatar_url if use_google_avatar and len(avatar_url) <= 200 else f'https://api.dicebear.com/7.x/initials/svg?seed={urllib.parse.quote(display_name)}',
            platform_id=available_platform_id(display_name),
            profile_setup_done=True,
            last_seen=utc_now(),
        )
        db.session.add(user)
        db.session.flush()
        return finalize_login(user)
    except ValueError as exc:
        db.session.rollback()
        return jsonify({'error': str(exc)}), 401
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'This Google account or phone number is already registered'}), 409
    except Exception as exc:
        db.session.rollback()
        report_safe_exception('google_registration_failed', exc)
        return jsonify({'error': 'Google account could not be created'}), 500

@auth_bp.route('/api/register', methods=['POST'])
def register():
    try:
        data = get_json_data()
        username = str(data.get('username') or '').strip()
        email = str(data.get('email') or '').strip().lower()
        phone = normalize_phone(data.get('phone'))
        password = data.get('password') or ''

        if not email or not phone or not password:
            return jsonify({"error": "Email, phone, and password are required"}), 400
        # Auto-generate username from email prefix if not provided
        if not username:
            username = email.split('@')[0]
        if not is_valid_phone(phone):
            return jsonify({"error": "Phone number must be exactly 10 digits"}), 400
        
        if User.query.filter_by(email=email).first():
            return jsonify({"error": "Email already registered"}), 400
        if User.query.filter_by(phone=phone).first():
            return jsonify({"error": "Phone number already registered"}), 400
        existing_pending_by_phone = PendingRegistration.query.filter_by(phone=phone).first()
        if existing_pending_by_phone and existing_pending_by_phone.email != email:
            return jsonify({"error": "Phone number already waiting for verification"}), 400

        hashed_pw = generate_password_hash(password)
        pending = PendingRegistration.query.filter_by(email=email).first()
        if pending:
            pending.username = username
            pending.phone = phone
            pending.password_hash = hashed_pw
            pending.public_key = data.get('publicKey')
            pending.encrypted_private_key = data.get('encryptedPrivateKey')
            pending.encrypted_recovery_key = data.get('encryptedRecoveryKey')
            pending.created_at = utc_now()
        else:
            pending = PendingRegistration(
                username=username,
                email=email,
                phone=phone,
                password_hash=hashed_pw,
                public_key=data.get('publicKey'),
                encrypted_private_key=data.get('encryptedPrivateKey')
                , encrypted_recovery_key=data.get('encryptedRecoveryKey')
            )
            db.session.add(pending)
        db.session.commit()
        send_email_otp(email, create_user=True)
        return jsonify({"message": "OTP sent to email. Verify it to finish registration.", "email": email}), 200
    except Exception as e:
        report_safe_exception('registration_failed', e)
        return jsonify({"error": "Registration could not be completed"}), 500

@auth_bp.route('/api/register/verify-otp', methods=['POST'])
def verify_registration_otp():
    try:
        data = get_json_data()
        email = str(data.get('email') or '').strip().lower()
        otp = str(data.get('otp') or '').strip()

        if not email or not otp:
            return jsonify({"error": "Email and OTP are required"}), 400

        pending = PendingRegistration.query.filter_by(email=email).first()
        if not pending:
            return jsonify({"error": "No pending registration found for this email"}), 404
        if User.query.filter_by(email=email).first():
            db.session.delete(pending)
            db.session.commit()
            return jsonify({"error": "Email already registered"}), 400

        verify_email_otp(email, otp)
        user = User(
            username=pending.username,
            email=pending.email,
            phone=pending.phone,
            password_hash=pending.password_hash,
            public_key=pending.public_key,
            encrypted_private_key=pending.encrypted_private_key,
            encrypted_recovery_key=pending.encrypted_recovery_key,
            email_verified=True,
            failed_login_attempts=0,
            password_login_locked=False,
            profile_setup_done=False,
            last_seen=utc_now()
        )
        db.session.add(user)
        db.session.delete(pending)
        db.session.flush()  # Get the user.id before commit
        # Auto-generate unique platform_id from name
        import re
        name_slug = re.sub(r'[^a-z0-9]+', '_', pending.username.lower()).strip('_')
        if not name_slug:
            name_slug = 'user'
        user.platform_id = f"{name_slug}_{user.id}"
        session = ActiveSession(
            user_id=user.id,
            token_hash=secrets.token_hex(32),
            device_fingerprint=(data.get('deviceFingerprint') or '')[:255] or None,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent')
        )
        db.session.add(session)
        db.session.commit()
        token = create_token(user, session_id=session.id)
        csrf_token = secrets.token_urlsafe(32)
        response = jsonify({
            "message": "Email verified",
            "csrfToken": csrf_token,
            "user": serialize_user(user, viewer_id=user.id),
            "keyBackup": user.encrypted_private_key,
            "recoveryKeyBackup": user.encrypted_recovery_key,
            "needsProfileSetup": True
        })
        response.set_cookie(
            current_app.config['AUTH_COOKIE_NAME'], token, httponly=True,
            secure=current_app.config['AUTH_COOKIE_SECURE'],
            samesite=current_app.config['AUTH_COOKIE_SAMESITE'], max_age=7 * 24 * 60 * 60,
            partitioned=current_app.config['IS_PRODUCTION'],
            path='/',
        )
        response.set_cookie(
            'cheetchat_csrf', csrf_token, httponly=False,
            secure=current_app.config['AUTH_COOKIE_SECURE'],
            samesite=current_app.config['AUTH_COOKIE_SAMESITE'], max_age=7 * 24 * 60 * 60,
            partitioned=current_app.config['IS_PRODUCTION'],
            path='/',
        )
        return response, 201
    except Exception as e:
        report_safe_exception('registration_otp_failed', e)
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/login', methods=['POST'])
def login():
    try:
        data = get_json_data()
        email = str(data.get('email') or '').strip().lower()
        password = data.get('password') or ''

        if not email or not password:
            return jsonify({"error": "Email and password are required"}), 400

        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({"error": "Invalid credentials"}), 401
        if user.password_login_locked:
            send_email_otp(email, create_user=True)
            return jsonify({
                "error": "Password login is locked. OTP sent to email.",
                "otpRequired": True,
                "passwordLocked": True
            }), 423
        if not user.password_hash:
            return jsonify({"error": "This account uses Google Sign-In"}), 409
        if check_password_hash(user.password_hash, password):
            if not user.email_verified:
                send_email_otp(email, create_user=True)
                return jsonify({
                    "error": "Email verification required. OTP sent to email.",
                    "otpRequired": True
                }), 403
            return complete_login(user)

        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        attempts_remaining = max(MAX_PASSWORD_ATTEMPTS - user.failed_login_attempts, 0)
        if user.failed_login_attempts >= MAX_PASSWORD_ATTEMPTS:
            user.password_login_locked = True
            db.session.commit()
            send_email_otp(email, create_user=True)
            return jsonify({
                "error": "Too many wrong password attempts. OTP sent to email.",
                "otpRequired": True,
                "passwordLocked": True,
                "attemptsRemaining": 0
            }), 423

        db.session.commit()
        return jsonify({
            "error": "Invalid credentials",
            "attemptsRemaining": attempts_remaining
        }), 401
    except Exception as e:
        report_safe_exception('login_failed', e)
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/login/request-otp', methods=['POST'])
def request_login_otp():
    try:
        data = get_json_data()
        email = str(data.get('email') or '').strip().lower()
        if not email:
            return jsonify({"error": "Email is required"}), 400
        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({"error": "No account found for this email"}), 404
        send_email_otp(email, create_user=True)
        return jsonify({"message": "OTP sent to email"}), 200
    except Exception as e:
        report_safe_exception('login_otp_request_failed', e)
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/login/verify-otp', methods=['POST'])
def verify_login_otp():
    try:
        data = get_json_data()
        email = str(data.get('email') or '').strip().lower()
        otp = str(data.get('otp') or '').strip()
        if not email or not otp:
            return jsonify({"error": "Email and OTP are required"}), 400
        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({"error": "No account found for this email"}), 404

        verify_email_otp(email, otp)
        user.email_verified = True
        return complete_login(user)
    except Exception as e:
        report_safe_exception('login_otp_verify_failed', e)
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    try:
        data = get_json_data()
        email = str(data.get('email') or '').strip().lower()

        if not email:
            return jsonify({"error": "Email is required"}), 400

        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({"error": "No account matched this email"}), 404

        send_password_recovery(email)
        return jsonify({"message": "Password reset link sent to your email."}), 200
    except Exception as e:
        report_safe_exception('password_recovery_request_failed', e)
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/reset-password', methods=['POST'])
def reset_password():
    try:
        data = get_json_data()
        access_token = data.get('accessToken') or ''
        new_password = data.get('newPassword') or ''
        encrypted_private_key = data.get('encryptedPrivateKey')

        if not access_token or not new_password:
            return jsonify({"error": "Reset token and new password are required"}), 400
        if len(new_password) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400

        supabase_user = get_supabase_user(access_token)
        email = (supabase_user.get('email') or '').strip().lower()
        if not email:
            return jsonify({"error": "Invalid or expired reset link"}), 401

        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({"error": "No account matched this reset link"}), 404

        if user.encrypted_recovery_key:
            if not isinstance(encrypted_private_key, str) or not 50 <= len(encrypted_private_key) <= 20000:
                return jsonify({"error": "Your recovery code is required to preserve encrypted chats"}), 409
            user.encrypted_private_key = encrypted_private_key
        user.password_hash = generate_password_hash(new_password)
        user.email_verified = True
        user.failed_login_attempts = 0
        user.password_login_locked = False
        user.last_seen = utc_now()
        ActiveSession.query.filter_by(user_id=user.id).delete(synchronize_session=False)
        db.session.commit()
        return jsonify({"message": "Password reset successfully. Please login with your new password."}), 200
    except Exception as e:
        report_safe_exception('password_reset_failed', e)
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/reset-password/key-backup', methods=['POST'])
def get_password_reset_key_backup():
    data = get_json_data()
    access_token = data.get('accessToken') or ''
    if not access_token:
        return jsonify({'error': 'Reset token is required'}), 400
    try:
        supabase_user = get_supabase_user(access_token)
        email = (supabase_user.get('email') or '').strip().lower()
        user = User.query.filter_by(email=email).first() if email else None
        if not user:
            return jsonify({'error': 'Invalid or expired reset link'}), 401
        return jsonify({
            'recoveryRequired': bool(user.encrypted_recovery_key),
            'encryptedRecoveryKey': user.encrypted_recovery_key,
            'publicKey': user.public_key,
        })
    except Exception:
        return jsonify({'error': 'Invalid or expired reset link'}), 401

@auth_bp.route('/api/user/recovery-key', methods=['POST'])
def save_recovery_key_backup():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    backup = get_json_data().get('encryptedRecoveryKey')
    if not isinstance(backup, str) or not 50 <= len(backup) <= 20000:
        return jsonify({'error': 'Invalid encrypted recovery backup'}), 400
    user = db.session.get(User, user_id)
    user.encrypted_recovery_key = backup
    db.session.commit()
    return jsonify({'ok': True})

@auth_bp.route('/api/account/change-password', methods=['POST'])
def change_password():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = get_json_data()
        current_password = data.get('currentPassword') or ''
        new_password = data.get('newPassword') or ''
        encrypted_private_key = data.get('encryptedPrivateKey')

        if not current_password or not new_password:
            return jsonify({"error": "Current password and new password are required"}), 400
        if len(new_password) < 8:
            return jsonify({"error": "New password must be at least 8 characters"}), 400
        if current_password == new_password:
            return jsonify({"error": "New password must be different from your current password"}), 400

        user = db.session.get(User, user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
        if not check_password_hash(user.password_hash, current_password):
            return jsonify({"error": "Current password is incorrect"}), 403

        if user.encrypted_private_key:
            if not isinstance(encrypted_private_key, str) or not 50 <= len(encrypted_private_key) <= 20000:
                return jsonify({"error": "Encrypted chat key must be protected with the new password"}), 409
            user.encrypted_private_key = encrypted_private_key
        user.password_hash = generate_password_hash(new_password)
        user.failed_login_attempts = 0
        user.password_login_locked = False
        auth_header = request.headers.get('Authorization', '')
        current_session_id = None
        if auth_header.startswith('Bearer '):
            try:
                current_session_id = jwt.decode(
                    auth_header.split(' ', 1)[1], current_app.config['JWT_SECRET_KEY'], algorithms=['HS256']
                ).get('session_id')
            except Exception:
                pass
        sessions = ActiveSession.query.filter_by(user_id=user_id)
        if current_session_id:
            sessions = sessions.filter(ActiveSession.id != current_session_id)
        sessions.delete(synchronize_session=False)
        db.session.commit()
        return jsonify({"message": "Password changed successfully"}), 200
    except Exception as e:
        report_safe_exception('password_change_failed', e)
        db.session.rollback()
        return jsonify({"error": "Unable to change password right now"}), 500

def delete_user_account_data(user):
    user_id = user.id
    media_task_ids = []
    retention_pepper = current_app.config.get('DATA_RETENTION_PEPPER') or current_app.config['SECRET_KEY']

    def retain_media_deletion(media_url, resource_type, trusted=False):
        task = queue_media_deletion(media_url, resource_type, trusted=trusted)
        if task:
            db.session.flush()
            media_task_ids.append(task.id)

    retain_media_deletion(user.avatar, 'image')

    owned_statuses = Status.query.filter_by(user_id=user_id).all()
    owned_status_ids = [row.id for row in owned_statuses]
    if owned_status_ids:
        StatusReaction.query.filter(StatusReaction.status_id.in_(owned_status_ids)).delete(synchronize_session=False)
    StatusView.query.filter_by(viewer_id=user_id).delete(synchronize_session=False)
    StatusReaction.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    for row in owned_statuses:
        retain_media_deletion(row.media_url, row.media_type)
        retain_media_deletion(row.music_url, 'video')
        db.session.delete(row)

    for row in Reel.query.filter_by(user_id=user_id).all():
        retain_media_deletion(row.video_url, 'video')
        retain_media_deletion(row.music_url, 'video')
        db.session.delete(row)
    ReelLike.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    ReelComment.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    owned_post_ids = [row.id for row in SocialPost.query.filter_by(user_id=user_id).all()]
    if owned_post_ids:
        SocialPost.query.filter(SocialPost.retweet_of_id.in_(owned_post_ids)).update(
            {SocialPost.retweet_of_id: None}, synchronize_session=False
        )
    SocialPostLike.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    own_comment_ids = [row.id for row in SocialPostComment.query.filter_by(user_id=user_id).all()]
    if own_comment_ids:
        CommentReply.query.filter(CommentReply.comment_id.in_(own_comment_ids)).delete(synchronize_session=False)
    CommentReply.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    SocialPostComment.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    for row in SocialPost.query.filter_by(user_id=user_id).all():
        retain_media_deletion(row.media_url, row.media_type or 'image')
        db.session.delete(row)

    for row in Channel.query.filter_by(owner_id=user_id).all():
        retain_media_deletion(row.cover_url, 'image')
        db.session.delete(row)
    ChannelMembership.query.filter_by(user_id=user_id).delete(synchronize_session=False)

    ScheduledMessage.query.filter_by(sender_id=user_id).delete(synchronize_session=False)
    CallRecord.query.filter_by(caller_id=user_id).delete(synchronize_session=False)
    owned_message_ids = [row.id for row in Message.query.filter_by(sender_id=user_id).all()]
    if owned_message_ids:
        BusinessAutoReplyLog.query.filter(BusinessAutoReplyLog.incoming_message_id.in_(owned_message_ids)).delete(synchronize_session=False)
    Message.query.filter_by(sender_id=user_id).delete(synchronize_session=False)
    GroupJoinRequest.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    affected_chat_ids = [row.chat_id for row in ChatParticipant.query.filter_by(user_id=user_id).all()]
    ChatParticipant.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    Chat.query.filter_by(group_admin_id=user_id).update({Chat.group_admin_id: None}, synchronize_session=False)
    db.session.flush()
    for chat_id in affected_chat_ids:
        if ChatParticipant.query.filter_by(chat_id=chat_id).count() == 0:
            for message in Message.query.filter_by(chat_id=chat_id).all():
                media_task_ids.extend(queue_claimed_upload_assets('message', message.id))
            chat_ref = hmac.new(
                retention_pepper.encode(), f'payment-chat:{chat_id}'.encode(), hashlib.sha256
            ).hexdigest()
            for payment in PaymentOrder.query.filter_by(chat_id=chat_id).all():
                payment.chat_ref = payment.chat_ref or chat_ref
                payment.chat_id = None
            ScheduledMessage.query.filter_by(chat_id=chat_id).delete(synchronize_session=False)
            CallRecord.query.filter_by(chat_id=chat_id).delete(synchronize_session=False)
            Message.query.filter_by(chat_id=chat_id).delete(synchronize_session=False)
            Chat.query.filter_by(id=chat_id).delete(synchronize_session=False)

    Contact.query.filter(
        (Contact.owner_id == user_id) | (Contact.contact_user_id == user_id)
    ).delete(synchronize_session=False)
    Block.query.filter(
        (Block.blocker_id == user_id) | (Block.blocked_id == user_id)
    ).delete(synchronize_session=False)
    Follow.query.filter(
        (Follow.follower_id == user_id) | (Follow.followed_id == user_id)
    ).delete(synchronize_session=False)
    Notification.query.filter(
        (Notification.recipient_id == user_id) | (Notification.sender_id == user_id)
    ).delete(synchronize_session=False)

    # Clean up session, reports, and starred messages
    ActiveSession.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    UserReport.query.filter((UserReport.reporter_id == user_id) | (UserReport.reported_id == user_id)).delete(synchronize_session=False)
    StarredMessage.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    PollVote.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    audience_avatars = ProfileAudienceAvatar.query.filter(
        (ProfileAudienceAvatar.owner_id == user_id) | (ProfileAudienceAvatar.viewer_id == user_id)
    ).all()
    for row in audience_avatars:
        if row.owner_id == user_id:
            retain_media_deletion(row.avatar_url, 'image')
        db.session.delete(row)
    catalog_products = CatalogProduct.query.filter_by(owner_id=user_id).all()
    for row in catalog_products:
        retain_media_deletion(row.image_url, 'image')
        db.session.delete(row)
    BusinessAutomation.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    BusinessProfile.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    BusinessProfileView.query.filter(
        (BusinessProfileView.business_user_id == user_id) | (BusinessProfileView.viewer_id == user_id)
    ).delete(synchronize_session=False)
    BusinessAutoReplyLog.query.filter_by(owner_id=user_id).delete(synchronize_session=False)
    retained_party_ref = hmac.new(
        retention_pepper.encode(), f'payment-party:{user_id}'.encode(), hashlib.sha256
    ).hexdigest()
    retention_days = current_app.config.get('PAYMENT_RETENTION_DAYS', 2555)
    for payment in PaymentOrder.query.filter(
        (PaymentOrder.payer_id == user_id) | (PaymentOrder.payee_id == user_id)
    ).all():
        if payment.payer_id == user_id:
            payment.payer_ref = retained_party_ref
            payment.payer_id = None
        if payment.payee_id == user_id:
            payment.payee_ref = retained_party_ref
            payment.payee_id = None
        minimum_retention = (payment.created_at or utc_now()) + datetime.timedelta(days=retention_days)
        if not payment.retention_until or payment.retention_until < minimum_retention:
            payment.retention_until = minimum_retention
    PushSubscription.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    AiConversation.query.filter_by(user_id=user_id).delete(synchronize_session=False)
    for asset in UploadAsset.query.filter_by(owner_id=user_id).all():
        retain_media_deletion(asset.media_url, asset.resource_type, trusted=True)
        db.session.delete(asset)

    db.session.delete(user)
    return list(dict.fromkeys(media_task_ids))

@auth_bp.route('/api/account', methods=['DELETE'])
def delete_account():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = get_json_data()
        password = data.get('password') or ''
        confirmation = str(data.get('confirmation') or '').strip()
        user = db.session.get(User, user_id)

        if not user:
            return jsonify({"error": "User not found"}), 404
        if not password or not confirmation:
            return jsonify({"error": "Password and username confirmation are required"}), 400
        if confirmation != user.username:
            return jsonify({"error": "Type your exact username to confirm deletion"}), 400
        if not check_password_hash(user.password_hash, password):
            return jsonify({"error": "Password is incorrect"}), 403

        media_task_ids = delete_user_account_data(user)
        db.session.commit()
        for task_id in media_task_ids:
            process_media_deletion_task(task_id)
        return jsonify({
            "message": "Your account and personal content were deleted",
            "paymentRetention": "Provider transaction records were de-identified and retained for the configured legal period",
        }), 200
    except Exception as e:
        report_safe_exception('account_deletion_failed', e)
        db.session.rollback()
        return jsonify({"error": "Unable to delete account right now"}), 500

@auth_bp.route('/api/auth/2fa/setup', methods=['POST'])
def setup_2fa():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    data = get_json_data()
    password = data.get('password')
    if not password or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Password is incorrect"}), 403
    try:
        send_email_otp(user.email, create_user=True)
    except Exception as exc:
        return jsonify({"error": f"Could not send email code: {str(exc)}"}), 503
    return jsonify({"method": "email", "maskedEmail": mask_email(user.email)}), 200

@auth_bp.route('/api/auth/2fa/enable', methods=['POST'])
def enable_2fa():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    data = get_json_data()
    token = data.get('token')
    if not token:
        return jsonify({"error": "Email verification code is required"}), 400
    try:
        verify_email_otp(user.email, token)
        user.two_factor_secret = 'email_otp'
        user.two_factor_enabled = True
        db.session.commit()
        return jsonify({"message": "Two-factor authentication enabled successfully", "user": serialize_user(user, viewer_id=user.id)}), 200
    except Exception:
        return jsonify({"error": "Invalid or expired email verification code"}), 400

@auth_bp.route('/api/auth/2fa/disable', methods=['POST'])
def disable_2fa():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    data = get_json_data()
    password = data.get('password')
    
    if not password:
        return jsonify({"error": "Password is required to disable two-factor authentication"}), 400
        
    if not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Password is incorrect"}), 403
        
    user.two_factor_enabled = False
    user.two_factor_secret = None
    db.session.commit()
    return jsonify({"message": "Two-factor authentication disabled successfully", "user": serialize_user(user, viewer_id=user.id)}), 200

@auth_bp.route('/api/auth/2fa/login-verify', methods=['POST'])
def login_verify_2fa():
    try:
        data = get_json_data()
        user_id = data.get('userId')
        token = data.get('token')
        
        if not user_id or not token:
            return jsonify({"error": "User ID and code are required"}), 400
            
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404
            
        if not user.two_factor_enabled:
            return jsonify({"error": "Two-factor authentication is not enabled"}), 400
        try:
            verify_email_otp(user.email, token)
            return finalize_login(user)
        except Exception:
            return jsonify({"error": "Invalid or expired email verification code"}), 400
    except Exception as e:
        report_safe_exception('two_factor_login_failed', e)
        return jsonify({"error": "Verification failed"}), 500

@auth_bp.route('/api/user/key-backup', methods=['POST'])
def save_encrypted_key_backup():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    data = get_json_data()
    backup = data.get('encryptedPrivateKey')
    if not isinstance(backup, str) or len(backup) < 50 or len(backup) > 20000:
        return jsonify({"error": "Invalid encrypted key backup"}), 400
    user = db.session.get(User, user_id)
    user.encrypted_private_key = backup
    db.session.commit()
    return jsonify({"ok": True})

@auth_bp.route('/api/user/key-recovery', methods=['GET'])
def get_encrypted_key_recovery():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'recoveryKeyBackup': user.encrypted_recovery_key}), 200

@auth_bp.route('/api/auth/sessions', methods=['GET'])
def get_active_sessions():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    from models import ActiveSession
    from flask import request
    
    sessions = ActiveSession.query.filter_by(user_id=user_id).order_by(ActiveSession.created_at.desc()).all()
    
    auth_header = request.headers.get('Authorization', '')
    current_session_id = None
    if auth_header.startswith('Bearer '):
        try:
            token = auth_header.split(' ', 1)[1]
            payload = jwt.decode(token, current_app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
            current_session_id = payload.get('session_id')
        except Exception:
            pass

    from utils import iso_utc
    return jsonify([
        {
            "id": s.id,
            "ipAddress": s.ip_address,
            "userAgent": s.user_agent,
            "deviceFingerprint": s.device_fingerprint,
            "createdAt": iso_utc(s.created_at),
            "isCurrent": s.id == current_session_id
        }
        for s in sessions
    ]), 200

@auth_bp.route('/api/auth/sessions/<int:session_id>', methods=['DELETE'])
def revoke_session(session_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    from models import ActiveSession
    session = ActiveSession.query.filter_by(id=session_id, user_id=user_id).first()
    if not session:
        return jsonify({"error": "Session not found"}), 404
        
    PushSubscription.query.filter_by(user_id=user_id, session_id=session_id).delete(synchronize_session=False)
    db.session.delete(session)
    db.session.commit()
    return jsonify({"message": "Session revoked successfully"}), 200
