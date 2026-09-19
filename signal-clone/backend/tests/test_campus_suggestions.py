import os
import datetime
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
os.environ['TESTING'] = '1'

from app import app
from models import db, User, Contact, Notification, Chat, ChatParticipant
from utils import serialize_user, has_contact, find_direct_chat


def test_user_college_location_serialization():
    with app.app_context():
        db.create_all()
        u = User(
            username='campus_student_1',
            email='student1@delhiuniv.edu',
            phone='9876543210',
            college='Delhi University',
            location='New Delhi'
        )
        db.session.add(u)
        db.session.commit()

        data = serialize_user(u)
        assert data['college'] == 'Delhi University'
        assert data['location'] == 'New Delhi'


def test_campus_suggestions_and_connect():
    with app.app_context():
        db.create_all()

        viewer = User(
            username='viewer_student',
            email='viewer@iitd.ac.in',
            phone='9111111111',
            college='IIT Delhi',
            location='New Delhi'
        )
        same_college_user = User(
            username='batchmate',
            email='batchmate@iitd.ac.in',
            phone='9222222222',
            college='IIT Delhi',
            location='New Delhi'
        )
        same_city_user = User(
            username='delhi_friend',
            email='friend@du.ac.in',
            phone='9333333333',
            college='Delhi University',
            location='New Delhi'
        )
        other_user = User(
            username='mumbai_user',
            email='mumbai@mumbai.ac.in',
            phone='9444444444',
            college='Mumbai University',
            location='Mumbai'
        )
        db.session.add_all([viewer, same_college_user, same_city_user, other_user])
        db.session.commit()

        with app.test_client() as client:
            with client.session_transaction() as sess:
                pass

            # Mock authentication using patch
            from unittest.mock import patch
            with patch('routes.users_bp.get_current_user_id', return_value=viewer.id):
                res = client.get('/api/users/suggestions')
                assert res.status_code == 200
                data = res.get_json()
                assert len(data) >= 3

                # First suggested should be the same college match
                assert data[0]['username'] == 'batchmate'
                assert data[0]['sameCollege'] is True
                assert 'Same College' in data[0]['suggestionReason']

                # Test connect endpoint
                conn_res = client.post(f'/api/users/{same_college_user.id}/connect')
                assert conn_res.status_code == 200
                conn_data = conn_res.get_json()
                assert conn_data['ok'] is True
                assert conn_data['connected'] is True
                assert conn_data['chatId'] is not None

                # Verify mutual contact was established
                assert has_contact(viewer.id, same_college_user.id)
                assert has_contact(same_college_user.id, viewer.id)

                # Verify notification was sent with campus context
                notif = Notification.query.filter_by(recipient_id=same_college_user.id, sender_id=viewer.id).first()
                assert notif is not None
                assert notif.type == 'connect_request'
                assert 'IIT Delhi' in notif.content


def test_status_duration_and_customizable_timer():
    from models import Status
    from utils import utc_now
    with app.app_context():
        db.create_all()
        u = User(username='story_user', email='story@test.com', phone='9555555555')
        db.session.add(u)
        db.session.commit()

        # Custom 1s slide & 30s lifespan
        s_fast = Status(
            user_id=u.id,
            media_url='https://example.com/fast.jpg',
            media_type='image',
            duration=1,
            expires_at=utc_now() + datetime.timedelta(seconds=30)
        )
        # Custom 60s slide & 24h lifespan (86400s)
        s_standard = Status(
            user_id=u.id,
            media_url='https://example.com/standard.jpg',
            media_type='image',
            duration=60,
            expires_at=utc_now() + datetime.timedelta(seconds=86400)
        )
        db.session.add_all([s_fast, s_standard])
        db.session.commit()

        fetched_fast = db.session.get(Status, s_fast.id)
        assert fetched_fast.duration == 1
        assert (fetched_fast.expires_at - utc_now()).total_seconds() <= 35

        fetched_standard = db.session.get(Status, s_standard.id)
        assert fetched_standard.duration == 60
        assert (fetched_standard.expires_at - utc_now()).total_seconds() > 86000

