from flask import Blueprint, jsonify, current_app
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
from models import db, User
from utils import get_json_data, normalize_phone, is_valid_phone, utc_now, serialize_user

auth_bp = Blueprint('auth_bp', __name__)

@auth_bp.route('/api/register', methods=['POST'])
def register():
    try:
        data = get_json_data()
        username = (data.get('username') or '').strip()
        phone = normalize_phone(data.get('phone'))
        password = data.get('password') or ''

        if not username or not phone or not password:
            return jsonify({"error": "Username, phone, and password are required"}), 400
        if not is_valid_phone(phone):
            return jsonify({"error": "Phone number must be exactly 10 digits"}), 400

        if User.query.filter_by(phone=phone).first():
            return jsonify({"error": "Phone number already registered"}), 400

        hashed_pw = generate_password_hash(password)
        new_user = User(username=username, phone=phone, password_hash=hashed_pw, public_key=data.get('publicKey'))
        db.session.add(new_user)
        db.session.commit()
        return jsonify({"message": "User created"}), 201
    except Exception as e:
        print(f"Register Error: {e}")
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/login', methods=['POST'])
def login():
    try:
        data = get_json_data()
        phone = normalize_phone(data.get('phone'))
        password = data.get('password') or ''

        if not phone or not password:
            return jsonify({"error": "Phone and password are required"}), 400
        if not is_valid_phone(phone):
            return jsonify({"error": "Phone number must be exactly 10 digits"}), 400

        user = User.query.filter_by(phone=phone).first()
        if user and check_password_hash(user.password_hash, password):
            user.last_seen = utc_now()
            db.session.commit()
            token = jwt.encode({
                'user_id': user.id,
                'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)
            }, current_app.config['JWT_SECRET_KEY'], algorithm='HS256')
            return jsonify({"token": token, "user": serialize_user(user)}), 200
        return jsonify({"error": "Invalid credentials"}), 401
    except Exception as e:
        print(f"Login Error: {e}")
        return jsonify({"error": str(e)}), 500

@auth_bp.route('/api/forgot-password', methods=['POST'])
def forgot_password():
    try:
        data = get_json_data()
        phone = normalize_phone(data.get('phone'))
        username = (data.get('username') or '').strip()
        new_password = data.get('newPassword') or ''

        if not phone or not username or not new_password:
            return jsonify({"error": "Phone, username, and new password are required"}), 400
        if not is_valid_phone(phone):
            return jsonify({"error": "Phone number must be exactly 10 digits"}), 400

        if len(new_password) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400

        user = User.query.filter_by(phone=phone).first()
        if not user or user.username.strip().lower() != username.lower():
            return jsonify({"error": "No account matched this phone and username"}), 404

        user.password_hash = generate_password_hash(new_password)
        user.last_seen = utc_now()
        db.session.commit()
        return jsonify({"message": "Password reset successfully. Please login with your new password."}), 200
    except Exception as e:
        print(f"Forgot Password Error: {e}")
        return jsonify({"error": str(e)}), 500
