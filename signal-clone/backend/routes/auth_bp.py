from flask import Blueprint, jsonify, current_app
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
import json
import urllib.error
import urllib.parse
import urllib.request
from models import db, User, PendingRegistration
from utils import get_json_data, normalize_phone, is_valid_phone, utc_now, serialize_user

auth_bp = Blueprint('auth_bp', __name__)
MAX_PASSWORD_ATTEMPTS = 3

def create_token(user):
    return jwt.encode({
        'user_id': user.id,
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)
    }, current_app.config['JWT_SECRET_KEY'], algorithm='HS256')

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

def complete_login(user):
    user.last_seen = utc_now()
    user.failed_login_attempts = 0
    user.password_login_locked = False
    db.session.commit()
    return jsonify({"token": create_token(user), "user": serialize_user(user)}), 200

@auth_bp.route('/api/register', methods=['POST'])
def register():
    try:
        data = get_json_data()
        username = (data.get('username') or '').strip()
        email = (data.get('email') or '').strip().lower()
        phone = normalize_phone(data.get('phone'))
        password = data.get('password') or ''

        if not username or not email or not phone or not password:
            return jsonify({"error": "Username, email, phone, and password are required"}), 400
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
            pending.created_at = utc_now()
        else:
            pending = PendingRegistration(
                username=username,
                email=email,
                phone=phone,
                password_hash=hashed_pw,
                public_key=data.get('publicKey')
            )
            db.session.add(pending)
        db.session.commit()
        send_email_otp(email, create_user=True)
        return jsonify({"message": "OTP sent to email. Verify it to finish registration.", "email": email}), 200
    except Exception as e:
        print(f"Register Error: {e}")
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/register/verify-otp', methods=['POST'])
def verify_registration_otp():
    try:
        data = get_json_data()
        email = (data.get('email') or '').strip().lower()
        otp = (data.get('otp') or '').strip()

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
            email_verified=True,
            failed_login_attempts=0,
            password_login_locked=False,
            last_seen=utc_now()
        )
        db.session.add(user)
        db.session.delete(pending)
        db.session.commit()
        return jsonify({"message": "Email verified", "token": create_token(user), "user": serialize_user(user)}), 201
    except Exception as e:
        print(f"Register OTP Error: {e}")
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/login', methods=['POST'])
def login():
    try:
        data = get_json_data()
        email = (data.get('email') or '').strip().lower()
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
        print(f"Login Error: {e}")
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/login/request-otp', methods=['POST'])
def request_login_otp():
    try:
        data = get_json_data()
        email = (data.get('email') or '').strip().lower()
        if not email:
            return jsonify({"error": "Email is required"}), 400
        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({"error": "No account found for this email"}), 404
        send_email_otp(email, create_user=True)
        return jsonify({"message": "OTP sent to email"}), 200
    except Exception as e:
        print(f"Request Login OTP Error: {e}")
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/login/verify-otp', methods=['POST'])
def verify_login_otp():
    try:
        data = get_json_data()
        email = (data.get('email') or '').strip().lower()
        otp = (data.get('otp') or '').strip()
        if not email or not otp:
            return jsonify({"error": "Email and OTP are required"}), 400
        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({"error": "No account found for this email"}), 404

        verify_email_otp(email, otp)
        user.email_verified = True
        return complete_login(user)
    except Exception as e:
        print(f"Verify Login OTP Error: {e}")
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    try:
        data = get_json_data()
        email = (data.get('email') or '').strip().lower()

        if not email:
            return jsonify({"error": "Email is required"}), 400

        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({"error": "No account matched this email"}), 404

        send_password_recovery(email)
        return jsonify({"message": "Password reset link sent to your email."}), 200
    except Exception as e:
        print(f"Forgot Password Error: {e}")
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/reset-password', methods=['POST'])
def reset_password():
    try:
        data = get_json_data()
        access_token = data.get('accessToken') or ''
        new_password = data.get('newPassword') or ''

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

        user.password_hash = generate_password_hash(new_password)
        user.email_verified = True
        user.failed_login_attempts = 0
        user.password_login_locked = False
        user.last_seen = utc_now()
        db.session.commit()
        return jsonify({"message": "Password reset successfully. Please login with your new password."}), 200
    except Exception as e:
        print(f"Reset Password Error: {e}")
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
