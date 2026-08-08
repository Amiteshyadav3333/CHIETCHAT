import datetime
import urllib.parse

from models import PaymentOrder, db
from routes.payments_bp import provider_request, reconcile_captured_entity
from utils import utc_now


def _valid_order(payment, order):
    return bool(
        order and order.get('id')
        and order.get('amount') == payment.amount_paise
        and str(order.get('currency') or '').upper() == payment.currency
        and str(order.get('receipt') or '') == f'cheetchat-{payment.id}'
    )


def _reconcile_order(payment):
    if payment.provider_order_id.startswith('pending-'):
        receipt = urllib.parse.quote(f'cheetchat-{payment.id}', safe='')
        collection = provider_request(f'orders?receipt={receipt}&count=10')
        matches = [item for item in collection.get('items', []) if _valid_order(payment, item)]
        if len(matches) != 1:
            return False
        order = matches[0]
        claimed = PaymentOrder.query.filter(
            PaymentOrder.provider_order_id == order['id'], PaymentOrder.id != payment.id,
        ).first()
        if claimed:
            return False
        payment.provider_order_id = order['id']
    else:
        order = provider_request(f'orders/{payment.provider_order_id}')
        if not _valid_order(payment, order):
            return False

    provider_status = str(order.get('status') or '').lower()
    if provider_status in ('created', 'attempted'):
        payment.status = provider_status
    payments = provider_request(f'orders/{payment.provider_order_id}/payments')
    entities = payments.get('items', []) if isinstance(payments, dict) else []
    captured = next((item for item in entities if str(item.get('status') or '').lower() == 'captured'), None)
    if captured:
        return reconcile_captured_entity(payment, captured)
    authorized = next((item for item in entities if str(item.get('status') or '').lower() == 'authorized'), None)
    if authorized:
        provider_payment_id = str(authorized.get('id') or '')
        claimed = PaymentOrder.query.filter(
            PaymentOrder.provider_payment_id == provider_payment_id,
            PaymentOrder.id != payment.id,
        ).first()
        if (
            provider_payment_id and not claimed
            and authorized.get('order_id') == payment.provider_order_id
            and authorized.get('amount') == payment.amount_paise
            and str(authorized.get('currency') or '').upper() == payment.currency
        ):
            payment.provider_payment_id = provider_payment_id
            payment.status = 'authorized'
            return True
    if payment.created_at and payment.created_at <= utc_now() - datetime.timedelta(days=7):
        payment.status = 'expired'
    return True


def _valid_refund(payment, refund):
    return bool(
        refund and refund.get('id')
        and refund.get('payment_id') == payment.provider_payment_id
        and refund.get('amount') == payment.amount_paise
        and (not refund.get('currency') or str(refund.get('currency')).upper() == payment.currency)
        and str((refund.get('notes') or {}).get('payment_order_id') or '') == str(payment.id)
    )


def _reconcile_refund(payment):
    if not payment.provider_payment_id:
        return False
    if payment.provider_refund_id:
        refund = provider_request(f'refunds/{payment.provider_refund_id}')
        if not _valid_refund(payment, refund):
            return False
    else:
        collection = provider_request(f'payments/{payment.provider_payment_id}/refunds?count=100')
        matches = [item for item in collection.get('items', []) if _valid_refund(payment, item)]
        if len(matches) != 1:
            return False
        refund = matches[0]
        claimed = PaymentOrder.query.filter(
            PaymentOrder.provider_refund_id == refund['id'], PaymentOrder.id != payment.id,
        ).first()
        if claimed:
            return False
        payment.provider_refund_id = refund['id']
    status = str(refund.get('status') or '').lower()
    if status == 'processed':
        payment.status = 'refunded'
        payment.refunded_at = payment.refunded_at or utc_now()
    elif status == 'failed':
        payment.status = 'refund_requested'
    else:
        payment.status = 'refunding'
    return True


def reconcile_payments(limit=100):
    now = utc_now()
    cutoff = now - datetime.timedelta(minutes=5)
    candidates = PaymentOrder.query.filter(
        PaymentOrder.status.in_(('creating', 'creation_unknown', 'created', 'attempted', 'authorized', 'refunding')),
        PaymentOrder.updated_at <= cutoff,
    ).order_by(PaymentOrder.updated_at.asc(), PaymentOrder.id.asc()).limit(limit).all()
    reconciled = 0
    errors = 0
    for payment in candidates:
        try:
            changed = _reconcile_refund(payment) if payment.status == 'refunding' else _reconcile_order(payment)
            payment.updated_at = now
            db.session.commit()
            reconciled += int(bool(changed))
        except Exception:
            db.session.rollback()
            current = db.session.get(PaymentOrder, payment.id)
            if current:
                current.updated_at = now
                db.session.commit()
            errors += 1
    return {'checked': len(candidates), 'reconciled': reconciled, 'errors': errors}
