#!/usr/bin/env python3
"""Delete de-identified payment rows after their configured retention period."""

import argparse

try:
    from app import app
    from models import db, PaymentOrder
    from utils import utc_now
except ImportError:
    from backend.app import app
    from backend.models import db, PaymentOrder
    from backend.utils import utc_now


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=250)
    parser.add_argument('--confirm', action='store_true')
    args = parser.parse_args()
    if not args.confirm:
        raise SystemExit('--confirm is required')
    if args.limit < 1 or args.limit > 1000:
        parser.error('--limit must be between 1 and 1000')

    with app.app_context():
        expired = PaymentOrder.query.filter(
            PaymentOrder.payer_id.is_(None),
            PaymentOrder.payee_id.is_(None),
            PaymentOrder.retention_until.is_not(None),
            PaymentOrder.retention_until <= utc_now(),
        ).order_by(PaymentOrder.retention_until).limit(args.limit).all()
        for payment in expired:
            db.session.delete(payment)
        db.session.commit()
        print({'expiredPaymentRecordsDeleted': len(expired)})


if __name__ == '__main__':
    main()
