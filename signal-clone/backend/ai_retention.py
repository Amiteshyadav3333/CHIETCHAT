import datetime

from flask import current_app

from models import AiConversation, db
from utils import utc_now


def maintain_ai_memory(limit=500, user_limit=50):
    retention_days = int(current_app.config.get('AI_MEMORY_RETENTION_DAYS', 30))
    max_rows = int(current_app.config.get('AI_MEMORY_MAX_ROWS', 100))
    cutoff = utc_now() - datetime.timedelta(days=retention_days)
    expired_ids = [row.id for row in AiConversation.query.filter(
        AiConversation.created_at < cutoff,
    ).order_by(AiConversation.id.asc()).limit(limit).all()]
    if expired_ids:
        AiConversation.query.filter(AiConversation.id.in_(expired_ids)).delete(synchronize_session=False)

    user_ids = [row[0] for row in db.session.query(AiConversation.user_id)
        .distinct().order_by(AiConversation.user_id.asc()).limit(user_limit).all()]
    overflow_ids = []
    remaining = max(0, limit - len(expired_ids))
    for user_id in user_ids:
        if remaining <= 0:
            break
        ids = [row.id for row in AiConversation.query.filter_by(user_id=user_id)
            .order_by(AiConversation.created_at.desc(), AiConversation.id.desc())
            .offset(max_rows).limit(remaining).all()]
        overflow_ids.extend(ids)
        remaining -= len(ids)
    if overflow_ids:
        AiConversation.query.filter(AiConversation.id.in_(overflow_ids)).delete(synchronize_session=False)
    db.session.commit()
    return {'expiredDeleted': len(expired_ids), 'overflowDeleted': len(overflow_ids)}
