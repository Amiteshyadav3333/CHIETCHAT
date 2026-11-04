"""Apply the Social Polls service-owned schema."""
import os
from sqlalchemy import create_engine
from app import Base

url = (os.environ.get('SOCIAL_POLLS_DATABASE_URL') or '').strip()
if url.startswith('postgres://'):
    url = url.replace('postgres://', 'postgresql://', 1)
if not url:
    raise SystemExit('SOCIAL_POLLS_DATABASE_URL is required')
Base.metadata.create_all(create_engine(url, pool_pre_ping=True))
print('Social Polls schema is ready.')
