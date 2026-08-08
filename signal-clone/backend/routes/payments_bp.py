import base64
import hashlib
import hmac
import json
import os
import re
import urllib.error
import urllib.request
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from models import db, User, ChatParticipant, BusinessProfile, PaymentOrder
from utils import get_current_user_id, get_json_data, iso_utc, utc_now
from observability import report_safe_exception

payments_bp = Blueprint('payments_bp', __name__)
CAPTURE_TERMINAL_STATUSES = {'refunding', 'refunded'}


def payment_payload(payment):
    return {
        'id': payment.id,
        'chatId': payment.chat_id,
        'payerId': payment.payer_id,
        'payeeId': payment.payee_id,
        'amount': payment.amount_paise / 100,
        'currency': payment.currency,
        'description': payment.description or '',
        'provider': payment.provider,
        'providerOrderId': payment.provider_order_id,
        'providerPaymentId': payment.provider_payment_id,
        'providerRefundId': payment.provider_refund_id,
        'clientRequestId': payment.client_request_id,
        'status': payment.status,
        'createdAt': iso_utc(payment.created_at),
        'paidAt': iso_utc(payment.paid_at),
        'refundRequestedAt': iso_utc(payment.refund_requested_at),
        'refundedAt': iso_utc(payment.refunded_at),
        'verified': payment.status in ('paid', 'captured'),
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
    payment.status = 'captured'
    payment.paid_at = payment.paid_at or utc_now()
    return True


@payments_bp.route('/api/payments/config', methods=['GET'])
def payment_config():
    if not get_current_user_id():
        return jsonify({'error': 'Unauthorized'}), 401
    key_id, key_secret = razorpay_credentials()
    webhook_ready = bool(os.environ.get('RAZORPAY_WEBHOOK_SECRET'))
    return jsonify({
        'enabled': bool(key_id and key_secret and webhook_ready),
        'provider': 'razorpay',
        'keyId': key_id if key_id and key_secret and webhook_ready else None,
        'webhookReady': webhook_ready,
        'currency': 'INR',
        'minAmount': 1,
        'maxAmount': 100000,
    })


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
    description = str(data.get('description') or 'CHEETCHAT business payment').strip()[:160]
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
    payment.provider_payment_id = provider_payment_id
    payment.status = provider_status
    if provider_status == 'captured':
        payment.paid_at = payment.paid_at or utc_now()
    db.session.commit()
    return jsonify(payment_payload(payment)), 200 if provider_status == 'captured' else 202


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
    if payment and event_name == 'payment.failed' and payment.status not in ('captured', 'refunding', 'refunded'):
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
                else:
                    payment.status = 'refund_requested'
                db.session.commit()
    return jsonify({'ok': True})
