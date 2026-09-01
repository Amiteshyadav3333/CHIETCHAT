from flask import Blueprint, jsonify, request
from werkzeug.security import check_password_hash
import jwt
import os
import datetime
import hmac
from utils import get_json_data, utc_now
from models import db, PaymentOrder, User
from extensions import socketio

admin_bp = Blueprint('admin_bp', __name__)

def admin_config():
    """Never ship a default administrator account or secret in source code."""
    return {
        'name': os.environ.get('ADMIN_NAME', '').strip(),
        'email': os.environ.get('ADMIN_EMAIL', '').strip().lower(),
        'phone': os.environ.get('ADMIN_PHONE', '').strip(),
        'password_hash': os.environ.get('ADMIN_PASSWORD_HASH', '').strip(),
        'access_code': os.environ.get('ADMIN_ACCESS_CODE', ''),
    }

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
    name = str(data.get('name') or '').strip()
    email = data.get('email', '').strip().lower()
    phone = ''.join(char for char in str(data.get('phone') or '') if char.isdigit())
    password = data.get('password', '')
    access_code = str(data.get('accessCode') or '')
    config = admin_config()

    if not all((name, email, phone, password, access_code)):
        return jsonify({'error': 'Name, email, mobile, password and access code are required'}), 400
    if not all(config.values()):
        return jsonify({'error': 'Admin access is not configured on this server'}), 503

    if not (
        hmac.compare_digest(name.casefold(), config['name'].casefold())
        and hmac.compare_digest(email, config['email'])
        and hmac.compare_digest(phone, ''.join(char for char in config['phone'] if char.isdigit()))
        and hmac.compare_digest(access_code, config['access_code'])
    ):
        return jsonify({'error': 'Invalid credentials'}), 401

    if not check_password_hash(config['password_hash'], password):
        return jsonify({'error': 'Invalid credentials'}), 401

    token = jwt.encode({
        'admin_email': email,
        'admin': True,
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2)
    }, os.environ.get('JWT_SECRET_KEY', 'admin-secret-key'), algorithm='HS256')

    return jsonify({
        'token': token,
        'admin': {
            'email': email,
            'name': config['name']
        }
    }), 200

def verify_admin_token():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return None

    token = auth_header.split(' ', 1)[1].strip()
    try:
        payload = jwt.decode(token, os.environ.get('JWT_SECRET_KEY', 'admin-secret-key'), algorithms=['HS256'])
        config = admin_config()
        if not payload.get('admin') or not config['email'] or not hmac.compare_digest(payload.get('admin_email', ''), config['email']):
            return None
        return config['email']
    except jwt.InvalidTokenError:
        return None


def premium_payment_payload(payment):
    payer = db.session.get(User, payment.payer_id)
    return {
        'id': payment.id,
        'amount': payment.amount_paise / 100,
        'currency': payment.currency,
        'status': payment.status,
        'providerPaymentId': payment.provider_payment_id,
        'providerOrderId': payment.provider_order_id,
        'createdAt': payment.created_at.isoformat() if payment.created_at else None,
        'paidAt': payment.paid_at.isoformat() if payment.paid_at else None,
        'reviewedAt': payment.admin_reviewed_at.isoformat() if payment.admin_reviewed_at else None,
        'reviewedBy': payment.admin_reviewed_by,
        'reviewNote': payment.admin_review_note,
        'user': {
            'id': payer.id, 'username': payer.username, 'email': payer.email,
            'platformId': payer.platform_id,
        } if payer else None,
    }


@admin_bp.route('/api/admin/premium-payments', methods=['GET'])
def get_premium_payments():
    if not verify_admin_token():
        return jsonify({'error': 'Unauthorized'}), 401
    payments = PaymentOrder.query.filter_by(purpose='premium').order_by(PaymentOrder.created_at.desc()).limit(200).all()
    return jsonify({'payments': [premium_payment_payload(payment) for payment in payments]}), 200


@admin_bp.route('/api/admin/premium-payments/<int:payment_id>/review', methods=['POST'])
def review_premium_payment(payment_id):
    admin_email = verify_admin_token()
    if not admin_email:
        return jsonify({'error': 'Unauthorized'}), 401
    payment = PaymentOrder.query.filter_by(id=payment_id, purpose='premium').first()
    if not payment:
        return jsonify({'error': 'Premium payment not found'}), 404
    if payment.status != 'approval_pending':
        return jsonify({'error': 'Only provider-verified premium payments can be reviewed'}), 409
    data = get_json_data()
    action = str(data.get('action') or '').lower()
    note = str(data.get('note') or '').strip()[:500]
    if action not in ('approve', 'reject'):
        return jsonify({'error': 'Review action must be approve or reject'}), 400

    payment.status = 'approved' if action == 'approve' else 'rejected'
    payment.admin_reviewed_by = admin_email
    payment.admin_reviewed_at = utc_now()
    payment.admin_review_note = note or None
    if action == 'approve':
        # Imported here to keep the payment flow and its activation rule in one place.
        from routes.payments_bp import activate_premium_if_approved
        activate_premium_if_approved(payment)
    db.session.commit()
    return jsonify({'payment': premium_payment_payload(payment)}), 200

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
    if not verify_admin_token():
        return jsonify({'error': 'Unauthorized'}), 401
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
