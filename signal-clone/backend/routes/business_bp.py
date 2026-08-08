import json
from flask import Blueprint, jsonify, request
from models import (
    db, User, ChatParticipant, Message, BusinessProfile, CatalogProduct,
    BusinessAutomation, BusinessProfileView, BusinessAutoReplyLog
)
from utils import get_current_user_id, get_json_data, has_contact, iso_utc

business_bp = Blueprint('business_bp', __name__)

def profile_payload(profile):
    return {
        'businessName': profile.business_name,
        'category': profile.category or 'Other',
        'description': profile.description or '',
        'address': profile.address or '',
        'supportEmail': profile.support_email or '',
        'supportPhone': profile.support_phone or '',
        'websiteUrl': profile.website_url or '',
        'openingHours': profile.opening_hours or '',
        'catalogVisible': bool(profile.catalog_visible),
    }

def product_payload(product):
    return {
        'id': product.id, 'name': product.name, 'description': product.description or '',
        'price': product.price, 'currency': product.currency, 'imageUrl': product.image_url or '',
        'inStock': bool(product.in_stock), 'createdAt': iso_utc(product.created_at)
    }

@business_bp.route('/api/business/me', methods=['GET'])
def get_my_business():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    user = db.session.get(User, user_id)
    profile = BusinessProfile.query.filter_by(user_id=user_id).first()
    automation = BusinessAutomation.query.filter_by(user_id=user_id).first()
    products = CatalogProduct.query.filter_by(owner_id=user_id).order_by(CatalogProduct.created_at.desc()).all()
    return jsonify({
        'profile': profile_payload(profile) if profile else {
            'businessName': user.username, 'category': 'Other', 'description': user.bio or '',
            'address': '', 'supportEmail': user.email, 'supportPhone': user.phone,
            'websiteUrl': user.website_url or '', 'openingHours': '', 'catalogVisible': True
        },
        'products': [product_payload(product) for product in products],
        'automation': {
            'enabled': bool(automation.enabled) if automation else False,
            'welcomeMessage': automation.welcome_message if automation else 'Thanks for contacting us. How can we help?',
            'awayMessage': automation.away_message if automation else 'We are currently away and will reply soon.',
            'keywordRules': json.loads(automation.keyword_rules or '{}') if automation else {}
        }
    })

@business_bp.route('/api/business/profile', methods=['PUT'])
def save_business_profile():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    data = get_json_data()
    name = str(data.get('businessName') or '').strip()
    if len(name) < 2: return jsonify({'error': 'Business name is required'}), 400
    profile = BusinessProfile.query.filter_by(user_id=user_id).first() or BusinessProfile(user_id=user_id, business_name=name)
    profile.business_name = name[:120]
    profile.category = (data.get('category') or 'Other')[:80]
    profile.description = (data.get('description') or '')[:500]
    profile.address = (data.get('address') or '')[:300]
    profile.support_email = (data.get('supportEmail') or '')[:120]
    profile.support_phone = (data.get('supportPhone') or '')[:20]
    profile.website_url = (data.get('websiteUrl') or '')[:200]
    profile.opening_hours = (data.get('openingHours') or '')[:160]
    profile.catalog_visible = bool(data.get('catalogVisible', True))
    db.session.add(profile); db.session.commit()
    return jsonify(profile_payload(profile))

@business_bp.route('/api/business/products', methods=['POST'])
def add_product():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    data = get_json_data(); name = str(data.get('name') or '').strip()
    try: price = float(data.get('price'))
    except (TypeError, ValueError): return jsonify({'error': 'Valid price is required'}), 400
    if not name or price < 0: return jsonify({'error': 'Product name and valid price are required'}), 400
    product = CatalogProduct(owner_id=user_id, name=name[:120], description=(data.get('description') or '')[:500], price=price, image_url=(data.get('imageUrl') or '')[:500], in_stock=bool(data.get('inStock', True)))
    db.session.add(product); db.session.commit()
    return jsonify(product_payload(product)), 201

@business_bp.route('/api/business/products/<int:product_id>', methods=['PUT', 'DELETE'])
def update_product(product_id):
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    product = CatalogProduct.query.filter_by(id=product_id, owner_id=user_id).first()
    if not product: return jsonify({'error': 'Product not found'}), 404
    if request.method == 'DELETE':
        db.session.delete(product); db.session.commit(); return jsonify({'ok': True})
    data = get_json_data()
    if 'name' in data: product.name = (data['name'] or '')[:120]
    if 'description' in data: product.description = (data['description'] or '')[:500]
    if 'price' in data:
        try: product.price = float(data['price'])
        except (TypeError, ValueError): return jsonify({'error': 'Invalid price'}), 400
    if 'imageUrl' in data: product.image_url = (data['imageUrl'] or '')[:500]
    if 'inStock' in data: product.in_stock = bool(data['inStock'])
    db.session.commit(); return jsonify(product_payload(product))

@business_bp.route('/api/business/automation', methods=['PUT'])
def save_automation():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    data = get_json_data(); automation = BusinessAutomation.query.filter_by(user_id=user_id).first() or BusinessAutomation(user_id=user_id)
    automation.enabled = bool(data.get('enabled'))
    automation.welcome_message = (data.get('welcomeMessage') or '')[:500]
    automation.away_message = (data.get('awayMessage') or '')[:500]
    rules = data.get('keywordRules') or {}
    if not isinstance(rules, dict): return jsonify({'error': 'Keyword rules must be an object'}), 400
    automation.keyword_rules = json.dumps({str(k)[:60].lower(): str(v)[:500] for k, v in rules.items() if str(k).strip() and str(v).strip()})
    db.session.add(automation); db.session.commit()
    return jsonify({'enabled': automation.enabled, 'welcomeMessage': automation.welcome_message, 'awayMessage': automation.away_message, 'keywordRules': json.loads(automation.keyword_rules)})

@business_bp.route('/api/business/automation/claim', methods=['POST'])
def claim_auto_reply():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    message_id = get_json_data().get('messageId')
    message = db.session.get(Message, message_id)
    if not message: return jsonify({'error': 'Message not found'}), 404
    if message.sender_id == user_id: return jsonify({'claimed': False})
    if not ChatParticipant.query.filter_by(chat_id=message.chat_id, user_id=user_id).first(): return jsonify({'error': 'Forbidden'}), 403
    if BusinessAutoReplyLog.query.filter_by(incoming_message_id=message.id).first(): return jsonify({'claimed': False})
    try:
        db.session.add(BusinessAutoReplyLog(owner_id=user_id, incoming_message_id=message.id)); db.session.commit()
        return jsonify({'claimed': True})
    except Exception:
        db.session.rollback(); return jsonify({'claimed': False})

@business_bp.route('/api/business/analytics', methods=['GET'])
def business_analytics():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    chat_ids = [row.chat_id for row in ChatParticipant.query.filter_by(user_id=user_id).all()]
    sent = Message.query.filter_by(sender_id=user_id).count()
    received = Message.query.filter(Message.chat_id.in_(chat_ids), Message.sender_id != user_id).count() if chat_ids else 0
    return jsonify({
        'messagesSent': sent, 'messagesReceived': received, 'conversations': len(chat_ids),
        'products': CatalogProduct.query.filter_by(owner_id=user_id).count(),
        'profileViews': BusinessProfileView.query.filter_by(business_user_id=user_id).count(),
        'autoRepliesSent': Message.query.filter_by(sender_id=user_id, type='business_auto_reply').count()
    })

@business_bp.route('/api/business/<int:business_user_id>', methods=['GET'])
def public_business(business_user_id):
    viewer_id = get_current_user_id()
    if not viewer_id: return jsonify({'error': 'Unauthorized'}), 401
    if viewer_id != business_user_id and not has_contact(viewer_id, business_user_id): return jsonify({'error': 'Forbidden'}), 403
    profile = BusinessProfile.query.filter_by(user_id=business_user_id).first()
    if not profile: return jsonify({'business': None, 'products': []})
    db.session.add(BusinessProfileView(business_user_id=business_user_id, viewer_id=viewer_id)); db.session.commit()
    products = CatalogProduct.query.filter_by(owner_id=business_user_id).all() if profile.catalog_visible else []
    return jsonify({'business': profile_payload(profile), 'products': [product_payload(product) for product in products]})
