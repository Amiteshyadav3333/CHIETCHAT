#!/usr/bin/env python3
"""Delete de-identified payment rows after their configured retention period."""

import argparse
import datetime

try:
    from app import app
    from models import db, PaymentOrder, Message
    from utils import utc_now, queue_claimed_upload_assets, process_media_deletion_task
except ImportError:
    from backend.app import app
    from backend.models import db, PaymentOrder, Message
    from backend.utils import utc_now, queue_claimed_upload_assets, process_media_deletion_task


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
        expired_snap_messages = Message.query.filter(
            Message.snap_mode.is_(True),
            Message.timestamp <= utc_now() - datetime.timedelta(days=7),
        ).order_by(Message.timestamp).limit(args.limit).all()
        media_task_ids = []
        for message in expired_snap_messages:
            media_task_ids.extend(queue_claimed_upload_assets('message', message.id))
            db.session.delete(message)
        db.session.commit()
        for task_id in media_task_ids:
            process_media_deletion_task(task_id)
        print({'expiredPaymentRecordsDeleted': len(expired), 'expiredSnapMessagesDeleted': len(expired_snap_messages)})


if __name__ == '__main__':
    main()
