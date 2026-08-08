import datetime
import os

from models import CallRecord, db
from utils import utc_now


def maintain_call_records(limit=500):
    now = utc_now()
    missed = CallRecord.query.filter(
        CallRecord.status == 'ringing',
        CallRecord.started_at <= now - datetime.timedelta(minutes=2),
    ).order_by(CallRecord.id.asc()).limit(limit).all()
    for record in missed:
        record.status = 'missed'
        record.ended_at = now

    abandoned = CallRecord.query.filter(
        CallRecord.status == 'active',
        CallRecord.started_at <= now - datetime.timedelta(hours=24),
    ).order_by(CallRecord.id.asc()).limit(limit).all()
    for record in abandoned:
        record.status = 'ended'
        record.ended_at = now

    try:
        retention_days = int(os.environ.get('CALL_RECORD_RETENTION_DAYS', '90'))
    except (TypeError, ValueError) as exc:
        raise RuntimeError('CALL_RECORD_RETENTION_DAYS must be an integer') from exc
    if not 30 <= retention_days <= 730:
        raise RuntimeError('CALL_RECORD_RETENTION_DAYS must be between 30 and 730')
    cutoff = now - datetime.timedelta(days=retention_days)
    stale_ids = [record.id for record in CallRecord.query.filter(
        CallRecord.status.in_(('missed', 'ended')),
        CallRecord.ended_at.isnot(None),
        CallRecord.ended_at < cutoff,
    ).order_by(CallRecord.id.asc()).limit(limit).all()]
    if stale_ids:
        CallRecord.query.filter(CallRecord.id.in_(stale_ids)).delete(synchronize_session=False)
    db.session.commit()
    return {'missedFinalized': len(missed), 'abandonedFinalized': len(abandoned), 'recordsPurged': len(stale_ids)}
