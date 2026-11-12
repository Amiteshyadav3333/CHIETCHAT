import base64
import hashlib
import hmac
import json
import os
import re
import urllib.error
import urllib.request
import datetime
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from models import db, User, ChatParticipant, BusinessProfile, PaymentOrder, PremiumSubscription, MarketplaceOrder, MarketplaceOrderLine, AffiliateProductTag, AffiliateCommission
from utils import get_current_user_id, get_json_data, iso_utc, utc_now
from observability import report_safe_exception

payments_bp = Blueprint('payments_bp', __name__)
CAPTURE_TERMINAL_STATUSES = {'refunding', 'refunded', 'approved', 'rejected'}
PREMIUM_PLANS = {
    'basic_monthly': {'name': 'Basic Monthly', 'tier': 'Basic', 'period': 'monthly', 'interval': 1, 'amount_paise': 19900, 'duration_months': 1, 'env': 'RAZORPAY_PLAN_BASIC_MONTHLY'},
    'medium_monthly': {'name': 'Medium Monthly', 'tier': 'Medium', 'period': 'monthly', 'interval': 1, 'amount_paise': 49900, 'duration_months': 1, 'env': 'RAZORPAY_PLAN_MEDIUM_MONTHLY'},
    'max_monthly': {'name': 'Max Monthly', 'tier': 'Max', 'period': 'monthly', 'interval': 1, 'amount_paise': 99900, 'duration_months': 1, 'env': 'RAZORPAY_PLAN_MAX_MONTHLY'},
    'basic_yearly': {'name': 'Basic Yearly', 'tier': 'Basic', 'period': 'yearly', 'interval': 1, 'amount_paise': 238800, 'duration_months': 12, 'env': 'RAZORPAY_PLAN_BASIC_YEARLY'},
    'medium_yearly': {'name': 'Medium Yearly', 'tier': 'Medium', 'period': 'yearly', 'interval': 1, 'amount_paise': 598800, 'duration_months': 12, 'env': 'RAZORPAY_PLAN_MEDIUM_YEARLY'},
    'max_yearly': {'name': 'Max Yearly', 'tier': 'Max', 'period': 'yearly', 'interval': 1, 'amount_paise': 1198800, 'duration_months': 12, 'env': 'RAZORPAY_PLAN_MAX_YEARLY'},
}


def get_premium_plan(plan_code):
    plan = PREMIUM_PLANS.get(str(plan_code or '').strip().lower())
    if not plan:
        return None
    return {**plan, 'code': str(plan_code).strip().lower(), 'provider_plan_id': os.environ.get(plan['env'], '').strip()}


def premium_plan_payload(plan_code, plan):
    return {
        'code': plan_code, 'name': plan['name'], 'tier': plan['tier'],
        'period': plan['period'], 'amount': plan['amount_paise'] / 100,
        'durationMonths': plan['duration_months'], 'autopayEnabled': bool(plan['provider_plan_id']),
    }

def mark_marketplace_order_paid(payment):
    order = MarketplaceOrder.query.filter_by(payment_order_id=payment.id).with_for_update().first()
    if not order:
        return
    if order.status == 'awaiting_payment':
        order.status = 'paid'
    order.payment_status = 'provider_verified'
    tag = db.session.get(AffiliateProductTag, order.affiliate_tag_id) if order.affiliate_tag_id else None
    if tag and tag.commission_bps > 0 and not AffiliateCommission.query.filter_by(order_id=order.id, promoter_id=tag.promoter_id).first():
        line = MarketplaceOrderLine.query.filter_by(order_id=order.id, product_id=tag.product_id).first()
        if line:
            amount = (line.unit_price_paise * line.quantity * tag.commission_bps) // 10000
            if amount > 0:
                db.session.add(AffiliateCommission(order_id=order.id, promoter_id=tag.promoter_id,
                    seller_id=order.seller_id, amount_paise=amount, status='pending_payout'))

def mark_marketplace_order_refunded(payment):
    order = MarketplaceOrder.query.filter_by(payment_order_id=payment.id).first()
    if order:
        order.status = 'refunded'
        order.payment_status = 'refunded'
        for commission in AffiliateCommission.query.filter_by(order_id=order.id).all():
            commission.status = 'reversed'


def payment_payload(payment):
    return {
        'id': payment.id,
        'chatId': payment.chat_id,
        'payerId': payment.payer_id,
        'payeeId': payment.payee_id,
        'amount': payment.amount_paise / 100,
        'currency': payment.currency,
        'description': payment.description or '',
        'purpose': payment.purpose or 'business',
        'premiumPlanCode': payment.premium_plan_code,
        'provider': payment.provider,
        'providerOrderId': payment.provider_order_id,
        'providerPaymentId': payment.provider_payment_id,
        'providerRefundId': payment.provider_refund_id,
        'clientRequestId': payment.client_request_id,
        'status': payment.status,
        'premiumApprovalStatus': (
            'approved' if payment.purpose == 'premium' and payment.status == 'approved'
            else 'rejected' if payment.purpose == 'premium' and payment.status == 'rejected'
            else 'pending' if payment.purpose == 'premium' and payment.status == 'approval_pending'
            else None
        ),
        'adminReviewedAt': iso_utc(payment.admin_reviewed_at),
        'adminReviewNote': payment.admin_review_note if payment.purpose == 'premium' else None,
        'createdAt': iso_utc(payment.created_at),
        'paidAt': iso_utc(payment.paid_at),
        'refundRequestedAt': iso_utc(payment.refund_requested_at),
        'refundedAt': iso_utc(payment.refunded_at),
        'verified': payment.status in ('paid', 'captured', 'approval_pending', 'approved'),
    }


def razorpay_credentials():
    return os.environ.get('RAZORPAY_KEY_ID', ''), os.environ.get('RAZORPAY_KEY_SECRET', '')


def provider_request(path, method='GET', payload=None):
    key_id, key_secret = razorpay_credentials()
    if not key_id or not key_secret:
        raise RuntimeError('Payments are not configured')
    body = json.dumps(payload).encode('utf-8') if payload is not None else None
    auth = base64.b64encode(f'{key_id}:{key_secret}'.encode()).decode()
    provider_request = urllib.request.Request(
        f'https://api.razorpay.com/v1/{path.lstrip("/")}', data=body, method=method,
        headers={'Authorization': f'Basic {auth}', 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(provider_request, timeout=15) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        raise RuntimeError('Payment provider rejected the request') from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError('Payment provider is temporarily unavailable') from exc


def create_provider_order(amount_paise, currency, receipt, notes):
    return provider_request('orders', 'POST', {
        'amount': amount_paise, 'currency': currency, 'receipt': receipt,
        'notes': notes,
    })


def fetch_provider_payment(provider_payment_id):
    return provider_request(f'payments/{provider_payment_id}')


def fetch_provider_plan(provider_plan_id):
    return provider_request(f'plans/{provider_plan_id}')


def create_provider_subscription(plan, user_id, request_id):
    plan_id = plan['provider_plan_id']
    return provider_request('subscriptions', 'POST', {
        'plan_id': plan_id, 'total_count': 120 if plan['period'] == 'monthly' else 10, 'quantity': 1,
        'customer_notify': 0,
        'notes': {'user_id': str(user_id), 'request_id': request_id, 'purpose': 'premium_autopay', 'plan_code': plan['code']},
    })


def fetch_provider_subscription(subscription_id):
    return provider_request(f'subscriptions/{subscription_id}')


def cancel_provider_subscription(subscription_id):
    return provider_request(f'subscriptions/{subscription_id}/cancel', 'POST', {'cancel_at_cycle_end': 0})


def activate_premium_for_month(user, paid_through=None, duration_months=1, plan_code=None):
    now = utc_now()
    if not user:
        return
    user.is_premium = True
    user.premium_unlocked_at = user.premium_unlocked_at or now
    if plan_code:
        user.premium_plan_code = plan_code
    base = user.premium_expires_at if user.premium_expires_at and user.premium_expires_at > now else now
    duration_days = 365 if duration_months >= 12 else 30 * max(1, duration_months)
    user.premium_expires_at = max(base, paid_through) if paid_through else base + datetime.timedelta(days=duration_days)


def create_provider_refund(provider_payment_id, amount_paise, notes):
    return provider_request(f'payments/{provider_payment_id}/refund', 'POST', {
        'amount': amount_paise, 'speed': 'normal', 'notes': notes,
    })


def exact_amount_paise(value):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError('Invalid amount') from exc
    paise = amount * 100
    if not amount.is_finite() or paise != paise.to_integral_value():
        raise ValueError('Amount must contain at most two decimal places')
    return int(paise)


def reconcile_captured_entity(payment, entity):
    provider_payment_id = str(entity.get('id') or '')
    if (
        payment.status in CAPTURE_TERMINAL_STATUSES
        or not provider_payment_id
        or entity.get('order_id') != payment.provider_order_id
        or entity.get('amount') != payment.amount_paise
        or str(entity.get('currency') or '').upper() != payment.currency
        or str(entity.get('status') or '').lower() != 'captured'
    ):
        return False
    claimed_elsewhere = PaymentOrder.query.filter(
        PaymentOrder.provider_payment_id == provider_payment_id,
        PaymentOrder.id != payment.id,
    ).first()
    if claimed_elsewhere:
        return False
    if payment.provider_payment_id and payment.provider_payment_id != provider_payment_id:
        return False
    payment.provider_payment_id = provider_payment_id
    payment.status = 'approved' if payment.purpose == 'premium' else 'captured'
    payment.paid_at = payment.paid_at or utc_now()
    if payment.purpose == 'premium' and payment.payer_id:
        activate_premium_for_month(db.session.get(User, payment.payer_id),
            duration_months=payment.premium_duration_months or 1,
            plan_code=payment.premium_plan_code)
    if payment.purpose == 'marketplace':
        mark_marketplace_order_paid(payment)
    return True


def activate_premium_if_approved(payment):
    if payment.purpose != 'premium' or payment.status != 'approved' or not payment.payer_id:
        return
    user = db.session.get(User, payment.payer_id)
    if user:
        activate_premium_for_month(user, duration_months=payment.premium_duration_months or 1,
            plan_code=payment.premium_plan_code)


@payments_bp.route('/api/payments/config', methods=['GET'])
def payment_config():
    if not get_current_user_id():
        return jsonify({'error': 'Unauthorized'}), 401
    key_id, key_secret = razorpay_credentials()
    webhook_ready = bool(os.environ.get('RAZORPAY_WEBHOOK_SECRET'))
    marketplace_checkout_enabled = bool(
        os.environ.get('MARKETPLACE_CHECKOUT_ENABLED', '').strip().lower() == 'true'
        and key_id and key_secret and webhook_ready
    )
    checkout_ready = bool(key_id and key_secret and webhook_ready)
    plans = [premium_plan_payload(code, get_premium_plan(code)) for code in PREMIUM_PLANS]
    for plan in plans:
        plan['autopayEnabled'] = checkout_ready and plan['autopayEnabled']
    return jsonify({
        'enabled': checkout_ready,
        'provider': 'razorpay',
        'keyId': key_id if key_id and key_secret and webhook_ready else None,
        'webhookReady': webhook_ready,
        'marketplaceCheckoutEnabled': marketplace_checkout_enabled,
        'currency': 'INR',
        'minAmount': 1,
        'maxAmount': 100000,
        'premiumPrice': PREMIUM_PLANS['medium_monthly']['amount_paise'] / 100,
        'premiumPlans': plans,
        'premiumAutopayEnabled': any(plan['autopayEnabled'] for plan in plans),
    })


@payments_bp.route('/api/premium/order', methods=['POST'])
def create_premium_order():
    payer_id = get_current_user_id()
    if not payer_id:
        return jsonify({'error': 'Unauthorized'}), 401
    user = db.session.get(User, payer_id)
    if user.is_premium and (not user.premium_expires_at or user.premium_expires_at > utc_now()):
        return jsonify({'error': 'Premium is already active'}), 409
    if not os.environ.get('RAZORPAY_WEBHOOK_SECRET'):
        return jsonify({'error': 'Premium checkout is not configured yet'}), 503
    data = get_json_data()
    plan_code = str(data.get('planCode') or '').strip().lower()
    plan = get_premium_plan(plan_code)
    if not plan:
        return jsonify({'error': 'Choose a valid Premium plan'}), 400
    client_request_id = str(data.get('clientRequestId') or '').strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}', client_request_id):
        return jsonify({'error': 'A valid payment request ID is required'}), 400
    existing = PaymentOrder.query.filter_by(payer_id=payer_id, client_request_id=client_request_id).first()
    if existing:
        if existing.purpose != 'premium' or existing.amount_paise != plan['amount_paise'] or existing.premium_plan_code != plan_code:
            return jsonify({'error': 'Payment request ID is already in use'}), 409
        key_id, _ = razorpay_credentials()
        return jsonify({'payment': payment_payload(existing), 'checkout': {'keyId': key_id}})
    pending = PaymentOrder(
        payer_id=payer_id, amount_paise=plan['amount_paise'], currency='INR',
        description=f"Ducor Premium {plan['name']} one-time", purpose='premium',
        premium_plan_code=plan_code, premium_duration_months=plan['duration_months'],
        provider_order_id=f'pending-{os.urandom(12).hex()}', status='creating',
        client_request_id=client_request_id,
    )
    db.session.add(pending)
    db.session.commit()
    try:
        provider = create_provider_order(
            plan['amount_paise'], 'INR', f'premium-{pending.id}',
            {'payment_order_id': str(pending.id), 'purpose': 'premium', 'payer_id': str(payer_id), 'plan_code': plan_code},
        )
        if not provider.get('id') or provider.get('amount') != plan['amount_paise'] or str(provider.get('currency') or '').upper() != 'INR':
            raise RuntimeError('Payment provider returned inconsistent order details')
        pending.provider_order_id = provider['id']
        pending.status = provider.get('status', 'created')
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        pending = db.session.get(PaymentOrder, pending.id)
        if pending:
            pending.status = 'creation_unknown'
            db.session.commit()
        report_safe_exception('premium_order_creation_failed', exc)
        return jsonify({'error': 'Premium checkout is temporarily unavailable'}), 503
    key_id, _ = razorpay_credentials()
    return jsonify({'payment': payment_payload(pending), 'checkout': {'keyId': key_id}}), 201


@payments_bp.route('/api/premium/subscription', methods=['POST'])
def create_premium_subscription():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    data = get_json_data()
    plan_code = str(data.get('planCode') or '').strip().lower()
    plan = get_premium_plan(plan_code)
    key_id, key_secret = razorpay_credentials()
    if not plan:
        return jsonify({'error': 'Choose a valid Premium plan'}), 400
    if not plan['provider_plan_id'] or not key_id or not key_secret or not os.environ.get('RAZORPAY_WEBHOOK_SECRET'):
        return jsonify({'error': 'Premium autopay is not configured yet'}), 503
    request_id = str(data.get('clientRequestId') or '').strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}', request_id):
        return jsonify({'error': 'A valid subscription request ID is required'}), 400
    existing = PremiumSubscription.query.filter_by(user_id=user_id, client_request_id=request_id).first()
    if existing:
        return jsonify({'subscription': {'id': existing.id, 'providerSubscriptionId': existing.provider_subscription_id, 'status': existing.status}, 'checkout': {'keyId': key_id}})
    live_subscription = PremiumSubscription.query.filter_by(user_id=user_id).filter(
        PremiumSubscription.status.notin_(['cancelled', 'completed', 'halted'])
    ).order_by(PremiumSubscription.id.desc()).first()
    if live_subscription:
        if live_subscription.plan_code != plan_code:
            return jsonify({'error': 'Cancel your current Autopay subscription before selecting a different plan'}), 409
        return jsonify({'subscription': {'id': live_subscription.id, 'providerSubscriptionId': live_subscription.provider_subscription_id, 'status': live_subscription.status}, 'checkout': {'keyId': key_id}})
    try:
        provider_plan = fetch_provider_plan(plan['provider_plan_id'])
        provider_item = provider_plan.get('item') or {}
        if (provider_plan.get('id') != plan['provider_plan_id']
                or provider_plan.get('period') != plan['period']
                or provider_plan.get('interval') != plan['interval']
                or provider_item.get('amount') != plan['amount_paise']
                or str(provider_item.get('currency') or '').upper() != 'INR'):
            return jsonify({'error': f"Razorpay plan configuration does not match {plan['name']} (price or billing interval)"}), 409
        provider = create_provider_subscription(plan, user_id, request_id)
        if not provider.get('id') or provider.get('plan_id') != plan['provider_plan_id']:
            raise RuntimeError('Payment provider returned inconsistent subscription details')
        record = PremiumSubscription(user_id=user_id, client_request_id=request_id,
            provider_subscription_id=provider['id'], plan_code=plan_code,
            amount_paise=plan['amount_paise'], duration_months=plan['duration_months'],
            status=provider.get('status', 'created'))
        db.session.add(record)
        db.session.commit()
        return jsonify({'subscription': {'id': record.id, 'providerSubscriptionId': record.provider_subscription_id, 'status': record.status}, 'checkout': {'keyId': key_id}}), 201
    except Exception as exc:
        db.session.rollback()
        report_safe_exception('premium_subscription_creation_failed', exc)
        return jsonify({'error': 'Premium autopay is temporarily unavailable'}), 503


@payments_bp.route('/api/premium/subscription', methods=['GET'])
def get_premium_subscription():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    record = PremiumSubscription.query.filter_by(user_id=user_id).order_by(PremiumSubscription.id.desc()).first()
    if not record:
        return jsonify({'subscription': None})
    return jsonify({'subscription': {'status': record.status, 'currentPeriodEnd': iso_utc(record.current_period_end), 'planCode': record.plan_code}})


@payments_bp.route('/api/premium/subscription/cancel', methods=['POST'])
def cancel_premium_subscription():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    record = PremiumSubscription.query.filter_by(user_id=user_id).order_by(PremiumSubscription.id.desc()).first()
    if not record:
        return jsonify({'error': 'No Premium autopay subscription was found'}), 404
    if record.status in ('cancelled', 'completed', 'halted'):
        return jsonify({'status': record.status})
    try:
        provider = cancel_provider_subscription(record.provider_subscription_id)
        if provider.get('id') != record.provider_subscription_id:
            raise RuntimeError('Payment provider returned inconsistent subscription details')
        record.status = provider.get('status', 'cancelled')
        db.session.commit()
        return jsonify({'status': record.status, 'premiumExpiresAt': iso_utc(record.current_period_end)})
    except Exception as exc:
        db.session.rollback()
        report_safe_exception('premium_subscription_cancel_failed', exc)
        return jsonify({'error': 'Could not cancel autopay right now'}), 503


@payments_bp.route('/api/premium/subscription/verify', methods=['POST'])
def verify_premium_subscription():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    data = get_json_data()
    subscription_id = str(data.get('razorpay_subscription_id') or '')
    payment_id = str(data.get('razorpay_payment_id') or '')
    signature = str(data.get('razorpay_signature') or '')
    record = PremiumSubscription.query.filter_by(user_id=user_id, provider_subscription_id=subscription_id).first()
    _, secret = razorpay_credentials()
    expected = hmac.new(secret.encode(), f'{subscription_id}|{payment_id}'.encode(), hashlib.sha256).hexdigest() if secret else ''
    if not record or not payment_id or not signature or not hmac.compare_digest(expected, signature):
        return jsonify({'error': 'Subscription verification failed'}), 400
    try:
        provider_payment = fetch_provider_payment(payment_id)
        provider_subscription = fetch_provider_subscription(subscription_id)
    except RuntimeError as exc:
        report_safe_exception('premium_subscription_verify_provider_failed', exc)
        return jsonify({'error': 'Subscription verification is temporarily unavailable'}), 503
    expected_plan = get_premium_plan(record.plan_code)
    if (not expected_plan
            or provider_payment.get('id') != payment_id
            or provider_payment.get('subscription_id') != subscription_id
            or str(provider_payment.get('currency') or '').upper() != 'INR'
            or provider_subscription.get('id') != subscription_id
            or provider_subscription.get('plan_id') != expected_plan['provider_plan_id']
            or str(provider_subscription.get('status') or '').lower() not in ('authenticated', 'active')):
        return jsonify({'error': 'Autopay authorization has not been confirmed yet'}), 409
    record.status = provider_subscription.get('status', 'authenticated')
    period_end = provider_subscription.get('current_end')
    paid_through = datetime.datetime.fromtimestamp(period_end, datetime.timezone.utc).replace(tzinfo=None) if isinstance(period_end, int) and period_end else None
    record.current_period_end = paid_through
    first_cycle_paid = (
        str(provider_payment.get('status') or '').lower() == 'captured'
        and provider_payment.get('amount') == record.amount_paise
    )
    if first_cycle_paid:
        record.last_payment_id = payment_id
        activate_premium_for_month(db.session.get(User, user_id), paid_through,
            duration_months=record.duration_months, plan_code=record.plan_code)
    db.session.commit()
    return jsonify({'ok': True, 'status': record.status, 'premiumActive': first_cycle_paid,
        'premiumExpiresAt': iso_utc(paid_through) if first_cycle_paid else None})


@payments_bp.route('/api/payments/orders', methods=['POST'])
def create_payment_order():
    payer_id = get_current_user_id()
    if not payer_id:
        return jsonify({'error': 'Unauthorized'}), 401
    if not os.environ.get('RAZORPAY_WEBHOOK_SECRET'):
        return jsonify({'error': 'Payments are unavailable until provider webhooks are configured'}), 503
    data = get_json_data()
    client_request_id = str(data.get('clientRequestId') or '').strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}', client_request_id):
        return jsonify({'error': 'A valid payment request ID is required'}), 400
    try:
        chat_id = int(data.get('chatId'))
        payee_id = int(data.get('payeeId'))
    except (TypeError, ValueError):
        return jsonify({'error': 'Valid chat and payee are required'}), 400
    try:
        amount_paise = exact_amount_paise(data.get('amount'))
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400
    if amount_paise < 100 or amount_paise > 10_000_000:
        return jsonify({'error': 'Amount must be between ₹1 and ₹1,00,000'}), 400
    if payer_id == payee_id:
        return jsonify({'error': 'You cannot pay yourself'}), 400
    participant_ids = {row.user_id for row in ChatParticipant.query.filter_by(chat_id=chat_id).all()}
    if payer_id not in participant_ids or payee_id not in participant_ids:
        return jsonify({'error': 'Payer and payee must belong to this chat'}), 403
    if not BusinessProfile.query.filter_by(user_id=payee_id).first():
        return jsonify({'error': 'Verified checkout is currently available only for business profiles'}), 400
    description = str(data.get('description') or 'Ducor business payment').strip()[:160]
    existing = PaymentOrder.query.filter_by(
        payer_id=payer_id, client_request_id=client_request_id,
    ).first()
    if existing:
        if (
            existing.chat_id != chat_id or existing.payee_id != payee_id
            or existing.amount_paise != amount_paise or existing.description != description
        ):
            return jsonify({'error': 'Payment request ID was already used for different details'}), 409
        if existing.status in ('creating', 'creation_unknown') or existing.provider_order_id.startswith('pending-'):
            return jsonify({'error': 'Payment order creation is being reconciled; do not retry with a new request ID'}), 409
        key_id, _ = razorpay_credentials()
        return jsonify({'payment': payment_payload(existing), 'checkout': {'keyId': key_id}}), 200
    pending = PaymentOrder(
        payer_id=payer_id, payee_id=payee_id, chat_id=chat_id,
        amount_paise=amount_paise, currency='INR', description=description,
        provider_order_id=f'pending-{os.urandom(12).hex()}', status='creating',
        client_request_id=client_request_id,
    )
    db.session.add(pending)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        existing = PaymentOrder.query.filter_by(
            payer_id=payer_id, client_request_id=client_request_id,
        ).first()
        if existing and (
            existing.chat_id == chat_id and existing.payee_id == payee_id
            and existing.amount_paise == amount_paise and existing.description == description
        ):
            if existing.status in ('creating', 'creation_unknown') or existing.provider_order_id.startswith('pending-'):
                return jsonify({'error': 'Payment order creation is being reconciled; do not retry with a new request ID'}), 409
            key_id, _ = razorpay_credentials()
            return jsonify({'payment': payment_payload(existing), 'checkout': {'keyId': key_id}}), 200
        return jsonify({'error': 'Payment request ID is already in use'}), 409
    pending_id = pending.id
    try:
        provider = create_provider_order(
            amount_paise, 'INR', f'cheetchat-{pending.id}',
            {'payment_order_id': str(pending.id), 'chat_id': str(chat_id), 'payee_id': str(payee_id)},
        )
        if (
            not provider.get('id')
            or provider.get('amount') != amount_paise
            or str(provider.get('currency') or '').upper() != 'INR'
        ):
            raise RuntimeError('Payment provider returned inconsistent order details')
        pending.provider_order_id = provider['id']
        pending.status = provider.get('status', 'created')
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        pending = db.session.get(PaymentOrder, pending_id)
        if pending:
            pending.status = 'creation_unknown'
            db.session.commit()
        report_safe_exception('payment_order_creation_failed', exc)
        return jsonify({'error': 'Payment provider is temporarily unavailable; reconciliation is pending'}), 503
    key_id, _ = razorpay_credentials()
    return jsonify({'payment': payment_payload(pending), 'checkout': {'keyId': key_id}}), 201

@payments_bp.post('/api/marketplace/orders/<int:marketplace_order_id>/checkout')
def create_marketplace_checkout(marketplace_order_id):
    payer_id = get_current_user_id()
    if not payer_id: return jsonify({'error': 'Unauthorized'}), 401
    key_id, key_secret = razorpay_credentials()
    if os.environ.get('MARKETPLACE_CHECKOUT_ENABLED', '').strip().lower() != 'true' or not key_id or not key_secret:
        return jsonify({'error': 'Secure marketplace checkout is not enabled for this deployment yet'}), 503
    if not os.environ.get('RAZORPAY_WEBHOOK_SECRET'):
        return jsonify({'error': 'Payments are unavailable until provider webhooks are configured'}), 503
    data = get_json_data()
    client_request_id = str(data.get('clientRequestId') or '').strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}', client_request_id):
        return jsonify({'error': 'A valid payment request ID is required'}), 400
    order = MarketplaceOrder.query.filter_by(id=marketplace_order_id, buyer_id=payer_id).first()
    if not order: return jsonify({'error': 'Marketplace order not found'}), 404
    if order.status not in {'awaiting_payment'}:
        return jsonify({'error': 'This order is no longer awaiting payment'}), 409
    existing = PaymentOrder.query.filter_by(payer_id=payer_id, client_request_id=client_request_id).first()
    if existing:
        if existing.purpose != 'marketplace' or existing.marketplace_order_id != order.id or existing.payee_id != order.seller_id or existing.amount_paise != order.total_paise:
            return jsonify({'error': 'Payment request ID was already used for different details'}), 409
        if existing.status in {'creating', 'creation_unknown'} or existing.provider_order_id.startswith('pending-'):
            return jsonify({'error': 'Payment setup is still being reconciled; do not submit another payment'}), 409
        order.payment_order_id = existing.id
        db.session.commit()
        key_id, _ = razorpay_credentials()
        return jsonify({'payment': payment_payload(existing), 'checkout': {'keyId': key_id}})
    if order.payment_order_id:
        linked = db.session.get(PaymentOrder, order.payment_order_id)
        if linked:
            if linked.status in {'creating', 'creation_unknown'} or linked.provider_order_id.startswith('pending-'):
                return jsonify({'error': 'Payment setup is still being reconciled; do not submit another payment'}), 409
            if linked.status in {'failed', 'cancelled'}:
                order.payment_order_id = None
                db.session.commit()
            else:
                key_id, _ = razorpay_credentials()
                return jsonify({'payment': payment_payload(linked), 'checkout': {'keyId': key_id}})
    pending = PaymentOrder(payer_id=payer_id, payee_id=order.seller_id,
        amount_paise=order.total_paise, currency='INR', description=f'Marketplace order #{order.id}',
        purpose='marketplace', marketplace_order_id=order.id,
        provider_order_id=f'pending-{os.urandom(12).hex()}',
        status='creating', client_request_id=client_request_id)
    db.session.add(pending)
    try:
        db.session.flush()
        order.payment_order_id = pending.id
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': 'This checkout request already exists; refresh the order and retry'}), 409
    pending_id = pending.id
    try:
        provider = create_provider_order(order.total_paise, 'INR', f'marketplace-{order.id}',
            {'payment_order_id': str(pending_id), 'marketplace_order_id': str(order.id), 'purpose': 'marketplace'})
        if not provider.get('id') or provider.get('amount') != order.total_paise or str(provider.get('currency') or '').upper() != 'INR':
            raise RuntimeError('Payment provider returned inconsistent order details')
        pending.provider_order_id, pending.status = provider['id'], provider.get('status', 'created')
        order.payment_order_id = pending.id
        db.session.commit()
    except Exception as exc:
        db.session.rollback()
        pending = db.session.get(PaymentOrder, pending_id)
        if pending: pending.status = 'creation_unknown'; db.session.commit()
        report_safe_exception('marketplace_checkout_creation_failed', exc)
        return jsonify({'error': 'Secure checkout is temporarily unavailable; reconciliation is pending'}), 503
    key_id, _ = razorpay_credentials()
    return jsonify({'payment': payment_payload(pending), 'checkout': {'keyId': key_id}}), 201


@payments_bp.route('/api/payments/orders/<int:payment_id>/verify', methods=['POST'])
def verify_payment(payment_id):
    payer_id = get_current_user_id()
    if not payer_id:
        return jsonify({'error': 'Unauthorized'}), 401
    payment = PaymentOrder.query.filter_by(id=payment_id, payer_id=payer_id).first()
    if not payment:
        return jsonify({'error': 'Payment order not found'}), 404
    data = get_json_data()
    provider_order_id = str(data.get('razorpay_order_id') or '')
    provider_payment_id = str(data.get('razorpay_payment_id') or '')
    signature = str(data.get('razorpay_signature') or '')
    if provider_order_id != payment.provider_order_id or not provider_payment_id or not signature:
        return jsonify({'error': 'Invalid payment verification payload'}), 400
    _, key_secret = razorpay_credentials()
    expected = hmac.new(
        key_secret.encode(), f'{provider_order_id}|{provider_payment_id}'.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return jsonify({'error': 'Payment signature verification failed'}), 400
    try:
        provider_payment = fetch_provider_payment(provider_payment_id)
    except RuntimeError as exc:
        report_safe_exception('payment_verification_provider_failed', exc)
        return jsonify({'error': 'Payment verification is temporarily unavailable'}), 503
    if (
        provider_payment.get('id') != provider_payment_id
        or provider_payment.get('order_id') != payment.provider_order_id
        or provider_payment.get('amount') != payment.amount_paise
        or str(provider_payment.get('currency') or '').upper() != payment.currency
    ):
        return jsonify({'error': 'Payment provider details do not match this order'}), 409
    claimed_elsewhere = PaymentOrder.query.filter(
        PaymentOrder.provider_payment_id == provider_payment_id,
        PaymentOrder.id != payment.id,
    ).first()
    if claimed_elsewhere:
        return jsonify({'error': 'Payment is already linked to another order'}), 409
    provider_status = str(provider_payment.get('status') or '').lower()
    if provider_status not in ('authorized', 'captured'):
        return jsonify({'error': 'Payment has not been authorized by the provider'}), 409
    was_already_captured = payment.status in ('approved', 'captured') and payment.provider_payment_id == provider_payment_id
    payment.provider_payment_id = provider_payment_id
    payment.status = 'approved' if payment.purpose == 'premium' and provider_status == 'captured' else provider_status
    if provider_status == 'captured':
        payment.paid_at = payment.paid_at or utc_now()
        if payment.purpose == 'premium' and not was_already_captured:
            activate_premium_for_month(db.session.get(User, payment.payer_id),
                duration_months=payment.premium_duration_months or 1,
                plan_code=payment.premium_plan_code)
        if payment.purpose == 'marketplace':
            mark_marketplace_order_paid(payment)
    db.session.commit()
    payload = payment_payload(payment)
    if payment.purpose == 'premium' and provider_status == 'captured':
        payload['message'] = 'Payment verified. Premium is active for one month.'
        user = db.session.get(User, payment.payer_id)
        payload['premiumExpiresAt'] = iso_utc(user.premium_expires_at) if user else None
    return jsonify(payload), 200 if provider_status == 'captured' else 202


@payments_bp.route('/api/payments/orders/<int:payment_id>', methods=['GET'])
def get_payment(payment_id):
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    payment = db.session.get(PaymentOrder, payment_id)
    if not payment or user_id not in (payment.payer_id, payment.payee_id):
        return jsonify({'error': 'Payment order not found'}), 404
    return jsonify(payment_payload(payment))


@payments_bp.post('/api/payments/orders/<int:payment_id>/refund-request')
def request_payment_refund(payment_id):
    payer_id = get_current_user_id()
    if not payer_id:
        return jsonify({'error': 'Unauthorized'}), 401
    payment = PaymentOrder.query.filter_by(id=payment_id, payer_id=payer_id).first()
    if not payment:
        return jsonify({'error': 'Payment order not found'}), 404
    if payment.status in ('refund_requested', 'refunding', 'refunded'):
        return jsonify(payment_payload(payment))
    if payment.status not in ('paid', 'captured') or not payment.provider_payment_id:
        return jsonify({'error': 'Only a verified payment can be refunded'}), 409
    payment.status = 'refund_requested'
    payment.refund_requested_at = utc_now()
    db.session.commit()
    return jsonify(payment_payload(payment)), 202


@payments_bp.post('/api/payments/orders/<int:payment_id>/refund')
def refund_payment(payment_id):
    payee_id = get_current_user_id()
    if not payee_id:
        return jsonify({'error': 'Unauthorized'}), 401
    payment = PaymentOrder.query.filter_by(id=payment_id, payee_id=payee_id).first()
    if not payment:
        return jsonify({'error': 'Payment order not found'}), 404
    if payment.status == 'refunded':
        return jsonify(payment_payload(payment))
    if payment.status == 'refunding':
        return jsonify(payment_payload(payment)), 202
    if payment.status not in ('paid', 'captured', 'refund_requested') or not payment.provider_payment_id:
        return jsonify({'error': 'Only a verified payment can be refunded'}), 409

    payment.status = 'refunding'
    db.session.commit()
    try:
        provider = create_provider_refund(
            payment.provider_payment_id,
            payment.amount_paise,
            {'payment_order_id': str(payment.id), 'chat_id': str(payment.chat_id)},
        )
        if (
            not provider.get('id')
            or provider.get('payment_id') != payment.provider_payment_id
            or provider.get('amount') != payment.amount_paise
        ):
            raise RuntimeError('Payment provider returned inconsistent refund details')
        payment.provider_refund_id = provider['id']
        provider_status = provider.get('status', 'pending')
        payment.status = 'refunded' if provider_status == 'processed' else 'refunding'
        if payment.status == 'refunded':
            payment.refunded_at = utc_now()
            if payment.purpose == 'marketplace': mark_marketplace_order_refunded(payment)
        db.session.commit()
        return jsonify(payment_payload(payment)), 200 if payment.status == 'refunded' else 202
    except Exception as exc:
        # A provider timeout may occur after it accepted the refund. Keep the
        # order in an in-flight state so retries cannot submit a second refund.
        payment.status = 'refunding'
        db.session.commit()
        report_safe_exception('payment_refund_provider_failed', exc)
        return jsonify({'error': 'Refund reconciliation is pending; do not retry'}), 503


@payments_bp.route('/api/payments/webhooks/razorpay', methods=['POST'])
def razorpay_webhook():
    secret = os.environ.get('RAZORPAY_WEBHOOK_SECRET', '')
    signature = request.headers.get('X-Razorpay-Signature', '')
    raw_body = request.get_data(cache=True)
    if not secret or not signature:
        return jsonify({'error': 'Webhook not configured'}), 503
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return jsonify({'error': 'Invalid webhook signature'}), 400
    event = request.get_json(silent=True) or {}
    event_name = event.get('event')
    payload = event.get('payload') or {}
    payment_entity = ((payload.get('payment') or {}).get('entity') or {})
    provider_order_id = payment_entity.get('order_id')
    payment = PaymentOrder.query.filter_by(provider_order_id=provider_order_id).first() if provider_order_id else None
    if payment and event_name in ('payment.captured', 'order.paid'):
        if reconcile_captured_entity(payment, payment_entity):
            db.session.commit()
    subscription_entity = ((payload.get('subscription') or {}).get('entity') or {})
    if event_name in ('subscription.activated', 'subscription.charged', 'subscription.authenticated', 'subscription.halted', 'subscription.cancelled', 'subscription.completed'):
        record = PremiumSubscription.query.filter_by(provider_subscription_id=subscription_entity.get('id')).with_for_update().first() if subscription_entity.get('id') else None
        if record:
            record.status = str(subscription_entity.get('status') or event_name.replace('subscription.', ''))
            period_end = subscription_entity.get('current_end')
            paid_through = datetime.datetime.fromtimestamp(period_end, datetime.timezone.utc).replace(tzinfo=None) if isinstance(period_end, int) and period_end else None
            if paid_through:
                record.current_period_end = paid_through
            if event_name == 'subscription.charged':
                charged_payment = payment_entity
                payment_id = str(charged_payment.get('id') or '')
                expected_plan = get_premium_plan(record.plan_code)
                if (payment_id and charged_payment.get('subscription_id') == record.provider_subscription_id
                        and str(charged_payment.get('status') or '').lower() == 'captured'
                        and charged_payment.get('amount') == record.amount_paise
                        and str(charged_payment.get('currency') or '').upper() == 'INR'
                        and expected_plan
                        and subscription_entity.get('plan_id') == expected_plan['provider_plan_id']):
                    record.last_payment_id = payment_id
                    activate_premium_for_month(db.session.get(User, record.user_id), paid_through,
                        duration_months=record.duration_months, plan_code=record.plan_code)
            elif event_name in ('subscription.halted', 'subscription.cancelled', 'subscription.completed'):
                user = db.session.get(User, record.user_id)
                if user and user.premium_expires_at and user.premium_expires_at <= utc_now():
                    user.is_premium = False
            db.session.commit()
    if event_name == 'order.paid':
        order_entity = ((payload.get('order') or {}).get('entity') or {})
        payment = PaymentOrder.query.filter_by(provider_order_id=order_entity.get('id')).first()
        if (
            payment
            and order_entity.get('amount_paid') == payment.amount_paise
            and str(order_entity.get('currency') or '').upper() == payment.currency
            and reconcile_captured_entity(payment, payment_entity)
        ):
            db.session.commit()
    if payment and event_name == 'payment.failed' and payment.status not in ('captured', 'approval_pending', 'approved', 'rejected', 'refunding', 'refunded'):
        if payment_entity.get('amount') == payment.amount_paise and str(payment_entity.get('currency') or '').upper() == payment.currency:
            payment.status = 'failed'
            db.session.commit()
    if event_name in ('refund.processed', 'refund.failed'):
        refund_entity = (((event.get('payload') or {}).get('refund') or {}).get('entity') or {})
        provider_payment_id = refund_entity.get('payment_id')
        payment = PaymentOrder.query.filter_by(provider_payment_id=provider_payment_id).first() if provider_payment_id else None
        if payment and payment.status != 'refunded':
            provider_refund_id = str(refund_entity.get('id') or '')
            refund_matches = (
                bool(provider_refund_id)
                and
                refund_entity.get('amount') == payment.amount_paise
                and (not refund_entity.get('currency') or str(refund_entity.get('currency')).upper() == payment.currency)
                and (not payment.provider_refund_id or payment.provider_refund_id == provider_refund_id)
            )
            if refund_matches:
                payment.provider_refund_id = provider_refund_id
                if event_name == 'refund.processed':
                    payment.status = 'refunded'
                    payment.refunded_at = payment.refunded_at or utc_now()
                    if payment.purpose == 'marketplace': mark_marketplace_order_refunded(payment)
                else:
                    payment.status = 'refund_requested'
                db.session.commit()
    return jsonify({'ok': True})
