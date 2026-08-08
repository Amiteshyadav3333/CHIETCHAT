#!/usr/bin/env python3
import argparse
import json
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from flask import Flask
from extensions import socketio
from models import db, WorkerHeartbeat
from scheduled_messages import deliver_due_scheduled_messages
from call_records import maintain_call_records
from payment_reconciliation import reconcile_payments
from utils import utc_now
from ai_retention import maintain_ai_memory


def scheduler_app():
    database_url = os.environ.get('DATABASE_URL', '').replace('postgres://', 'postgresql://', 1)
    if not database_url:
        raise RuntimeError('DATABASE_URL is required')
    app = Flask('cheetchat-scheduled-delivery')
    app.config.update(
        SQLALCHEMY_DATABASE_URI=database_url,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )
    db.init_app(app)
    socketio.init_app(app, message_queue=os.environ.get('REDIS_URL') or None, channel='cheetchat')
    return app


def main():
    parser = argparse.ArgumentParser(description='Deliver due opaque E2EE scheduled messages.')
    parser.add_argument('--limit', type=int, default=100)
    args = parser.parse_args()
    if args.limit < 1 or args.limit > 1000:
        parser.error('limit must be between 1 and 1000')
    app = scheduler_app()
    with app.app_context():
        results = {
            'scheduledMessages': deliver_due_scheduled_messages(args.limit),
            'callRecords': maintain_call_records(args.limit),
            'payments': reconcile_payments(min(args.limit, 100)),
            'aiMemory': maintain_ai_memory(args.limit),
        }
        now = utc_now()
        degraded = results['payments'].get('errors', 0) > 0
        heartbeat = db.session.get(WorkerHeartbeat, 'scheduled-delivery') or WorkerHeartbeat(
            name='scheduled-delivery'
        )
        heartbeat.last_run_at = now
        heartbeat.status = 'degraded' if degraded else 'ok'
        heartbeat.summary_json = json.dumps(results, separators=(',', ':'))
        if not degraded:
            heartbeat.last_success_at = now
        db.session.add(heartbeat)
        db.session.commit()
        print(json.dumps({**results, 'heartbeat': heartbeat.status}))


if __name__ == '__main__':
    main()
