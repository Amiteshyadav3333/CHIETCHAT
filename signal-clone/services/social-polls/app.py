"""Independently deployed, service-owned Social Poll vote storage."""
import hashlib
import hmac
import os
import time
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from sqlalchemy import BigInteger, DateTime, Integer, PrimaryKeyConstraint, create_engine, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

VOTE_PATH = '/internal/v1/social-polls/vote'
RESULTS_PATH = '/internal/v1/social-polls/results'
IMPORT_PATH = '/internal/v1/social-polls/import'


class Base(DeclarativeBase):
    pass


class PollVote(Base):
    __tablename__ = 'social_poll_votes'
    post_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    option_index: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    __table_args__ = (PrimaryKeyConstraint('post_id', 'user_id', name='pk_social_poll_votes'),)


def signature(secret, timestamp, request_id, method, path, body):
    digest = hashlib.sha256(body).hexdigest()
    message = f'{timestamp}\n{request_id}\n{method.upper()}\n{path}\n{digest}'
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


def valid_options(options):
    return (isinstance(options, list) and 2 <= len(options) <= 4
            and all(isinstance(value, str) and value.strip() and len(value) <= 100 for value in options))


def create_app(test_config=None):
    app = Flask(__name__)
    if test_config:
        app.config.update(test_config)
    url = app.config.get('DATABASE_URL') or os.environ.get('SOCIAL_POLLS_DATABASE_URL')
    if url and url.startswith('postgres://'):
        url = url.replace('postgres://', 'postgresql://', 1)
    engine = create_engine(url, pool_pre_ping=True) if url else None
    sessions = sessionmaker(engine, expire_on_commit=False) if engine else None
    app.extensions['social_polls_engine'] = engine
    app.extensions['social_polls_sessions'] = sessions

    def key():
        return (app.config.get('HMAC_KEY') or os.environ.get('SOCIAL_POLLS_SERVICE_HMAC_KEY') or '').strip()

    def authorize():
        ts = request.headers.get('X-Internal-Timestamp', '')
        rid = request.headers.get('X-Internal-Request-Id', '')
        supplied = request.headers.get('X-Internal-Signature', '')
        secret = key()
        if len(secret) < 32 or len(rid) != 32 or len(supplied) != 64:
            return False
        try:
            if abs(int(time.time()) - int(ts)) > 60:
                return False
        except ValueError:
            return False
        expected = signature(secret, ts, rid, request.method, request.path, request.get_data(cache=True))
        return hmac.compare_digest(expected, supplied)

    def insert_statement():
        if engine.dialect.name == 'sqlite':
            return sqlite_insert(PollVote.__table__)
        return pg_insert(PollVote.__table__)

    @app.get('/health/live')
    def live():
        return jsonify({'service': 'cheetchat-social-polls', 'status': 'ok'})

    @app.get('/health/ready')
    def ready():
        okay = len(key()) >= 32 and sessions is not None
        if okay:
            try:
                with engine.connect() as conn:
                    conn.execute(select(1))
            except SQLAlchemyError:
                okay = False
        return jsonify({'service': 'cheetchat-social-polls', 'status': 'ready' if okay else 'not_ready'}), 200 if okay else 503

    @app.post(VOTE_PATH)
    def vote():
        if not authorize():
            return jsonify({'error': 'Unauthorized'}), 401
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({'error': 'Invalid poll vote'}), 400
        post_id, user_id, index, options = data.get('postId'), data.get('userId'), data.get('optionIndex'), data.get('options')
        if (type(post_id) is not int or post_id < 1 or type(user_id) is not int or user_id < 1
                or type(index) is not int or not valid_options(options) or not 0 <= index < len(options)):
            return jsonify({'error': 'Invalid poll vote'}), 400
        stmt = insert_statement().values(post_id=post_id, user_id=user_id, option_index=index, created_at=datetime.now(timezone.utc))
        stmt = stmt.on_conflict_do_update(index_elements=['post_id', 'user_id'], set_={
            'option_index': stmt.excluded.option_index, 'created_at': stmt.excluded.created_at,
        })
        try:
            with sessions.begin() as session:
                session.execute(stmt)
                rows = session.execute(select(PollVote.option_index, func.count()).where(
                    PollVote.post_id == post_id).group_by(PollVote.option_index)).all()
            counts = [0] * len(options)
            for option_index, count in rows:
                if 0 <= option_index < len(counts):
                    counts[option_index] = count
            return jsonify({'options': options, 'counts': counts, 'totalVotes': sum(counts), 'selectedOption': index})
        except SQLAlchemyError:
            app.logger.exception('poll vote persistence failed')
            return jsonify({'error': 'Poll service unavailable'}), 503

    @app.post(RESULTS_PATH)
    def results():
        if not authorize():
            return jsonify({'error': 'Unauthorized'}), 401
        data = request.get_json(silent=True)
        if not isinstance(data, dict) or type(data.get('userId')) is not int or data['userId'] < 1:
            return jsonify({'error': 'Invalid poll query'}), 400
        polls = data.get('polls')
        if not isinstance(polls, list) or len(polls) > 500:
            return jsonify({'error': 'Invalid poll query'}), 400
        options_by_id = {}
        for poll in polls:
            if (not isinstance(poll, dict) or type(poll.get('postId')) is not int or poll['postId'] < 1
                    or poll['postId'] in options_by_id or not valid_options(poll.get('options'))):
                return jsonify({'error': 'Invalid poll query'}), 400
            options_by_id[poll['postId']] = poll['options']
        output = {str(pid): {'counts': [0] * len(options), 'selectedOption': None}
                  for pid, options in options_by_id.items()}
        try:
            if options_by_id:
                with sessions() as session:
                    rows = session.execute(select(PollVote.post_id, PollVote.user_id, PollVote.option_index)
                                           .where(PollVote.post_id.in_(options_by_id))).all()
                for pid, voter, index in rows:
                    result = output[str(pid)]
                    if 0 <= index < len(result['counts']):
                        result['counts'][index] += 1
                        if voter == data['userId']:
                            result['selectedOption'] = index
            return jsonify({'polls': output})
        except SQLAlchemyError:
            app.logger.exception('poll results query failed')
            return jsonify({'error': 'Poll service unavailable'}), 503

    @app.post(IMPORT_PATH)
    def import_votes():
        if not authorize():
            return jsonify({'error': 'Unauthorized'}), 401
        data = request.get_json(silent=True)
        votes = data.get('votes') if isinstance(data, dict) else None
        if not isinstance(votes, list) or len(votes) > 5000:
            return jsonify({'error': 'Invalid import batch'}), 400
        normalized = []
        for item in votes:
            if (not isinstance(item, dict) or type(item.get('postId')) is not int or item['postId'] < 1
                    or type(item.get('userId')) is not int or item['userId'] < 1
                    or type(item.get('optionIndex')) is not int or item['optionIndex'] < 0):
                return jsonify({'error': 'Invalid import batch'}), 400
            raw = item.get('createdAt')
            try:
                created = datetime.fromisoformat(raw.replace('Z', '+00:00')) if isinstance(raw, str) else datetime.now(timezone.utc)
            except ValueError:
                return jsonify({'error': 'Invalid import batch'}), 400
            normalized.append({'post_id': item['postId'], 'user_id': item['userId'],
                               'option_index': item['optionIndex'], 'created_at': created})
        try:
            if normalized:
                stmt = insert_statement().values(normalized).on_conflict_do_nothing(index_elements=['post_id', 'user_id'])
                with sessions.begin() as session:
                    inserted = session.execute(stmt).rowcount
                    total_rows = session.scalar(select(func.count()).select_from(PollVote))
            else:
                inserted = 0
                with sessions() as session:
                    total_rows = session.scalar(select(func.count()).select_from(PollVote))
            return jsonify({'imported': inserted, 'totalRows': total_rows})
        except SQLAlchemyError:
            app.logger.exception('poll import failed')
            return jsonify({'error': 'Poll service unavailable'}), 503

    return app


app = create_app()
