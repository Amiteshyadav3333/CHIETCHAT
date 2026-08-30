from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash
import jwt
import os
import datetime
from utils import get_json_data, utc_now
from models import db
from extensions import socketio

admin_bp = Blueprint('admin_bp', __name__)

# Admin credentials (should be in environment variables in production)
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@saskatai.com')
ADMIN_PASSWORD_HASH = os.environ.get('ADMIN_PASSWORD_HASH', generate_password_hash('admin@123'))

# Ad model
class Ad(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.String(500))
    price = db.Column(db.Float, default=0)
    video_url = db.Column(db.String(500))
    image_url = db.Column(db.String(500))
    product_link = db.Column(db.String(500), nullable=False)
    product_id = db.Column(db.String(100), nullable=False)
    keywords = db.Column(db.JSON, default=[])
    impressions = db.Column(db.Integer, default=0)
    clicks = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'price': self.price,
            'videoUrl': self.video_url,
            'imageUrl': self.image_url,
            'productLink': self.product_link,
            'productId': self.product_id,
            'keywords': self.keywords,
            'impressions': self.impressions,
            'clicks': self.clicks,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }

@admin_bp.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = get_json_data()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    if email != ADMIN_EMAIL:
        return jsonify({'error': 'Invalid credentials'}), 401

    if not check_password_hash(ADMIN_PASSWORD_HASH, password):
        return jsonify({'error': 'Invalid credentials'}), 401

    token = jwt.encode({
        'admin_email': email,
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)
    }, os.environ.get('JWT_SECRET_KEY', 'admin-secret-key'), algorithm='HS256')

    return jsonify({
        'token': token,
        'admin': {
            'email': email,
            'name': 'Admin'
        }
    }), 200

def verify_admin_token():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None

    token = auth_header.split(' ', 1)[1].strip()
    try:
        payload = jwt.decode(token, os.environ.get('JWT_SECRET_KEY', 'admin-secret-key'), algorithms=['HS256'])
        return payload.get('admin_email')
    except jwt.InvalidTokenError:
        return None

@admin_bp.route('/api/admin/ads', methods=['GET'])
def get_ads():
    admin_email = verify_admin_token()
    if not admin_email:
        return jsonify({'error': 'Unauthorized'}), 401

    ads = Ad.query.all()
    return jsonify({'ads': [ad.to_dict() for ad in ads]}), 200

@admin_bp.route('/api/admin/ads', methods=['POST'])
def create_ad():
    admin_email = verify_admin_token()
    if not admin_email:
        return jsonify({'error': 'Unauthorized'}), 401

    # Verify CSRF token
    csrf_token = request.headers.get('X-CSRF-Token')
    if not csrf_token:
        return jsonify({'error': 'CSRF token missing'}), 403

    data = get_json_data()
    
    required_fields = ['title', 'description', 'productLink', 'productId', 'keywords']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        ad = Ad(
            title=data['title'],
            description=data['description'],
            price=float(data.get('price', 0)),
            video_url=data.get('videoUrl'),
            image_url=data.get('imageUrl'),
            product_link=data['productLink'],
            product_id=data['productId'],
            keywords=data.get('keywords', [])
        )
        db.session.add(ad)
        db.session.commit()
        return jsonify({'ad': ad.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/ads/<int:ad_id>', methods=['PUT'])
def update_ad(ad_id):
    admin_email = verify_admin_token()
    if not admin_email:
        return jsonify({'error': 'Unauthorized'}), 401

    # Verify CSRF token
    csrf_token = request.headers.get('X-CSRF-Token')
    if not csrf_token:
        return jsonify({'error': 'CSRF token missing'}), 403

    ad = Ad.query.get(ad_id)
    if not ad:
        return jsonify({'error': 'Ad not found'}), 404

    data = get_json_data()
    
    try:
        if 'title' in data:
            ad.title = data['title']
        if 'description' in data:
            ad.description = data['description']
        if 'price' in data:
            ad.price = float(data['price'])
        if 'videoUrl' in data:
            ad.video_url = data['videoUrl']
        if 'imageUrl' in data:
            ad.image_url = data['imageUrl']
        if 'productLink' in data:
            ad.product_link = data['productLink']
        if 'productId' in data:
            ad.product_id = data['productId']
        if 'keywords' in data:
            ad.keywords = data['keywords']
        
        ad.updated_at = utc_now()
        db.session.commit()
        return jsonify({'ad': ad.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/ads/<int:ad_id>', methods=['DELETE'])
def delete_ad(ad_id):
    admin_email = verify_admin_token()
    if not admin_email:
        return jsonify({'error': 'Unauthorized'}), 401

    # Verify CSRF token
    csrf_token = request.headers.get('X-CSRF-Token')
    if not csrf_token:
        return jsonify({'error': 'CSRF token missing'}), 403

    ad = Ad.query.get(ad_id)
    if not ad:
        return jsonify({'error': 'Ad not found'}), 404

    try:
        db.session.delete(ad)
        db.session.commit()
        return jsonify({'message': 'Ad deleted successfully'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/ads/stats', methods=['GET'])
def get_ad_stats():
    admin_email = verify_admin_token()
    if not admin_email:
        return jsonify({'error': 'Unauthorized'}), 401

    ads = Ad.query.all()
    total_impressions = sum(ad.impressions for ad in ads)
    total_clicks = sum(ad.clicks for ad in ads)
    
    top_ads = sorted(ads, key=lambda x: x.clicks, reverse=True)[:5]

    return jsonify({
        'totalAds': len(ads),
        'totalImpressions': total_impressions,
        'totalClicks': total_clicks,
        'topAds': [{'title': ad.title, 'clicks': ad.clicks} for ad in top_ads],
        'recentActivity': []
    }), 200

@admin_bp.route('/api/admin/upload', methods=['POST'])
def upload_file():
    admin_email = verify_admin_token()
    if not admin_email:
        return jsonify({'error': 'Unauthorized'}), 401

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    file_type = request.form.get('type', 'image')

    try:
        from utils import upload_to_cloudinary
        url = upload_to_cloudinary(file, folder='saskat-ads', resource_type='auto')
        return jsonify({'url': url}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/api/admin/ads/<int:ad_id>/track', methods=['POST'])
def track_ad_interaction(ad_id):
    ad = Ad.query.get(ad_id)
    if not ad:
        return jsonify({'error': 'Ad not found'}), 404

    data = get_json_data()
    action = data.get('action', 'impression')

    try:
        if action == 'impression':
            ad.impressions += 1
        elif action == 'click':
            ad.clicks += 1
        
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
