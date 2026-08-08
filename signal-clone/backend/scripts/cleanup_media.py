#!/usr/bin/env python3
"""Retry media deletions and remove expired status media in bounded batches."""

import argparse

try:
    from app import app
    from models import db, MediaDeletionTask, Status, UploadAsset
    from utils import (
        process_media_deletion_task, queue_media_deletion, queue_claimed_upload_assets, utc_now,
    )
except ImportError:
    from backend.app import app
    from backend.models import db, MediaDeletionTask, Status, UploadAsset
    from backend.utils import (
        process_media_deletion_task, queue_media_deletion, queue_claimed_upload_assets, utc_now,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=100)
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 1000:
        parser.error('--limit must be between 1 and 1000')

    with app.app_context():
        abandoned = UploadAsset.query.filter(
            UploadAsset.status == 'pending', UploadAsset.expires_at <= utc_now()
        ).order_by(UploadAsset.created_at).limit(args.limit).all()
        queued_ids = []
        for asset in abandoned:
            task = queue_media_deletion(asset.media_url, asset.resource_type, trusted=True)
            if task:
                db.session.flush()
                queued_ids.append(task.id)
            db.session.delete(asset)

        expired = Status.query.filter(Status.expires_at <= utc_now()).order_by(Status.id).limit(args.limit).all()
        for status in expired:
            queued_ids.extend(queue_claimed_upload_assets('status', status.id))
            task = queue_media_deletion(status.media_url, status.media_type)
            if task:
                db.session.flush()
                queued_ids.append(task.id)
            db.session.delete(status)
        db.session.commit()

        retry_ids = [task.id for task in MediaDeletionTask.query.order_by(MediaDeletionTask.created_at).limit(args.limit).all()]
        processed_ids = list(dict.fromkeys(queued_ids + retry_ids))[:args.limit]
        completed = sum(process_media_deletion_task(task_id) for task_id in processed_ids)
        print({
            'abandonedUploadsRemoved': len(abandoned),
            'expiredStatusesRemoved': len(expired),
            'deletionsAttempted': len(processed_ids),
            'deletionsCompleted': completed,
            'deletionsDeferred': len(processed_ids) - completed,
        })


if __name__ == '__main__':
    main()
