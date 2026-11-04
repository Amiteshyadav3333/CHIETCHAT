"""Backfill legacy poll votes before switching SOCIAL_POLLS_SERVICE_URL on."""
import argparse
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import app
from models import db, SocialPollVote
from service_gateway import call_social_poll_import

BATCH_SIZE = 2000

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--apply', action='store_true', help='Import votes; without this flag only count the source rows.')
args = parser.parse_args()
if args.apply and not (os.environ.get('SOCIAL_POLLS_SERVICE_URL') and os.environ.get('SOCIAL_POLLS_SERVICE_HMAC_KEY')):
    raise SystemExit('Set SOCIAL_POLLS_SERVICE_URL and SOCIAL_POLLS_SERVICE_HMAC_KEY before --apply.')

with app.app_context():
    expected = SocialPollVote.query.count()
    print(f'Legacy poll votes: {expected}')
    if not args.apply:
        print('Dry run only. Freeze poll voting, configure the service database, then rerun with --apply.')
        raise SystemExit(0)
    last_id = 0
    verified_total = None
    while True:
        batch = SocialPollVote.query.filter(SocialPollVote.id > last_id).order_by(SocialPollVote.id).limit(BATCH_SIZE).all()
        if not batch:
            break
        payload = [{
            'postId': vote.post_id,
            'userId': vote.user_id,
            'optionIndex': vote.option_index,
            'createdAt': vote.created_at.isoformat() if vote.created_at else None,
        } for vote in batch]
        response = call_social_poll_import(payload)
        last_id = batch[-1].id
        verified_total = response['totalRows']
        print(f'Imported through legacy row {last_id}: service has {verified_total} unique votes.')
    if verified_total is None:
        verified_total = call_social_poll_import([])['totalRows']
    if verified_total != expected:
        raise SystemExit(f'Cutover blocked: source has {expected} votes but service has {verified_total}.')
    print(f'Backfill verified: {verified_total} service-owned poll votes. You may now configure the API gateway cutover.')
