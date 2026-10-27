import json
import secrets
import re
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from flask import Blueprint, jsonify, request
from sqlalchemy import or_
from models import (
    db, User, Chat, ChatParticipant, Message, BusinessProfile, CatalogProduct,
    BusinessAutomation, BusinessProfileView, BusinessAutoReplyLog, SellerAccount,
    ShopSchedule, ShopDeliveryOption, MarketplaceOrder, MarketplaceOrderLine,
    AffiliateProductTag, AffiliateCommission, utc_now
)
from features.business_ai import generate_business_reply
from utils import get_current_user_id, get_json_data, has_contact, is_blocked, iso_utc

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
        'marketplaceEnabled': bool(profile.marketplace_enabled),
    }

def product_payload(product):
    return {
        'id': product.id, 'name': product.name, 'description': product.description or '',
        'price': product.price, 'currency': product.currency, 'imageUrl': product.image_url or '',
        'inStock': bool(product.in_stock), 'affiliateCommissionBps': int(product.affiliate_commission_bps or 0),
        'createdAt': iso_utc(product.created_at)
    }

def seller_payload(seller):
    return {'status': seller.status, 'sellerType': seller.seller_type,
            'legalName': seller.legal_name, 'businessAddress': seller.business_address,
            'returnAddress': seller.return_address or '', 'reviewNote': seller.review_note or ''}

def order_payload(order):
    return {'id': order.id, 'sellerId': order.seller_id, 'buyerId': order.buyer_id,
            'status': order.status, 'deliveryMode': order.delivery_mode,
            'deliveryAddress': order.delivery_address or '', 'subtotal': order.subtotal_paise / 100,
            'deliveryFee': order.delivery_fee_paise / 100, 'total': order.total_paise / 100,
            'currency': order.currency,
            'items': [{'name': line.product_name, 'quantity': line.quantity,
                       'unitPrice': line.unit_price_paise / 100}
                      for line in MarketplaceOrderLine.query.filter_by(order_id=order.id).all()]}

def current_shop_open(user_id):
    from datetime import datetime as dt
    schedule = ShopSchedule.query.filter_by(user_id=user_id).all()
    if not schedule:
        return None
    try:
        timezone = ZoneInfo(schedule[0].timezone)
        now = dt.now(timezone)
        today = next((row for row in schedule if row.weekday == now.weekday()), None)
        if not today or today.is_closed or not today.opens_at or not today.closes_at:
            return False
        current = now.strftime('%H:%M')
        return today.opens_at <= current < today.closes_at
    except (ZoneInfoNotFoundError, ValueError):
        return False

def amount_to_paise(value):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError('Enter a valid price')
    paise = amount * 100
    if not amount.is_finite() or amount < 0 or paise != paise.to_integral_value():
        raise ValueError('Price must be a non-negative amount with at most two decimals')
    return int(paise)

@business_bp.route('/api/business/me', methods=['GET'])
def get_my_business():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    user = db.session.get(User, user_id)
    profile = BusinessProfile.query.filter_by(user_id=user_id).first()
    automation = BusinessAutomation.query.filter_by(user_id=user_id).first()
    seller = SellerAccount.query.filter_by(user_id=user_id).first()
    schedule = ShopSchedule.query.filter_by(user_id=user_id).order_by(ShopSchedule.weekday.asc()).all()
    delivery_options = ShopDeliveryOption.query.filter_by(user_id=user_id).order_by(ShopDeliveryOption.id.asc()).all()
    products = CatalogProduct.query.filter_by(owner_id=user_id).order_by(CatalogProduct.created_at.desc()).all()
    return jsonify({
        'profile': profile_payload(profile) if profile else {
            'businessName': user.username, 'category': 'Other', 'description': user.bio or '',
            'address': '', 'supportEmail': user.email, 'supportPhone': user.phone,
            'websiteUrl': user.website_url or '', 'openingHours': '', 'catalogVisible': True,
            'marketplaceEnabled': False,
        },
        'products': [product_payload(product) for product in products],
        'seller': seller_payload(seller) if seller else {'status': 'not_started'},
        'schedule': [{'weekday': row.weekday, 'opensAt': row.opens_at or '', 'closesAt': row.closes_at or '',
                      'isClosed': bool(row.is_closed), 'timezone': row.timezone} for row in schedule],
        'deliveryOptions': [{'id': row.id, 'mode': row.mode, 'label': row.label, 'area': row.area or '',
                             'fee': row.fee_paise / 100, 'etaDays': row.eta_days, 'active': row.active}
                            for row in delivery_options],
        'orders': [order_payload(row) for row in MarketplaceOrder.query.filter_by(seller_id=user_id)
                   .order_by(MarketplaceOrder.created_at.desc()).limit(100).all()],
        'affiliateCommissions': [{'orderId': row.order_id, 'amount': row.amount_paise / 100, 'status': row.status}
            for row in AffiliateCommission.query.filter_by(promoter_id=user_id).order_by(AffiliateCommission.created_at.desc()).limit(100).all()],
        'automation': {
            'enabled': bool(automation.enabled) if automation else False,
            'aiEnabled': bool(automation.ai_enabled) if automation else False,
            'welcomeMessage': automation.welcome_message if automation else 'Thanks for contacting us. How can we help?',
            'awayMessage': automation.away_message if automation else 'We are currently away and will reply soon.',
            'keywordRules': json.loads(automation.keyword_rules or '{}') if automation else {}
        }
    })

@business_bp.route('/api/business/seller', methods=['POST', 'GET'])
def seller_registration():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    seller = SellerAccount.query.filter_by(user_id=user_id).first()
    if request.method == 'GET':
        return jsonify({'seller': seller_payload(seller) if seller else {'status': 'not_started'}})
    data = get_json_data()
    legal_name = str(data.get('legalName') or '').strip()
    address = str(data.get('businessAddress') or '').strip()
    seller_type = str(data.get('sellerType') or 'individual').strip().lower()
    if len(legal_name) < 2 or len(address) < 8 or seller_type not in {'individual', 'company', 'partnership'}:
        return jsonify({'error': 'Enter the legal name, seller type, and complete business address'}), 400
    if not BusinessProfile.query.filter_by(user_id=user_id).first():
        return jsonify({'error': 'Save your shop profile before seller registration'}), 409
    if seller and seller.status == 'approved':
        return jsonify({'error': 'Your seller account is already approved. Contact support to change legal details.'}), 409
    if not seller:
        seller = SellerAccount(user_id=user_id)
    seller.legal_name = legal_name[:160]
    seller.business_address = address[:500]
    seller.return_address = str(data.get('returnAddress') or '').strip()[:500]
    seller.seller_type = seller_type
    seller.status = 'submitted'
    seller.review_note = None
    seller.submitted_at = utc_now()
    db.session.add(seller); db.session.commit()
    return jsonify({'seller': seller_payload(seller)}), 201

@business_bp.route('/api/business/schedule', methods=['PUT'])
def save_shop_schedule():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    data = get_json_data(); days = data.get('days'); timezone = str(data.get('timezone') or 'Asia/Kolkata')
    try: ZoneInfo(timezone)
    except ZoneInfoNotFoundError: return jsonify({'error': 'Select a valid time zone'}), 400
    if not isinstance(days, list) or len(days) != 7:
        return jsonify({'error': 'Provide opening hours for all seven days'}), 400
    parsed = []
    for day in days:
        if not isinstance(day, dict): return jsonify({'error': 'Each weekday must include opening-hour settings'}), 400
        try: weekday = int(day.get('weekday'))
        except (TypeError, ValueError): return jsonify({'error': 'Invalid weekday'}), 400
        opens = str(day.get('opensAt') or '')
        closes = str(day.get('closesAt') or '')
        closed = bool(day.get('isClosed'))
        if weekday not in range(7) or (not closed and (not re.fullmatch(r'\d{2}:\d{2}', opens) or not re.fullmatch(r'\d{2}:\d{2}', closes) or opens >= closes)):
            return jsonify({'error': 'Use valid 24-hour opening and closing times for each open day'}), 400
        if not closed and any(int(value.split(':')[0]) > 23 or int(value.split(':')[1]) > 59 for value in (opens, closes)):
            return jsonify({'error': 'Opening hours must use valid 24-hour times'}), 400
        parsed.append((weekday, opens, closes, closed))
    if len({item[0] for item in parsed}) != 7:
        return jsonify({'error': 'Each weekday must appear exactly once'}), 400
    for weekday, opens, closes, closed in parsed:
        row = ShopSchedule.query.filter_by(user_id=user_id, weekday=weekday).first() or ShopSchedule(user_id=user_id, weekday=weekday)
        row.opens_at, row.closes_at, row.is_closed, row.timezone = opens or None, closes or None, closed, timezone
        db.session.add(row)
    db.session.commit()
    return jsonify({'ok': True})

@business_bp.route('/api/business/delivery-options', methods=['POST', 'PUT', 'DELETE'])
def manage_delivery_options():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    data = get_json_data()
    if request.method == 'DELETE':
        row = ShopDeliveryOption.query.filter_by(id=data.get('id'), user_id=user_id).first()
        if not row: return jsonify({'error': 'Delivery option not found'}), 404
        row.active = False; db.session.commit(); return jsonify({'ok': True})
    try:
        mode = str(data.get('mode') or 'seller_delivery')
        fee = amount_to_paise(data.get('fee') or 0); eta = int(data.get('etaDays') or 1)
    except (TypeError, ValueError): return jsonify({'error': 'Enter a valid delivery fee and ETA'}), 400
    label = str(data.get('label') or '').strip()
    if mode not in {'seller_delivery', 'pickup'} or not label or fee < 0 or fee > 1_000_000 or eta not in range(0, 61):
        return jsonify({'error': 'Check delivery type, label, fee, and estimated delivery days'}), 400
    row = None
    if request.method == 'PUT':
        row = ShopDeliveryOption.query.filter_by(id=data.get('id'), user_id=user_id).first()
        if not row: return jsonify({'error': 'Delivery option not found'}), 404
    row = row or ShopDeliveryOption(user_id=user_id)
    row.mode, row.label, row.area = mode, label[:100], str(data.get('area') or '')[:160]
    row.fee_paise, row.eta_days, row.active = fee, eta, bool(data.get('active', True))
    db.session.add(row); db.session.commit()
    return jsonify({'id': row.id, 'mode': row.mode, 'label': row.label, 'area': row.area or '', 'fee': fee / 100, 'etaDays': eta, 'active': row.active}), 201 if request.method == 'POST' else 200

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
    if 'marketplaceEnabled' in data:
        wants_marketplace = bool(data.get('marketplaceEnabled'))
        seller = SellerAccount.query.filter_by(user_id=user_id, status='approved').first()
        if wants_marketplace and not seller:
            return jsonify({'error': 'Complete seller registration and approval before listing your shop'}), 409
        profile.marketplace_enabled = wants_marketplace
    db.session.add(profile); db.session.commit()
    return jsonify(profile_payload(profile))

@business_bp.route('/api/business/products', methods=['POST'])
def add_product():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    data = get_json_data(); name = str(data.get('name') or '').strip()
    try: price_paise = amount_to_paise(data.get('price'))
    except ValueError as exc: return jsonify({'error': str(exc)}), 400
    try: commission = int(data.get('affiliateCommissionBps') or 0)
    except (TypeError, ValueError): return jsonify({'error': 'Invalid affiliate commission'}), 400
    if not name or commission not in range(0, 5001): return jsonify({'error': 'Product name, price, and commission from 0% to 50% are required'}), 400
    product = CatalogProduct(owner_id=user_id, name=name[:120], description=(data.get('description') or '')[:500], price=price_paise / 100, image_url=(data.get('imageUrl') or '')[:500], in_stock=bool(data.get('inStock', True)), affiliate_commission_bps=commission)
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
        try: product.price = amount_to_paise(data['price']) / 100
        except ValueError as exc: return jsonify({'error': str(exc)}), 400
    if 'imageUrl' in data: product.image_url = (data['imageUrl'] or '')[:500]
    if 'inStock' in data: product.in_stock = bool(data['inStock'])
    if 'affiliateCommissionBps' in data:
        try: commission = int(data['affiliateCommissionBps'])
        except (TypeError, ValueError): return jsonify({'error': 'Invalid affiliate commission'}), 400
        if commission not in range(0, 5001): return jsonify({'error': 'Affiliate commission must be from 0% to 50%'}), 400
        product.affiliate_commission_bps = commission
    db.session.commit(); return jsonify(product_payload(product))

@business_bp.route('/api/business/automation', methods=['PUT'])
def save_automation():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    data = get_json_data(); automation = BusinessAutomation.query.filter_by(user_id=user_id).first() or BusinessAutomation(user_id=user_id)
    automation.enabled = bool(data.get('enabled'))
    automation.ai_enabled = bool(data.get('aiEnabled'))
    automation.welcome_message = (data.get('welcomeMessage') or '')[:500]
    automation.away_message = (data.get('awayMessage') or '')[:500]
    rules = data.get('keywordRules') or {}
    if not isinstance(rules, dict): return jsonify({'error': 'Keyword rules must be an object'}), 400
    automation.keyword_rules = json.dumps({str(k)[:60].lower(): str(v)[:500] for k, v in rules.items() if str(k).strip() and str(v).strip()})
    db.session.add(automation); db.session.commit()
    return jsonify({'enabled': automation.enabled, 'aiEnabled': automation.ai_enabled, 'welcomeMessage': automation.welcome_message, 'awayMessage': automation.away_message, 'keywordRules': json.loads(automation.keyword_rules)})

@business_bp.route('/api/business/automation/claim', methods=['POST'])
def claim_auto_reply():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    message_id = get_json_data().get('messageId')
    message = db.session.get(Message, message_id)
    if not message: return jsonify({'error': 'Message not found'}), 404
    chat = db.session.get(Chat, message.chat_id)
    if not chat or chat.is_group: return jsonify({'claimed': False})
    if message.sender_id == user_id: return jsonify({'claimed': False})
    if not ChatParticipant.query.filter_by(chat_id=message.chat_id, user_id=user_id).first(): return jsonify({'error': 'Forbidden'}), 403
    if BusinessAutoReplyLog.query.filter_by(incoming_message_id=message.id).first(): return jsonify({'claimed': False})
    try:
        db.session.add(BusinessAutoReplyLog(owner_id=user_id, incoming_message_id=message.id)); db.session.commit()
        automation = BusinessAutomation.query.filter_by(user_id=user_id).first()
        reply = None
        customer_message = get_json_data().get('customerMessage')
        if (automation and automation.enabled and automation.ai_enabled and message.type == 'text'
                and isinstance(customer_message, str) and customer_message.strip()):
            profile = BusinessProfile.query.filter_by(user_id=user_id).first()
            if profile:
                products = CatalogProduct.query.filter_by(owner_id=user_id).order_by(CatalogProduct.created_at.desc()).limit(100).all() if profile.catalog_visible else []
                try:
                    reply = generate_business_reply(customer_message.strip()[:2000], profile, products)
                except Exception:
                    reply = None
        return jsonify({'claimed': True, 'reply': reply, 'aiEnabled': bool(automation and automation.ai_enabled)})
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


def marketplace_shop_payload(profile, products=None):
    owner = db.session.get(User, profile.user_id)
    automation = BusinessAutomation.query.filter_by(user_id=profile.user_id).first()
    return {
        'owner': {
            'id': owner.id,
            'username': owner.username,
            'avatar': owner.avatar or '',
            'verified': bool(owner.is_verified),
        },
        'business': {
            'businessName': profile.business_name,
            'category': profile.category or 'Other',
            'description': profile.description or '',
            'address': profile.address or '',
            'websiteUrl': profile.website_url or '',
            'openingHours': profile.opening_hours or '',
            'marketplaceEnabled': bool(profile.marketplace_enabled),
            'aiSupportEnabled': bool(automation and automation.enabled and automation.ai_enabled),
        },
        'products': [product_payload(product) for product in (products or [])],
    }


@business_bp.route('/api/business/shops', methods=['GET'])
def discover_business_shops():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    query = str(request.args.get('q') or '').strip()[:100]
    category = str(request.args.get('category') or '').strip()[:80]
    location = str(request.args.get('location') or '').strip()[:100]
    shops_query = BusinessProfile.query.filter_by(marketplace_enabled=True, catalog_visible=True)
    if category and category.lower() != 'all':
        shops_query = shops_query.filter(BusinessProfile.category.ilike(f'%{category}%'))
    if location:
        shops_query = shops_query.filter(BusinessProfile.address.ilike(f'%{location}%'))
    if query:
        product_matches = db.session.query(CatalogProduct.owner_id).filter(
            or_(CatalogProduct.name.ilike(f'%{query}%'),
                   CatalogProduct.description.ilike(f'%{query}%'))
        ).subquery()
        shops_query = shops_query.filter(
            or_(BusinessProfile.business_name.ilike(f'%{query}%'),
                   BusinessProfile.category.ilike(f'%{query}%'),
                   BusinessProfile.description.ilike(f'%{query}%'),
                   BusinessProfile.address.ilike(f'%{query}%'),
                   BusinessProfile.user_id.in_(product_matches))
        )

    shops = shops_query.order_by(BusinessProfile.updated_at.desc()).limit(60).all()
    results = []
    for profile in shops:
        products = CatalogProduct.query.filter_by(owner_id=profile.user_id, in_stock=True).order_by(CatalogProduct.created_at.desc()).limit(6).all()
        results.append(marketplace_shop_payload(profile, products))
    return jsonify({'shops': results, 'count': len(results)})


@business_bp.route('/api/business/storefront/<int:business_user_id>', methods=['GET'])
def public_storefront(business_user_id):
    viewer_id = get_current_user_id()
    if not viewer_id:
        return jsonify({'error': 'Unauthorized'}), 401
    profile = BusinessProfile.query.filter_by(
        user_id=business_user_id, marketplace_enabled=True, catalog_visible=True
    ).first()
    if not profile:
        return jsonify({'error': 'Shop not found'}), 404
    seller = SellerAccount.query.filter_by(user_id=business_user_id, status='approved').first()
    if not seller:
        return jsonify({'error': 'Seller onboarding is not approved'}), 404
    if viewer_id != business_user_id:
        db.session.add(BusinessProfileView(business_user_id=business_user_id, viewer_id=viewer_id))
        db.session.commit()
    products = CatalogProduct.query.filter_by(owner_id=business_user_id).order_by(CatalogProduct.created_at.desc()).all()
    payload = marketplace_shop_payload(profile, products)
    payload['schedule'] = [{'weekday': row.weekday, 'opensAt': row.opens_at or '', 'closesAt': row.closes_at or '', 'isClosed': row.is_closed, 'timezone': row.timezone} for row in ShopSchedule.query.filter_by(user_id=business_user_id).order_by(ShopSchedule.weekday.asc()).all()]
    payload['deliveryOptions'] = [{'id': row.id, 'mode': row.mode, 'label': row.label, 'area': row.area or '', 'fee': row.fee_paise / 100, 'etaDays': row.eta_days} for row in ShopDeliveryOption.query.filter_by(user_id=business_user_id, active=True).all()]
    return jsonify(payload)

@business_bp.route('/api/business/orders', methods=['GET', 'POST', 'PUT'])
def marketplace_orders():
    user_id = get_current_user_id()
    if not user_id: return jsonify({'error': 'Unauthorized'}), 401
    if request.method == 'GET':
        rows = MarketplaceOrder.query.filter(or_(MarketplaceOrder.buyer_id == user_id, MarketplaceOrder.seller_id == user_id)).order_by(MarketplaceOrder.created_at.desc()).limit(100).all()
        return jsonify({'orders': [order_payload(row) for row in rows]})
    data = get_json_data()
    if request.method == 'PUT':
        try: order_id = int(data.get('orderId'))
        except (TypeError, ValueError): return jsonify({'error': 'Valid order is required'}), 400
        order = MarketplaceOrder.query.filter_by(id=order_id, seller_id=user_id).first()
        if not order: return jsonify({'error': 'Order not found'}), 404
        target = str(data.get('status') or '')
        transitions = {'paid': {'accepted'}, 'accepted': {'preparing'}, 'preparing': {'out_for_delivery', 'ready_for_pickup'}, 'out_for_delivery': {'completed'}, 'ready_for_pickup': {'completed'}}
        if target not in transitions.get(order.status, set()): return jsonify({'error': 'That order status change is not allowed'}), 409
        order.status = target; db.session.commit(); return jsonify(order_payload(order))
    try:
        seller_id = int(data.get('sellerId'))
        option_id = int(data.get('deliveryOptionId'))
        items = data.get('items')
    except (TypeError, ValueError): return jsonify({'error': 'A shop, delivery choice, and products are required'}), 400
    if seller_id == user_id or not isinstance(items, list) or not items or len(items) > 20:
        return jsonify({'error': 'Choose one shop and between 1 and 20 products'}), 400
    seller = SellerAccount.query.filter_by(user_id=seller_id, status='approved').first()
    profile = BusinessProfile.query.filter_by(user_id=seller_id, marketplace_enabled=True, catalog_visible=True).first()
    option = ShopDeliveryOption.query.filter_by(id=option_id, user_id=seller_id, active=True).first()
    if not seller or not profile or not option: return jsonify({'error': 'Shop or delivery option is unavailable'}), 409
    address = str(data.get('deliveryAddress') or '').strip()[:500]
    if option.mode == 'seller_delivery' and len(address) < 8: return jsonify({'error': 'Enter a delivery address'}), 400
    quantity_by_id = {}
    try:
        for item in items:
            product_id, quantity = int(item.get('productId')), int(item.get('quantity', 1))
            if quantity not in range(1, 101): raise ValueError()
            quantity_by_id[product_id] = quantity_by_id.get(product_id, 0) + quantity
    except (TypeError, ValueError, AttributeError): return jsonify({'error': 'Product quantities must be between 1 and 100'}), 400
    if any(quantity > 100 for quantity in quantity_by_id.values()): return jsonify({'error': 'Maximum quantity is 100 per product'}), 400
    products = CatalogProduct.query.filter(CatalogProduct.owner_id == seller_id, CatalogProduct.id.in_(quantity_by_id), CatalogProduct.in_stock.is_(True)).with_for_update().all()
    if len(products) != len(quantity_by_id): return jsonify({'error': 'One or more products are unavailable'}), 409
    line_prices = []
    try:
        for product in products:
            price_paise = amount_to_paise(product.price)
            if price_paise < 0: raise ValueError()
            line_prices.append((product, quantity_by_id[product.id], price_paise))
    except (TypeError, ValueError): return jsonify({'error': 'A listed product has an invalid price'}), 409
    subtotal = sum(quantity * price for _, quantity, price in line_prices)
    fee = option.fee_paise
    if subtotal < 100 or subtotal + fee > 10_000_000: return jsonify({'error': 'Order total must be between ₹1 and ₹1,00,000'}), 400
    affiliate_tag = None
    if data.get('affiliateCode'):
        affiliate_tag = AffiliateProductTag.query.filter_by(code=str(data.get('affiliateCode'))[:32]).first()
        if not affiliate_tag or affiliate_tag.promoter_id == seller_id or affiliate_tag.product_id not in quantity_by_id:
            return jsonify({'error': 'Affiliate link does not match the selected item'}), 400
    order = MarketplaceOrder(buyer_id=user_id, seller_id=seller_id, delivery_option_id=option.id,
        delivery_mode=option.mode, delivery_address=address if option.mode == 'seller_delivery' else '',
        delivery_fee_paise=fee, subtotal_paise=subtotal, total_paise=subtotal + fee, status='awaiting_payment',
        affiliate_tag_id=affiliate_tag.id if affiliate_tag else None)
    db.session.add(order); db.session.flush()
    for product, quantity, price in line_prices:
        db.session.add(MarketplaceOrderLine(order_id=order.id, product_id=product.id,
            product_name=product.name, unit_price_paise=price, quantity=quantity))
    db.session.commit()
    return jsonify(order_payload(order)), 201

@business_bp.route('/api/business/affiliate-tags', methods=['POST'])
def create_affiliate_tag():
    promoter_id = get_current_user_id()
    if not promoter_id: return jsonify({'error': 'Unauthorized'}), 401
    data = get_json_data()
    try: product_id = int(data.get('productId'))
    except (TypeError, ValueError): return jsonify({'error': 'Select a listed product'}), 400
    content_type = str(data.get('contentType') or 'chat').lower()
    try: content_id = int(data.get('contentId')) if data.get('contentId') else None
    except (TypeError, ValueError): return jsonify({'error': 'Invalid content'}), 400
    if content_type not in {'chat', 'reel', 'post', 'share'}: return jsonify({'error': 'Invalid share destination'}), 400
    product = CatalogProduct.query.filter_by(id=product_id, in_stock=True).first()
    if not product or not BusinessProfile.query.filter_by(user_id=product.owner_id, marketplace_enabled=True).first() or not SellerAccount.query.filter_by(user_id=product.owner_id, status='approved').first():
        return jsonify({'error': 'This product is not available for promotion'}), 404
    # Content links are scoped to the creator; a promoter cannot attach a product to someone else's publication.
    if content_type == 'reel':
        from models import Reel
        if not content_id or not Reel.query.filter_by(id=content_id, user_id=promoter_id).first(): return jsonify({'error': 'Reel not found'}), 404
    if content_type == 'post':
        from models import SocialPost
        if not content_id or not SocialPost.query.filter_by(id=content_id, user_id=promoter_id).first(): return jsonify({'error': 'Post not found'}), 404
    tag = AffiliateProductTag.query.filter_by(promoter_id=promoter_id, product_id=product_id, content_type=content_type, content_id=content_id).first()
    if not tag:
        tag = AffiliateProductTag(promoter_id=promoter_id, product_id=product_id, content_type=content_type, content_id=content_id, code=secrets.token_urlsafe(12)[:24], commission_bps=int(product.affiliate_commission_bps or 0))
        db.session.add(tag); db.session.commit()
    return jsonify({'code': tag.code, 'url': f'/?ref={tag.code}', 'clicks': tag.click_count,
                    'product': product_payload(product), 'commissionBps': tag.commission_bps}), 201

@business_bp.route('/api/affiliate/<string:code>/click', methods=['POST'])
def track_affiliate_click(code):
    tag = AffiliateProductTag.query.filter_by(code=code).first()
    if not tag: return jsonify({'error': 'Product link not found'}), 404
    product = db.session.get(CatalogProduct, tag.product_id)
    if not product or not product.in_stock: return jsonify({'error': 'Product is unavailable'}), 404
    profile = BusinessProfile.query.filter_by(user_id=product.owner_id, marketplace_enabled=True).first()
    if not profile or not SellerAccount.query.filter_by(user_id=product.owner_id, status='approved').first():
        return jsonify({'error': 'Shop is unavailable'}), 404
    tag.click_count += 1; db.session.commit()
    return jsonify({'sellerId': product.owner_id, 'product': product_payload(product), 'shop': profile.business_name})


@business_bp.route('/api/business/shop-chat', methods=['POST'])
def start_shop_chat():
    buyer_id = get_current_user_id()
    if not buyer_id:
        return jsonify({'error': 'Unauthorized'}), 401
    try:
        seller_id = int(get_json_data().get('businessUserId'))
    except (TypeError, ValueError):
        return jsonify({'error': 'A valid shop is required'}), 400
    if seller_id == buyer_id:
        return jsonify({'error': 'You cannot start a customer chat with your own shop'}), 400
    profile = BusinessProfile.query.filter_by(
        user_id=seller_id, marketplace_enabled=True, catalog_visible=True
    ).first()
    if not profile or not SellerAccount.query.filter_by(user_id=seller_id, status='approved').first():
        return jsonify({'error': 'Shop not found'}), 404
    if is_blocked(buyer_id, seller_id):
        return jsonify({'error': 'This seller is unavailable for chat or calls'}), 403

    buyer_chat_ids = {row.chat_id for row in ChatParticipant.query.filter_by(user_id=buyer_id).all()}
    seller_chat_ids = {row.chat_id for row in ChatParticipant.query.filter_by(user_id=seller_id).all()}
    for chat_id in buyer_chat_ids & seller_chat_ids:
        chat = db.session.get(Chat, chat_id)
        if not chat or chat.is_group:
            continue
        participant_ids = {row.user_id for row in ChatParticipant.query.filter_by(chat_id=chat_id).all()}
        if participant_ids == {buyer_id, seller_id}:
            if not chat.is_shop_chat:
                chat.is_shop_chat = True
                db.session.commit()
            return jsonify({'id': chat.id, 'existing': True}), 200

    chat = Chat(is_group=False, is_shop_chat=True)
    db.session.add(chat)
    db.session.flush()
    db.session.add_all([
        ChatParticipant(chat_id=chat.id, user_id=buyer_id),
        ChatParticipant(chat_id=chat.id, user_id=seller_id),
    ])
    db.session.commit()
    return jsonify({'id': chat.id, 'existing': False}), 201
