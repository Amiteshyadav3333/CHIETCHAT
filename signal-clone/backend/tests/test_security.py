import os
import unittest
import hashlib
import hmac
import json
import io
import re
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from datetime import timedelta
from unittest.mock import patch

os.environ.setdefault('DATABASE_URL', 'sqlite:///:memory:')
os.environ.setdefault('SECRET_KEY', 'test-secret-key-at-least-32-characters')
os.environ.setdefault('JWT_SECRET_KEY', 'test-jwt-secret-key-at-least-32-characters')

from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.datastructures import FileStorage

import app as app_module
from app import app, socketio, _rate_windows, _sensitive_limits
from models import (
    db, User, ActiveSession, Chat, ChatParticipant, BusinessProfile, CatalogProduct,
    PaymentOrder, Message, PushSubscription, Reel, SocialPost, Status, MediaDeletionTask,
    UploadAsset, ScheduledMessage, Contact, CallRecord, WorkerHeartbeat, AiConversation,
)
from scheduled_messages import deliver_due_scheduled_messages
from call_records import maintain_call_records
from payment_reconciliation import reconcile_payments
from observability import report_safe_exception
from ai_retention import maintain_ai_memory
from routes.ai_bp import _save_turn
from routes.auth_bp import create_token, finalize_login
from scripts import cleanup_retention
from utils import (
    utc_now, validate_upload, send_push_notification, delete_managed_media,
    get_managed_media_reference, process_media_deletion_task,
)


class SecurityTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        _rate_windows.clear()
        with app.app_context():
            db.drop_all()
            db.create_all()
            user = User(
                username='audit-user', email='audit@example.com', phone='9999999999',
                password_hash=generate_password_hash('old-password'),
                public_key='public-key', encrypted_private_key='x' * 100,
                email_verified=True,
            )
            db.session.add(user)
            db.session.flush()
            session = ActiveSession(user_id=user.id, token_hash='test-session')
            db.session.add(session)
            payee = User(
                username='merchant', email='merchant@example.com', phone='8888888888',
                password_hash=generate_password_hash('merchant-password'), email_verified=True,
            )
            db.session.add(payee)
            db.session.flush()
            chat = Chat(is_group=False)
            db.session.add(chat)
            db.session.flush()
            db.session.add_all([
                ChatParticipant(chat_id=chat.id, user_id=user.id),
                ChatParticipant(chat_id=chat.id, user_id=payee.id),
                BusinessProfile(user_id=payee.id, business_name='Audit Merchant'),
            ])
            db.session.commit()
            self.user_id = user.id
            self.session_id = session.id
            self.token = create_token(user, session_id=session.id)
            self.payee_id = payee.id
            self.chat_id = chat.id
            payee_session = ActiveSession(user_id=payee.id, token_hash='merchant-session')
            db.session.add(payee_session)
            db.session.commit()
            self.payee_token = create_token(payee, session_id=payee_session.id)
        self.client = app.test_client()

    def auth_headers(self):
        return {'Authorization': f'Bearer {self.token}'}

    def encrypted_envelope(self, label='ciphertext'):
        return json.dumps({
            'encrypted': True, 'iv': 'opaque-iv', 'data': label,
            'recipients': {str(self.user_id): 'wrapped-a', str(self.payee_id): 'wrapped-b'},
        })

    def test_private_routes_reject_anonymous_requests(self):
        self.assertEqual(self.client.get('/api/chats').status_code, 401)
        self.assertEqual(self.client.get('/api/business/me').status_code, 401)
        self.assertEqual(self.client.get('/api/calls/ice-config').status_code, 401)

    def test_chat_query_failure_does_not_invalidate_authenticated_session(self):
        with app.app_context():
            with patch('routes.chats_bp.ChatParticipant.query') as participant_query:
                participant_query.filter_by.side_effect = RuntimeError('schema unavailable')
                response = self.client.get('/api/chats', headers=self.auth_headers())
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json['error'], 'Could not load chats')

    def test_translation_rejects_oversized_text_before_contacting_provider(self):
        with patch('routes.main_bp.urllib.request.urlopen') as urlopen:
            response = self.client.post(
                '/api/translate', headers=self.auth_headers(),
                json={'text': 'x' * 8001, 'source_lang': 'auto', 'target_lang': 'hi'},
            )
        self.assertEqual(response.status_code, 400)
        urlopen.assert_not_called()

    def test_translation_rejects_invalid_language_codes(self):
        with patch('routes.main_bp.urllib.request.urlopen') as urlopen:
            response = self.client.post(
                '/api/translate', headers=self.auth_headers(),
                json={'text': 'hello', 'source_lang': 'auto', 'target_lang': 'https://example.com'},
            )
        self.assertEqual(response.status_code, 400)
        urlopen.assert_not_called()

    def test_operations_health_reports_degraded_and_stale_worker_without_taking_api_down(self):
        with app.app_context():
            heartbeat = WorkerHeartbeat(
                name='scheduled-delivery', last_run_at=utc_now(),
                last_success_at=utc_now() - timedelta(minutes=10), status='degraded',
            )
            db.session.add(heartbeat)
            db.session.commit()
        api_ready = self.client.get('/health/ready')
        self.assertEqual(api_ready.status_code, 200)
        recent = self.client.get('/health/operations')
        self.assertEqual(recent.status_code, 503)
        self.assertEqual(recent.json['worker'], 'degraded')
        with app.app_context():
            heartbeat = db.session.get(WorkerHeartbeat, 'scheduled-delivery')
            heartbeat.status = 'ok'
            heartbeat.last_run_at = utc_now()
            db.session.commit()
        healthy = self.client.get('/health/operations')
        self.assertEqual(healthy.status_code, 200)
        self.assertEqual(healthy.json['worker'], 'ok')
        with app.app_context():
            heartbeat = db.session.get(WorkerHeartbeat, 'scheduled-delivery')
            heartbeat.last_run_at = utc_now() - timedelta(minutes=4)
            db.session.commit()
        stale = self.client.get('/health/operations')
        self.assertEqual(stale.status_code, 503)
        self.assertEqual(stale.json['worker'], 'stale')

    def test_safe_reporter_never_interpolates_private_exception_value_into_logs(self):
        marker = 'private-email-password-message-marker'
        with app.test_request_context('/api/login', method='POST'):
            app_module.g.request_id = 'safe-request-id'
            with patch.object(app.logger, 'error') as logger:
                report_safe_exception('login_failed', RuntimeError(marker))
        logged = logger.call_args.args[0]
        self.assertNotIn(marker, logged)
        self.assertIn('RuntimeError', logged)
        self.assertIn('safe-request-id', logged)

    def test_http_only_cookie_session_requires_csrf_for_mutations(self):
        self.client.set_cookie('cheetchat_session', self.token)
        self.client.set_cookie('cheetchat_csrf', 'csrf-test-value')
        cookie_headers = {'Authorization': 'Bearer cookie-session'}
        me = self.client.get('/api/auth/me', headers=cookie_headers)
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json['user']['id'], self.user_id)

        rejected = self.client.post('/api/auth/logout', headers=cookie_headers)
        self.assertEqual(rejected.status_code, 403)
        self.assertEqual(rejected.json['error'], 'CSRF validation failed')
        accepted = self.client.post('/api/auth/logout', headers={
            **cookie_headers, 'X-CSRF-Token': 'csrf-test-value',
        })
        self.assertEqual(accepted.status_code, 200)
        cookies = accepted.headers.getlist('Set-Cookie')
        self.assertTrue(any('cheetchat_session=;' in value for value in cookies))
        self.assertTrue(any('cheetchat_csrf=;' in value for value in cookies))

    def test_stale_cookie_without_csrf_does_not_block_login(self):
        self.client.set_cookie('cheetchat_session', self.token)
        response = self.client.post('/api/login', json={
            'email': 'audit@example.com',
            'password': 'old-password',
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn('csrfToken', response.get_json())

    @patch('routes.auth_bp.get_supabase_user')
    def test_google_signup_creates_linked_account_and_returning_login(self, get_supabase_user):
        get_supabase_user.return_value = {
            'id': 'google-subject-123',
            'email': 'google-user@example.com',
            'email_confirmed_at': '2026-08-10T10:00:00Z',
            'app_metadata': {'provider': 'google', 'providers': ['google']},
            'user_metadata': {'full_name': 'Google User', 'avatar_url': 'https://example.com/avatar.png'},
            'identities': [{'provider': 'google'}],
        }
        exchange = self.client.post('/api/auth/google/exchange', json={'accessToken': 'supabase-token'})
        self.assertEqual(exchange.status_code, 200)
        self.assertTrue(exchange.json['onboardingRequired'])
        completed = self.client.post('/api/auth/google/complete', json={
            'accessToken': 'supabase-token',
            'phone': '7777777777',
            'useGoogleAvatar': True,
            'publicKey': 'p' * 100,
            'encryptedRecoveryKey': 'r' * 100,
            'deviceFingerprint': 'google-browser',
        })
        self.assertEqual(completed.status_code, 200)
        self.assertIn('csrfToken', completed.json)
        with app.app_context():
            user = User.query.filter_by(supabase_user_id='google-subject-123').one()
            self.assertEqual(user.auth_provider, 'google')
            self.assertIsNone(user.password_hash)
            self.assertFalse(user.phone_verified)
            self.assertTrue(user.platform_id)
        returning = self.client.post('/api/auth/google/exchange', json={'accessToken': 'supabase-token'})
        self.assertEqual(returning.status_code, 200)
        self.assertEqual(returning.json['user']['phone'], '7777777777')

    @patch('routes.auth_bp.get_supabase_user')
    def test_google_signup_does_not_auto_link_existing_password_email(self, get_supabase_user):
        get_supabase_user.return_value = {
            'id': 'different-google-subject',
            'email': 'audit@example.com',
            'email_confirmed_at': '2026-08-10T10:00:00Z',
            'app_metadata': {'provider': 'google'},
            'identities': [{'provider': 'google'}],
        }
        response = self.client.post('/api/auth/google/exchange', json={'accessToken': 'supabase-token'})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json['code'], 'EXISTING_EMAIL_ACCOUNT')

    def test_login_issues_http_only_cookie_without_exposing_jwt_in_json(self):
        with app.test_request_context('/api/login', method='POST', json={'deviceFingerprint': 'browser-test'}):
            user = db.session.get(User, self.user_id)
            response, status = finalize_login(user)
            self.assertEqual(status, 200)
            self.assertNotIn('token', response.get_json())
            self.assertGreaterEqual(len(response.get_json()['csrfToken']), 32)
            cookies = response.headers.getlist('Set-Cookie')
            session_cookie = next(value for value in cookies if value.startswith('cheetchat_session='))
            self.assertIn('HttpOnly', session_cookie)
            self.assertIn('SameSite=Lax', session_cookie)

    def test_socket_accepts_valid_http_only_session_cookie(self):
        self.client.set_cookie('cheetchat_session', self.token)
        socket_client = socketio.test_client(app, flask_test_client=self.client)
        self.assertTrue(socket_client.is_connected())
        socket_client.disconnect()

    def test_short_lived_socket_ticket_authenticates_realtime_connection(self):
        response = self.client.get('/api/auth/socket-ticket', headers=self.auth_headers())
        self.assertEqual(response.status_code, 200)
        socket_client = socketio.test_client(app, auth={'token': response.json['ticket']})
        self.assertTrue(socket_client.is_connected())
        socket_client.disconnect()

    def test_existing_encryption_key_reset_requires_recovery_backup(self):
        rejected = self.client.post('/api/user/key', json={
            'publicKey': 'replacement-public-key',
        }, headers=self.auth_headers())
        self.assertEqual(rejected.status_code, 409)

        accepted = self.client.post('/api/user/key', json={
            'publicKey': 'replacement-public-key',
            'encryptedRecoveryKey': 'r' * 100,
            'resetExisting': True,
        }, headers=self.auth_headers())
        self.assertEqual(accepted.status_code, 200)
        recovery = self.client.get('/api/user/key-recovery', headers=self.auth_headers())
        self.assertEqual(recovery.status_code, 200)
        self.assertEqual(recovery.json['recoveryKeyBackup'], 'r' * 100)

    def test_upload_validation_checks_content_not_just_extension(self):
        disguised = FileStorage(stream=io.BytesIO(b'<script>alert(1)</script>'), filename='avatar.jpg')
        with self.assertRaisesRegex(ValueError, 'contents do not match'):
            validate_upload(disguised, {'image'}, 1024)
        valid_png = FileStorage(
            stream=io.BytesIO(b'\x89PNG\r\n\x1a\n' + b'0' * 64), filename='avatar.png'
        )
        self.assertEqual(validate_upload(valid_png, {'image'}, 1024), 'image')
        oversized = FileStorage(stream=io.BytesIO(b'%PDF-' + b'0' * 100), filename='document.pdf')
        with self.assertRaisesRegex(ValueError, 'between 1 byte'):
            validate_upload(oversized, {'document'}, 10)

    def test_general_upload_rejects_html_and_fake_images(self):
        html = self.client.post('/api/upload', data={
            'file': (io.BytesIO(b'<html><script>alert(1)</script></html>'), 'attack.html'),
        }, headers=self.auth_headers(), content_type='multipart/form-data')
        self.assertEqual(html.status_code, 400)
        fake_image = self.client.post('/api/upload', data={
            'file': (io.BytesIO(b'<html>not an image</html>'), 'photo.jpg'),
        }, headers=self.auth_headers(), content_type='multipart/form-data')
        self.assertEqual(fake_image.status_code, 400)

    @patch('routes.main_bp.upload_to_cloudinary', return_value='https://media.example/chat-image.png')
    def test_general_upload_returns_owner_bound_expiring_asset(self, _upload):
        response = self.client.post('/api/upload', data={
            'file': (io.BytesIO(b'\x89PNG\r\n\x1a\n' + b'0' * 64), 'photo.png'),
        }, headers=self.auth_headers(), content_type='multipart/form-data')
        self.assertEqual(response.status_code, 200, response.get_json())
        self.assertTrue(response.json['assetId'])
        with app.app_context():
            asset = db.session.get(UploadAsset, response.json['assetId'])
            self.assertEqual(asset.owner_id, self.user_id)
            self.assertEqual(asset.status, 'pending')
            self.assertEqual(asset.media_kind, 'image')
            self.assertGreater(asset.expires_at, utc_now())

    def test_managed_media_deletion_restricts_provider_and_local_targets(self):
        with app.app_context(), patch.dict(os.environ, {'CLOUDINARY_CLOUD_NAME': 'cheetchat-cloud'}):
            reference = get_managed_media_reference(
                'https://res.cloudinary.com/cheetchat-cloud/video/upload/v123/chietchat/reels/demo.mp4',
                'video',
            )
            self.assertEqual(reference['public_id'], 'chietchat/reels/demo')
            self.assertIsNone(get_managed_media_reference(
                'https://res.cloudinary.com/another-cloud/video/upload/v123/chietchat/reels/demo.mp4',
                'video',
            ))

        with tempfile.TemporaryDirectory() as directory, app.app_context(), patch.dict(os.environ, {
            'BACKEND_URL': 'https://api.cheetchat.example',
        }):
            previous_folder = app.config['UPLOAD_FOLDER']
            app.config['UPLOAD_FOLDER'] = directory
            try:
                target = Path(directory) / 'owned-file.png'
                target.write_bytes(b'asset')
                self.assertTrue(delete_managed_media(
                    'https://api.cheetchat.example/uploads/owned-file.png', 'image'
                ))
                self.assertFalse(target.exists())
                with self.assertRaisesRegex(ValueError, 'not a configured'):
                    delete_managed_media('https://attacker.example/uploads/owned-file.png', 'image')
            finally:
                app.config['UPLOAD_FOLDER'] = previous_folder

    def test_failed_media_deletion_stays_queued_for_retry(self):
        with app.app_context():
            task = MediaDeletionTask(
                media_url='https://media.example/unmanaged.jpg', resource_type='image'
            )
            db.session.add(task)
            db.session.commit()
            task_id = task.id
            with patch('utils.delete_managed_media', side_effect=RuntimeError('provider unavailable')):
                self.assertFalse(process_media_deletion_task(task_id))
            queued = db.session.get(MediaDeletionTask, task_id)
            self.assertEqual(queued.attempts, 1)
            self.assertIn('provider unavailable', queued.last_error)

    def test_account_deletion_removes_managed_avatar_media(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {
            'BACKEND_URL': 'https://api.cheetchat.example',
        }):
            previous_folder = app.config['UPLOAD_FOLDER']
            app.config['UPLOAD_FOLDER'] = directory
            try:
                avatar = Path(directory) / 'account-avatar.png'
                avatar.write_bytes(b'avatar')
                with app.app_context():
                    user = db.session.get(User, self.user_id)
                    user.avatar = 'https://api.cheetchat.example/uploads/account-avatar.png'
                    payment = PaymentOrder(
                        payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                        amount_paise=1234, provider_order_id='order_retained_account_delete',
                        provider_payment_id='pay_retained_account_delete', status='captured',
                    )
                    db.session.add_all([
                        payment,
                        AiConversation(user_id=self.user_id, role='user', content='private AI memory'),
                    ])
                    db.session.commit()
                    payment_id = payment.id
                response = self.client.delete('/api/account', json={
                    'password': 'old-password', 'confirmation': 'audit-user',
                }, headers=self.auth_headers())
                self.assertEqual(response.status_code, 200, response.get_json())
                self.assertFalse(avatar.exists())
                with app.app_context():
                    self.assertIsNone(db.session.get(User, self.user_id))
                    self.assertEqual(AiConversation.query.filter_by(user_id=self.user_id).count(), 0)
                    self.assertEqual(MediaDeletionTask.query.count(), 0)
                    retained = db.session.get(PaymentOrder, payment_id)
                    self.assertIsNotNone(retained)
                    self.assertIsNone(retained.payer_id)
                    self.assertEqual(retained.payee_id, self.payee_id)
                    self.assertRegex(retained.payer_ref, r'^[a-f0-9]{64}$')
                    self.assertGreater(retained.retention_until, utc_now())
            finally:
                app.config['UPLOAD_FOLDER'] = previous_folder

    def test_hard_chat_deletion_preserves_deidentified_payment_reference(self):
        with app.app_context():
            payment = PaymentOrder(
                payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                amount_paise=5000, provider_order_id='order_retained_chat_delete',
                status='captured',
            )
            db.session.add(payment)
            db.session.commit()
            payment_id = payment.id
        response = self.client.delete(
            f'/api/chats/{self.chat_id}?option=everyone', headers=self.auth_headers()
        )
        self.assertEqual(response.status_code, 200, response.get_json())
        with app.app_context():
            retained = db.session.get(PaymentOrder, payment_id)
            self.assertIsNotNone(retained)
            self.assertIsNone(retained.chat_id)
            self.assertRegex(retained.chat_ref, r'^[a-f0-9]{64}$')
            self.assertEqual(retained.provider_order_id, 'order_retained_chat_delete')

    def test_expired_fully_deidentified_payment_can_be_purged(self):
        with app.app_context():
            payment = PaymentOrder(
                payer_id=None, payee_id=None, chat_id=None,
                payer_ref='a' * 64, payee_ref='b' * 64, chat_ref='c' * 64,
                amount_paise=900, provider_order_id='order_expired_retention',
                status='refunded', retention_until=utc_now() - timedelta(days=1),
            )
            db.session.add(payment)
            db.session.commit()
            payment_id = payment.id
        with patch.object(sys, 'argv', ['cleanup_retention.py', '--confirm']):
            cleanup_retention.main()
        with app.app_context():
            self.assertIsNone(db.session.get(PaymentOrder, payment_id))

    def test_every_non_public_api_route_rejects_anonymous_requests(self):
        public_routes = {
            ('POST', '/api/register'), ('POST', '/api/register/verify-otp'),
            ('POST', '/api/login'), ('POST', '/api/login/request-otp'),
            ('POST', '/api/login/verify-otp'), ('POST', '/api/forgot-password'),
            ('POST', '/api/reset-password'), ('POST', '/api/reset-password/key-backup'),
            ('POST', '/api/auth/2fa/login-verify'),
            ('POST', '/api/auth/google/exchange'), ('POST', '/api/auth/google/complete'),
            ('POST', '/api/payments/webhooks/razorpay'),
            ('GET', '/api/gifs'), ('GET', '/api/reels/<int:reel_id>/public'),
            ('GET', '/api/reels/<int:reel_id>/comments'),
            ('GET', '/api/user/check-platform-id/<string:handle>'),
        }
        failures = []
        for rule in app.url_map.iter_rules():
            if not rule.rule.startswith('/api/'):
                continue
            path = re.sub(r'<int:[^>]+>', '1', rule.rule)
            path = re.sub(r'<string:[^>]+>', 'test', path)
            path = re.sub(r'<[^>]+>', 'test', path)
            for method in rule.methods - {'HEAD', 'OPTIONS'}:
                if (method, rule.rule) in public_routes:
                    continue
                response = self.client.open(
                    path, method=method,
                    json={} if method in {'POST', 'PUT', 'PATCH', 'DELETE'} else None,
                )
                if response.status_code != 401:
                    failures.append(f'{method} {rule.rule}: HTTP {response.status_code}')
        self.assertEqual(failures, [], '\n'.join(failures))

    def test_server_schedules_only_opaque_envelopes_and_delivers_once(self):
        scheduled_for = (utc_now() + timedelta(minutes=5)).isoformat() + 'Z'
        plaintext = self.client.post(
            f'/api/chats/{self.chat_id}/scheduled-messages',
            json={'content': 'private text', 'scheduledFor': scheduled_for, 'clientMessageId': 'scheduled-1'},
            headers=self.auth_headers(),
        )
        self.assertEqual(plaintext.status_code, 400)
        envelope = json.dumps({
            'encrypted': True, 'iv': 'opaque-iv', 'data': 'opaque-ciphertext',
            'recipients': {str(self.user_id): 'wrapped-aes-a', str(self.payee_id): 'wrapped-aes-b'},
        })
        created = self.client.post(
            f'/api/chats/{self.chat_id}/scheduled-messages',
            json={'content': envelope, 'scheduledFor': scheduled_for, 'clientMessageId': 'scheduled-1'},
            headers=self.auth_headers(),
        )
        self.assertEqual(created.status_code, 201)
        duplicate = self.client.post(
            f'/api/chats/{self.chat_id}/scheduled-messages',
            json={'content': envelope, 'scheduledFor': scheduled_for, 'clientMessageId': 'scheduled-1'},
            headers=self.auth_headers(),
        )
        self.assertEqual(duplicate.status_code, 200)
        self.assertTrue(duplicate.json['duplicate'])
        listed = self.client.get(
            f'/api/chats/{self.chat_id}/scheduled-messages', headers=self.auth_headers(),
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json['items']), 1)
        self.assertNotIn('content', listed.json['items'][0])
        cancel_created = self.client.post(
            f'/api/chats/{self.chat_id}/scheduled-messages',
            json={'content': envelope, 'scheduledFor': scheduled_for, 'clientMessageId': 'scheduled-cancel'},
            headers=self.auth_headers(),
        )
        unauthorized_cancel = self.client.delete(
            f"/api/scheduled-messages/{cancel_created.json['id']}",
            headers={'Authorization': f'Bearer {self.payee_token}'},
        )
        self.assertEqual(unauthorized_cancel.status_code, 404)
        cancelled = self.client.delete(
            f"/api/scheduled-messages/{cancel_created.json['id']}", headers=self.auth_headers(),
        )
        self.assertEqual(cancelled.status_code, 200)

        with app.app_context():
            item = ScheduledMessage.query.filter_by(client_message_id='scheduled-1').one()
            self.assertEqual(item.encrypted_content, envelope)
            item.scheduled_for = utc_now() - timedelta(seconds=1)
            db.session.commit()
            result = deliver_due_scheduled_messages()
            self.assertEqual(result['delivered'], 1)
            message = Message.query.filter_by(client_message_id='scheduled-1').one()
            self.assertEqual(message.content, envelope)
            self.assertEqual(item.delivered_message_id, message.id)
            self.assertEqual(item.encrypted_content, '')
            self.assertEqual(deliver_due_scheduled_messages()['delivered'], 0)
            self.assertEqual(Message.query.filter_by(client_message_id='scheduled-1').count(), 1)

    def test_scheduled_message_pending_quota_prevents_storage_abuse(self):
        envelope = json.dumps({
            'encrypted': True, 'iv': 'iv', 'data': 'ciphertext',
            'recipients': {str(self.user_id): 'a', str(self.payee_id): 'b'},
        })
        with app.app_context():
            db.session.add_all([ScheduledMessage(
                sender_id=self.user_id, chat_id=self.chat_id,
                client_message_id=f'quota-{index}', encrypted_content=envelope,
                scheduled_for=utc_now() + timedelta(days=1),
            ) for index in range(50)])
            db.session.commit()
        response = self.client.post(
            f'/api/chats/{self.chat_id}/scheduled-messages',
            json={
                'content': envelope,
                'scheduledFor': (utc_now() + timedelta(hours=1)).isoformat() + 'Z',
                'clientMessageId': 'quota-overflow',
            },
            headers=self.auth_headers(),
        )
        self.assertEqual(response.status_code, 409)

    def test_scheduled_message_creation_is_token_rate_limited_across_chat_ids(self):
        envelope = json.dumps({
            'encrypted': True, 'iv': 'iv', 'data': 'ciphertext',
            'recipients': {str(self.user_id): 'a', str(self.payee_id): 'b'},
        })
        payload = {
            'content': envelope,
            'scheduledFor': (utc_now() + timedelta(hours=1)).isoformat() + 'Z',
            'clientMessageId': 'limited-1',
        }
        with patch.dict(_sensitive_limits, {'/api/chats/:id/scheduled-messages': (1, 3600)}):
            first = self.client.post(
                f'/api/chats/{self.chat_id}/scheduled-messages', json=payload,
                headers=self.auth_headers(),
            )
            payload['clientMessageId'] = 'limited-2'
            second = self.client.post(
                f'/api/chats/{self.chat_id}/scheduled-messages', json=payload,
                headers=self.auth_headers(),
            )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 429)

    @patch.dict(os.environ, {
        'TURN_URLS': 'turn:turn.example.com:3478,turns:turn.example.com:5349',
        'TURN_SECRET': 'test-turn-secret',
    })
    def test_call_ice_config_uses_short_lived_turn_credentials(self):
        response = self.client.get('/api/calls/ice-config', headers=self.auth_headers())
        self.assertEqual(response.status_code, 200)
        turn = response.json['iceServers'][1]
        expires_at, configured_user_id = turn['username'].split(':')
        self.assertEqual(int(configured_user_id), self.user_id)
        self.assertGreater(int(expires_at), 0)
        expected = __import__('base64').b64encode(hmac.new(
            b'test-turn-secret', turn['username'].encode(), hashlib.sha1
        ).digest()).decode()
        self.assertEqual(turn['credential'], expected)

    @patch.dict(os.environ, {
        'TURN_URLS': 'turn:global.relay.metered.ca:80,turns:global.relay.metered.ca:443?transport=tcp',
        'TURN_USERNAME': 'metered-user',
        'TURN_CREDENTIAL': 'metered-password',
        'TURN_SECRET': '',
    })
    def test_call_ice_config_supports_managed_turn_credentials(self):
        response = self.client.get('/api/calls/ice-config', headers=self.auth_headers())
        self.assertEqual(response.status_code, 200)
        turn = response.json['iceServers'][1]
        self.assertEqual(turn['username'], 'metered-user')
        self.assertEqual(turn['credential'], 'metered-password')
        self.assertEqual(turn['urls'][0], 'turn:global.relay.metered.ca:80')
        self.assertIsNone(response.json['ttlSeconds'])

    def test_health_and_security_headers(self):
        response = self.client.get('/health/live', headers={'X-Request-ID': 'audit-request-id'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['status'], 'ok')
        self.assertEqual(response.headers['X-Request-ID'], 'audit-request-id')
        self.assertEqual(response.headers['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(response.headers['X-Frame-Options'], 'DENY')
        self.assertIn('camera=(self)', response.headers['Permissions-Policy'])
        private = self.client.get('/api/chats', headers=self.auth_headers())
        self.assertIn('no-store', private.headers['Cache-Control'])
        original_client = app_module._redis_client
        app_module._redis_client = None
        try:
            ready = self.client.get('/health/ready')
            self.assertEqual(ready.status_code, 200)
            self.assertEqual(ready.json['database'], 'ok')
        finally:
            app_module._redis_client = original_client

    def test_ready_health_distinguishes_redis_outage_from_database_outage(self):
        class BrokenRedis:
            def ping(self):
                raise ConnectionError('redis unavailable')
        original_client = app_module._redis_client
        app_module._redis_client = BrokenRedis()
        try:
            response = self.client.get('/health/ready')
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json['database'], 'ok')
            self.assertEqual(response.json['redis'], 'unavailable')
        finally:
            app_module._redis_client = original_client

    def test_redis_outage_uses_local_rate_limit_fallback_in_production(self):
        class BrokenRedis:
            def eval(self, *_args):
                raise ConnectionError('redis unavailable')
        original_client = app_module._redis_client
        original_production = app.config.get('IS_PRODUCTION')
        app_module._redis_client = BrokenRedis()
        app.config['IS_PRODUCTION'] = True
        try:
            response = self.client.post('/api/login', json={
                'email': 'audit@example.com', 'password': 'old-password',
            })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['user']['username'], 'audit-user')
        finally:
            app_module._redis_client = original_client
            app.config['IS_PRODUCTION'] = original_production

    def test_login_cors_preflight_does_not_depend_on_redis(self):
        class BrokenRedis:
            def eval(self, *_args):
                raise ConnectionError('redis unavailable')
        original_client = app_module._redis_client
        original_production = app.config.get('IS_PRODUCTION')
        app_module._redis_client = BrokenRedis()
        app.config['IS_PRODUCTION'] = True
        try:
            response = self.client.options('/api/login', headers={
                'Origin': 'https://chat.indiasearch.site',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'content-type',
            })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                response.headers.get('Access-Control-Allow-Origin'),
                'https://chat.indiasearch.site',
            )
            self.assertIn('POST', response.headers.get('Access-Control-Allow-Methods', ''))
        finally:
            app_module._redis_client = original_client
            app.config['IS_PRODUCTION'] = original_production

    @patch('routes.payments_bp.create_provider_order', side_effect=RuntimeError('secret-provider-detail'))
    def test_production_server_errors_do_not_leak_internal_details(self, _create_order):
        original_production = app.config.get('IS_PRODUCTION')
        app.config['IS_PRODUCTION'] = True
        try:
            with patch.dict(os.environ, {
                'RAZORPAY_KEY_ID': 'rzp_test', 'RAZORPAY_KEY_SECRET': 'secret',
                'RAZORPAY_WEBHOOK_SECRET': 'webhook-secret',
            }):
                response = self.client.post('/api/payments/orders', json={
                    'chatId': self.chat_id, 'payeeId': self.payee_id, 'amount': 10,
                    'clientRequestId': 'request-provider-error-001',
                }, headers=self.auth_headers())
            self.assertEqual(response.status_code, 503)
            self.assertNotIn('secret-provider-detail', response.get_data(as_text=True))
            self.assertIn('requestId', response.json)
        finally:
            app.config['IS_PRODUCTION'] = original_production

    def test_revoked_session_invalidates_http_token(self):
        with app.app_context():
            db.session.get(ActiveSession, self.session_id) and db.session.delete(db.session.get(ActiveSession, self.session_id))
            db.session.commit()
        self.assertEqual(self.client.get('/api/business/me', headers=self.auth_headers()).status_code, 401)

    def test_session_validation_and_logout_revoke_current_device(self):
        current = self.client.get('/api/auth/me', headers=self.auth_headers())
        self.assertEqual(current.status_code, 200)
        self.assertEqual(current.json['user']['id'], self.user_id)
        self.assertEqual(current.json['session']['id'], self.session_id)

        with app.app_context():
            db.session.add(PushSubscription(
                user_id=self.user_id, session_id=self.session_id,
                endpoint='https://push.example/current-session',
                subscription_json='{"endpoint":"https://push.example/current-session","keys":{"p256dh":"key","auth":"auth"}}',
            ))
            db.session.commit()

        logged_out = self.client.post('/api/auth/logout', headers=self.auth_headers())
        self.assertEqual(logged_out.status_code, 200)
        self.assertTrue(logged_out.json['ok'])
        self.assertEqual(self.client.get('/api/auth/me', headers=self.auth_headers()).status_code, 401)
        with app.app_context():
            self.assertIsNone(db.session.get(ActiveSession, self.session_id))
            self.assertEqual(PushSubscription.query.filter_by(session_id=self.session_id).count(), 0)

    def test_revoked_session_cannot_open_socket(self):
        with app.app_context():
            session = db.session.get(ActiveSession, self.session_id)
            db.session.delete(session)
            db.session.commit()
        client = socketio.test_client(app, auth={'token': self.token})
        self.assertFalse(client.is_connected())

    def test_socket_message_and_call_signaling_stay_inside_chat(self):
        payer = socketio.test_client(app, auth={'token': self.token})
        merchant = socketio.test_client(app, auth={'token': self.payee_token})
        self.assertTrue(payer.is_connected())
        self.assertTrue(merchant.is_connected())
        payer.emit('join_room', {'room': str(self.chat_id)})
        merchant.emit('join_room', {'room': str(self.chat_id)})
        payer.emit('send_message', {
            'chatId': self.chat_id, 'content': self.encrypted_envelope(),
            'clientMessageId': 'socket-scope-1', 'type': 'text',
        })
        merchant_events = merchant.get_received()
        received = [event for event in merchant_events if event['name'] == 'receive_message']
        self.assertEqual(len(received), 1)
        self.assertEqual(received[0]['args'][0]['chatId'], self.chat_id)

        payer.emit('join_call', {'chatId': self.chat_id})
        merchant.emit('join_call', {'chatId': self.chat_id})
        joined = [event for event in payer.get_received() if event['name'] == 'user_joined_call']
        self.assertEqual(len(joined), 1)
        merchant_sid = joined[0]['args'][0]['socketId']
        payer.emit('offer', {'chatId': self.chat_id, 'to': merchant_sid, 'offer': {'type': 'offer', 'sdp': 'test'}})
        offers = [event for event in merchant.get_received() if event['name'] == 'offer']
        self.assertEqual(len(offers), 1)
        payer.emit('offer', {
            'chatId': self.chat_id, 'to': merchant_sid,
            'offer': {'type': 'offer', 'sdp': 'x' * 100001},
        })
        self.assertEqual([event for event in merchant.get_received() if event['name'] == 'offer'], [])
        self.assertTrue(any(event['name'] == 'call_error' for event in payer.get_received()))
        payer.emit('ice_candidate', {
            'chatId': self.chat_id, 'to': merchant_sid,
            'candidate': {'candidate': 'x' * 4097, 'sdpMid': '0', 'sdpMLineIndex': 0},
        })
        self.assertEqual([event for event in merchant.get_received() if event['name'] == 'ice_candidate'], [])
        self.assertTrue(any(event['name'] == 'call_error' for event in payer.get_received()))
        payer.emit('offer', {'chatId': self.chat_id, 'to': 'not-a-call-member', 'offer': {}})
        errors = [event for event in payer.get_received() if event['name'] == 'call_error']
        self.assertTrue(errors)
        payer.disconnect()
        merchant.disconnect()

    def test_socket_message_ack_is_idempotent_for_offline_retry(self):
        payer = socketio.test_client(app, auth={'token': self.token})
        payload = {
            'chatId': self.chat_id, 'clientMessageId': 'offline-message-123',
            'content': self.encrypted_envelope('audit'), 'type': 'text',
        }
        first = payer.emit('send_message', payload, callback=True)
        second = payer.emit('send_message', payload, callback=True)
        self.assertTrue(first['ok'])
        self.assertFalse(first['duplicate'])
        self.assertTrue(second['ok'])
        self.assertTrue(second['duplicate'])
        self.assertEqual(first['messageId'], second['messageId'])
        with app.app_context():
            self.assertEqual(Message.query.filter_by(client_message_id='offline-message-123').count(), 1)
        payer.disconnect()

    def test_socket_accepts_native_drawing_and_custom_second_ttl(self):
        payer = socketio.test_client(app, auth={'token': self.token})
        result = payer.emit('send_message', {
            'chatId': self.chat_id,
            'clientMessageId': 'native-drawing-1',
            'content': self.encrypted_envelope('drawing-vector-payload'),
            'type': 'drawing',
            'ttl': 45,
        }, callback=True)
        self.assertTrue(result['ok'])
        with app.app_context():
            stored = Message.query.filter_by(client_message_id='native-drawing-1').one()
            self.assertEqual(stored.type, 'drawing')
            self.assertEqual(stored.ttl, 45)
        payer.disconnect()

    def test_snap_message_hides_ten_minutes_after_session_end(self):
        payer = socketio.test_client(app, auth={'token': self.token})
        receiver = socketio.test_client(app, auth={'token': self.payee_token})
        receiver.get_received()
        normal = payer.emit('send_message', {
            'chatId': self.chat_id,
            'clientMessageId': 'normal-before-snap-1',
            'content': self.encrypted_envelope('normal-payload'),
            'type': 'text',
        }, callback=True)
        self.assertTrue(normal['ok'])
        enabled = payer.emit('set_snap_mode', {'chatId': self.chat_id, 'enabled': True}, callback=True)
        self.assertTrue(enabled['ok'])
        notices = [event for event in receiver.get_received() if event['name'] == 'snap_mode_update']
        self.assertEqual(len(notices), 1)
        self.assertTrue(notices[0]['args'][0]['enabled'])
        self.assertEqual(notices[0]['args'][0]['initiatedBy'], self.user_id)
        result = payer.emit('send_message', {
            'chatId': self.chat_id,
            'clientMessageId': 'snap-retention-1',
            'content': self.encrypted_envelope('snap-payload'),
            'type': 'image',
        }, callback=True)
        self.assertTrue(result['ok'])
        with app.app_context():
            stored = Message.query.filter_by(client_message_id='snap-retention-1').one()
            self.assertTrue(stored.snap_mode)
            self.assertEqual(stored.ttl, 7 * 24 * 60 * 60)
            stored.timestamp = utc_now() - timedelta(minutes=11)
            db.session.commit()
        still_visible = self.client.get(f'/api/chats/{self.chat_id}/messages', headers=self.auth_headers())
        self.assertEqual(still_visible.status_code, 200)
        self.assertIn(result['messageId'], [item['id'] for item in still_visible.get_json()])
        self.assertNotIn(normal['messageId'], [item['id'] for item in still_visible.get_json()])
        ended = payer.emit('set_snap_mode', {'chatId': self.chat_id, 'enabled': False}, callback=True)
        self.assertTrue(ended['ok'])
        self.assertIsNotNone(ended['snapExpiresAt'])
        with app.app_context():
            stored = Message.query.filter_by(client_message_id='snap-retention-1').one()
            stored.snap_expires_at = utc_now() - timedelta(seconds=1)
            db.session.commit()
        hidden = self.client.get(f'/api/chats/{self.chat_id}/messages', headers=self.auth_headers())
        self.assertNotIn(result['messageId'], [item['id'] for item in hidden.get_json()])
        with app.app_context():
            self.assertEqual(Message.query.filter_by(client_message_id='snap-retention-1').count(), 1)
        receiver.disconnect()
        payer.disconnect()

    def test_socket_rejects_plaintext_partial_envelopes_and_untrusted_metadata(self):
        payer = socketio.test_client(app, auth={'token': self.token})
        plaintext = payer.emit('send_message', {
            'chatId': self.chat_id, 'clientMessageId': 'plaintext-1',
            'content': 'private plaintext', 'type': 'text',
        }, callback=True)
        partial = payer.emit('send_message', {
            'chatId': self.chat_id, 'clientMessageId': 'partial-1',
            'content': json.dumps({
                'encrypted': True, 'iv': 'iv', 'data': 'cipher',
                'recipients': {str(self.user_id): 'wrapped'},
            }), 'type': 'text',
        }, callback=True)
        unsupported = payer.emit('send_message', {
            'chatId': self.chat_id, 'clientMessageId': 'unsupported-1',
            'content': self.encrypted_envelope(), 'type': 'server_admin',
        }, callback=True)
        valid = payer.emit('send_message', {
            'chatId': self.chat_id, 'clientMessageId': 'metadata-1',
            'content': self.encrypted_envelope('metadata'), 'type': 'text',
            'replyContent': 'plaintext reply leak', 'replySenderName': 'private name',
        }, callback=True)
        self.assertFalse(plaintext['ok'])
        self.assertFalse(partial['ok'])
        self.assertFalse(unsupported['ok'])
        self.assertTrue(valid['ok'])
        with app.app_context():
            stored = Message.query.filter_by(client_message_id='metadata-1').one()
            self.assertIsNone(stored.reply_content)
            self.assertIsNone(stored.reply_sender_name)
            self.assertEqual(Message.query.filter_by(client_message_id='plaintext-1').count(), 0)
        payer.disconnect()

    def test_socket_message_rate_limit_fails_before_new_storage(self):
        with app.app_context():
            db.session.add_all([Message(
                chat_id=self.chat_id, sender_id=self.user_id,
                client_message_id=f'rate-existing-{index}', content=self.encrypted_envelope(str(index)),
                type='text', timestamp=utc_now(),
            ) for index in range(120)])
            db.session.commit()
        payer = socketio.test_client(app, auth={'token': self.token})
        denied = payer.emit('send_message', {
            'chatId': self.chat_id, 'clientMessageId': 'rate-denied',
            'content': self.encrypted_envelope('denied'), 'type': 'text',
        }, callback=True)
        self.assertFalse(denied['ok'])
        self.assertTrue(denied['retryable'])
        with app.app_context():
            self.assertEqual(Message.query.filter_by(client_message_id='rate-denied').count(), 0)
        payer.disconnect()

    def test_message_edit_requires_complete_encrypted_envelope(self):
        with app.app_context():
            message = Message(
                chat_id=self.chat_id, sender_id=self.user_id,
                client_message_id='editable-1', content=self.encrypted_envelope('before'), type='text',
            )
            db.session.add(message)
            db.session.commit()
            message_id = message.id
        plaintext = self.client.put(
            f'/api/messages/{message_id}', json={'content': 'edited plaintext'},
            headers=self.auth_headers(),
        )
        partial = self.client.put(
            f'/api/messages/{message_id}', json={'content': json.dumps({
                'encrypted': True, 'iv': 'iv', 'data': 'edited',
                'recipients': {str(self.user_id): 'wrapped'},
            })}, headers=self.auth_headers(),
        )
        encrypted = self.encrypted_envelope('after')
        valid = self.client.put(
            f'/api/messages/{message_id}', json={'content': encrypted}, headers=self.auth_headers(),
        )
        self.assertEqual(plaintext.status_code, 400)
        self.assertEqual(partial.status_code, 400)
        self.assertEqual(valid.status_code, 200)
        with app.app_context():
            self.assertEqual(db.session.get(Message, message_id).content, encrypted)

    def test_encrypted_attachment_claim_is_owner_bound_and_idempotent(self):
        with app.app_context():
            owned = UploadAsset(
                owner_id=self.user_id, media_url='https://media.example/owned.png',
                media_kind='image', resource_type='image', expires_at=utc_now() + timedelta(days=1),
            )
            foreign = UploadAsset(
                owner_id=self.payee_id, media_url='https://media.example/foreign.png',
                media_kind='image', resource_type='image', expires_at=utc_now() + timedelta(days=1),
            )
            db.session.add_all([owned, foreign])
            db.session.commit()
            owned_id, foreign_id = owned.id, foreign.id

        payer = socketio.test_client(app, auth={'token': self.token})
        payload = {
            'chatId': self.chat_id, 'clientMessageId': 'attachment-message-1',
            'content': self.encrypted_envelope('encrypted-url'), 'type': 'image', 'assetId': owned_id,
        }
        first = payer.emit('send_message', payload, callback=True)
        repeated = payer.emit('send_message', payload, callback=True)
        denied = payer.emit('send_message', {
            **payload, 'clientMessageId': 'attachment-message-2', 'assetId': foreign_id,
        }, callback=True)
        self.assertTrue(first['ok'])
        self.assertTrue(repeated['duplicate'])
        self.assertFalse(denied['ok'])
        self.assertFalse(denied['retryable'])
        with app.app_context():
            claimed = db.session.get(UploadAsset, owned_id)
            self.assertEqual(claimed.status, 'claimed')
            self.assertEqual(claimed.claim_type, 'message')
            self.assertEqual(claimed.claim_id, str(first['messageId']))
            self.assertEqual(Message.query.filter_by(client_message_id='attachment-message-2').count(), 0)
        payer.disconnect()

    def test_call_invites_and_transitions_require_chat_membership(self):
        with app.app_context():
            private_chat = Chat(is_group=True, group_admin_id=self.user_id)
            inaccessible_chat = Chat(is_group=True, group_admin_id=self.payee_id)
            db.session.add_all([private_chat, inaccessible_chat])
            db.session.flush()
            db.session.add_all([
                ChatParticipant(chat_id=private_chat.id, user_id=self.user_id),
                ChatParticipant(chat_id=inaccessible_chat.id, user_id=self.payee_id),
            ])
            db.session.commit()
            private_chat_id = private_chat.id
            inaccessible_chat_id = inaccessible_chat.id

        payer = socketio.test_client(app, auth={'token': self.token})
        merchant = socketio.test_client(app, auth={'token': self.payee_token})
        payer.emit('invite_to_call', {
            'chatId': private_chat_id, 'userId': self.payee_id, 'callType': 'video',
        })
        self.assertFalse(any(event['name'] == 'incoming_call' for event in merchant.get_received()))
        self.assertTrue(any(event['name'] == 'call_error' for event in payer.get_received()))

        payer.emit('join_call', {'chatId': self.chat_id})
        payer.get_received()
        payer.emit('transition_call', {
            'chatId': self.chat_id, 'newChatId': inaccessible_chat_id,
        })
        self.assertTrue(any(event['name'] == 'call_error' for event in payer.get_received()))
        payer.disconnect()
        merchant.disconnect()

    def test_repeated_call_ring_is_rate_limited_without_duplicate_notifications(self):
        payer = socketio.test_client(app, auth={'token': self.token})
        merchant = socketio.test_client(app, auth={'token': self.payee_token})
        payload = {'chatId': self.chat_id, 'callType': 'voice'}
        payer.emit('notify_ring', payload)
        first_incoming = [event for event in merchant.get_received() if event['name'] == 'incoming_call']
        self.assertEqual(len(first_incoming), 1)
        payer.get_received()
        merchant.emit('confirm_ring', {'chatId': self.chat_id, 'callerId': self.user_id})
        ringing = [event for event in payer.get_received() if event['name'] == 'peer_ringing']
        self.assertEqual(len(ringing), 1)
        merchant.emit('confirm_ring', {'chatId': self.chat_id, 'callerId': 999999})
        self.assertEqual([event for event in payer.get_received() if event['name'] == 'peer_ringing'], [])

        payer.emit('notify_ring', payload)
        second_incoming = [event for event in merchant.get_received() if event['name'] == 'incoming_call']
        duplicate_status = [event for event in payer.get_received() if event['name'] == 'ring_status']
        self.assertEqual(second_incoming, [])
        self.assertTrue(any(event['args'][0].get('duplicate') is True for event in duplicate_status))
        with app.app_context():
            self.assertEqual(Message.query.filter_by(chat_id=self.chat_id).count(), 0)
            record = CallRecord.query.filter_by(chat_id=self.chat_id, caller_id=self.user_id).one()
            self.assertEqual(record.call_type, 'voice')
            self.assertEqual(record.status, 'ringing')
        history = self.client.get('/api/calls/history', headers=self.auth_headers())
        self.assertEqual(history.status_code, 200)
        self.assertEqual(history.json['items'][0]['callType'], 'voice')
        payer.disconnect()
        merchant.disconnect()

    def test_call_record_tracks_answer_and_caller_end_without_chat_plaintext(self):
        payer = socketio.test_client(app, auth={'token': self.token})
        merchant = socketio.test_client(app, auth={'token': self.payee_token})
        payer.emit('notify_ring', {'chatId': self.chat_id, 'callType': 'video'})
        merchant.get_received()
        payer.emit('join_call', {'chatId': self.chat_id})
        merchant.emit('join_call', {'chatId': self.chat_id})
        with app.app_context():
            record = CallRecord.query.one()
            self.assertEqual(record.status, 'active')
            self.assertIsNotNone(record.answered_at)
            self.assertEqual(Message.query.count(), 0)
        payer.emit('leave_call', {'chatId': self.chat_id})
        with app.app_context():
            record = CallRecord.query.one()
            self.assertEqual(record.status, 'ended')
            self.assertIsNotNone(record.ended_at)
        payer.disconnect()
        merchant.disconnect()

    def test_call_record_worker_finalizes_and_purges_lifecycle_metadata(self):
        now = utc_now()
        with app.app_context():
            db.session.add_all([
                CallRecord(
                    chat_id=self.chat_id, caller_id=self.user_id, call_type='voice',
                    status='ringing', started_at=now - timedelta(minutes=3),
                ),
                CallRecord(
                    chat_id=self.chat_id, caller_id=self.payee_id, call_type='video',
                    status='active', started_at=now - timedelta(hours=25), answered_at=now - timedelta(hours=25),
                ),
                CallRecord(
                    chat_id=self.chat_id, caller_id=self.user_id, call_type='voice',
                    status='ended', started_at=now - timedelta(days=100), ended_at=now - timedelta(days=91),
                ),
                CallRecord(
                    chat_id=self.chat_id, caller_id=self.payee_id, call_type='voice',
                    status='ended', started_at=now - timedelta(days=100), ended_at=now - timedelta(days=1),
                ),
            ])
            db.session.commit()
            with patch.dict(os.environ, {'CALL_RECORD_RETENTION_DAYS': '90'}):
                result = maintain_call_records()
            self.assertEqual(result, {'missedFinalized': 1, 'abandonedFinalized': 1, 'recordsPurged': 1})
            statuses = [row.status for row in CallRecord.query.order_by(CallRecord.id.asc()).all()]
            self.assertEqual(statuses, ['missed', 'ended', 'ended'])

    def test_call_record_worker_rejects_unsafe_retention_configuration(self):
        with app.app_context(), patch.dict(os.environ, {'CALL_RECORD_RETENTION_DAYS': '7'}):
            with self.assertRaisesRegex(RuntimeError, 'between 30 and 730'):
                maintain_call_records()

    def test_password_change_requires_rewrapped_chat_key(self):
        response = self.client.post('/api/account/change-password', json={
            'currentPassword': 'old-password', 'newPassword': 'new-password'
        }, headers=self.auth_headers())
        self.assertEqual(response.status_code, 409)

    def test_password_change_rewraps_key_and_revokes_other_sessions(self):
        with app.app_context():
            db.session.add(ActiveSession(user_id=self.user_id, token_hash='other-session'))
            db.session.commit()
        response = self.client.post('/api/account/change-password', json={
            'currentPassword': 'old-password', 'newPassword': 'new-password',
            'encryptedPrivateKey': 'y' * 100,
        }, headers=self.auth_headers())
        self.assertEqual(response.status_code, 200)
        with app.app_context():
            user = db.session.get(User, self.user_id)
            self.assertTrue(check_password_hash(user.password_hash, 'new-password'))
            self.assertEqual(user.encrypted_private_key, 'y' * 100)
            self.assertEqual(ActiveSession.query.filter_by(user_id=self.user_id).count(), 1)

    def test_login_rate_limit_returns_429(self):
        for _ in range(20):
            self.client.post('/api/login', json={'email': 'nobody@example.com', 'password': 'wrong'})
        response = self.client.post('/api/login', json={'email': 'nobody@example.com', 'password': 'wrong'})
        self.assertEqual(response.status_code, 429)
        self.assertIn('Retry-After', response.headers)

    def test_authenticated_ai_usage_is_rate_limited_per_token(self):
        with patch.dict(_sensitive_limits, {'/api/ai/chat': (2, 3600)}):
            self.client.post('/api/ai/chat', json={'message': ''}, headers=self.auth_headers())
            self.client.post('/api/ai/chat', json={'message': ''}, headers=self.auth_headers())
            limited = self.client.post('/api/ai/chat', json={'message': ''}, headers=self.auth_headers())
        self.assertEqual(limited.status_code, 429)
        self.assertIn('Retry-After', limited.headers)

    @patch('routes.payments_bp.create_provider_order')
    def test_payment_order_is_server_created_for_business_chat(self, create_order):
        create_order.return_value = {
            'id': 'order_verified_test', 'status': 'created', 'amount': 12550, 'currency': 'INR',
        }
        with patch.dict(os.environ, {
            'RAZORPAY_KEY_ID': 'rzp_test_key', 'RAZORPAY_KEY_SECRET': 'test-secret',
            'RAZORPAY_WEBHOOK_SECRET': 'webhook-secret',
        }):
            response = self.client.post('/api/payments/orders', json={
                'chatId': self.chat_id, 'payeeId': self.payee_id,
                'amount': 125.50, 'description': 'Test order',
                'clientRequestId': 'request-create-order-001',
            }, headers=self.auth_headers())
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json['payment']['amount'], 125.5)
        self.assertFalse(response.json['payment']['verified'])

    def test_payment_checkout_requires_complete_provider_and_webhook_configuration(self):
        with patch.dict(os.environ, {
            'RAZORPAY_KEY_ID': 'rzp_live_key', 'RAZORPAY_KEY_SECRET': 'live-secret',
        }, clear=False):
            os.environ.pop('RAZORPAY_WEBHOOK_SECRET', None)
            config = self.client.get('/api/payments/config', headers=self.auth_headers())
            order = self.client.post('/api/payments/orders', json={
                'chatId': self.chat_id, 'payeeId': self.payee_id, 'amount': 10,
            }, headers=self.auth_headers())
        self.assertEqual(config.status_code, 200)
        self.assertFalse(config.json['enabled'])
        self.assertIsNone(config.json['keyId'])
        self.assertEqual(order.status_code, 503)

    @patch('routes.payments_bp.create_provider_order')
    def test_payment_amount_requires_exact_paise_without_float_rounding(self, create_order):
        with patch.dict(os.environ, {'RAZORPAY_WEBHOOK_SECRET': 'webhook-secret'}):
            response = self.client.post('/api/payments/orders', json={
                'chatId': self.chat_id, 'payeeId': self.payee_id, 'amount': '10.001',
                'clientRequestId': 'request-exact-amount-001',
            }, headers=self.auth_headers())
        self.assertEqual(response.status_code, 400)
        self.assertIn('decimal places', response.json['error'])
        create_order.assert_not_called()

    @patch('routes.payments_bp.create_provider_order')
    def test_payment_order_retry_returns_same_provider_order(self, create_order):
        create_order.return_value = {
            'id': 'order_idempotent_test', 'status': 'created', 'amount': 4200, 'currency': 'INR',
        }
        payload = {
            'chatId': self.chat_id, 'payeeId': self.payee_id, 'amount': '42.00',
            'description': 'One checkout', 'clientRequestId': 'request-idempotency-001',
        }
        with patch.dict(os.environ, {
            'RAZORPAY_KEY_ID': 'rzp_test_key', 'RAZORPAY_KEY_SECRET': 'test-secret',
            'RAZORPAY_WEBHOOK_SECRET': 'webhook-secret',
        }):
            first = self.client.post('/api/payments/orders', json=payload, headers=self.auth_headers())
            retry = self.client.post('/api/payments/orders', json=payload, headers=self.auth_headers())
        self.assertEqual(first.status_code, 201)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(first.json['payment']['id'], retry.json['payment']['id'])
        self.assertEqual(retry.json['payment']['providerOrderId'], 'order_idempotent_test')
        create_order.assert_called_once()

    @patch('routes.payments_bp.fetch_provider_payment')
    def test_payment_signature_changes_status_only_after_provider_reconciliation(self, fetch_payment):
        secret = 'provider-secret'
        with app.app_context():
            payment = PaymentOrder(
                payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                amount_paise=5000, provider_order_id='order_signature_test', status='created',
            )
            db.session.add(payment)
            db.session.commit()
            payment_id = payment.id
        provider_payment_id = 'pay_signature_test'
        fetch_payment.return_value = {
            'id': provider_payment_id, 'order_id': 'order_signature_test',
            'amount': 5000, 'currency': 'INR', 'status': 'captured',
        }
        signature = hmac.new(
            secret.encode(), f'order_signature_test|{provider_payment_id}'.encode(), hashlib.sha256
        ).hexdigest()
        with patch.dict(os.environ, {'RAZORPAY_KEY_SECRET': secret}):
            response = self.client.post(f'/api/payments/orders/{payment_id}/verify', json={
                'razorpay_order_id': 'order_signature_test',
                'razorpay_payment_id': provider_payment_id,
                'razorpay_signature': signature,
            }, headers=self.auth_headers())
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['verified'])

    @patch('routes.payments_bp.fetch_provider_payment')
    def test_payment_verification_rejects_provider_amount_or_order_mismatch(self, fetch_payment):
        secret = 'provider-secret'
        with app.app_context():
            payment = PaymentOrder(
                payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                amount_paise=5000, provider_order_id='order_tamper_test', status='created',
            )
            db.session.add(payment)
            db.session.commit()
            payment_id = payment.id
        provider_payment_id = 'pay_tamper_test'
        fetch_payment.return_value = {
            'id': provider_payment_id, 'order_id': 'different_order',
            'amount': 1, 'currency': 'INR', 'status': 'captured',
        }
        signature = hmac.new(
            secret.encode(), f'order_tamper_test|{provider_payment_id}'.encode(), hashlib.sha256
        ).hexdigest()
        with patch.dict(os.environ, {'RAZORPAY_KEY_SECRET': secret}):
            response = self.client.post(f'/api/payments/orders/{payment_id}/verify', json={
                'razorpay_order_id': 'order_tamper_test',
                'razorpay_payment_id': provider_payment_id,
                'razorpay_signature': signature,
            }, headers=self.auth_headers())
        self.assertEqual(response.status_code, 409)
        with app.app_context():
            stored = db.session.get(PaymentOrder, payment_id)
            self.assertEqual(stored.status, 'created')
            self.assertIsNone(stored.provider_payment_id)

    @patch('routes.payments_bp.create_provider_refund')
    def test_refund_requires_payer_request_and_business_approval(self, create_refund):
        create_refund.return_value = {
            'id': 'rfnd_provider_test', 'payment_id': 'pay_refund_test',
            'amount': 7500, 'status': 'processed',
        }
        with app.app_context():
            payment = PaymentOrder(
                payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                amount_paise=7500, provider_order_id='order_refund_test',
                provider_payment_id='pay_refund_test', status='captured',
            )
            db.session.add(payment)
            db.session.commit()
            payment_id = payment.id
        requested = self.client.post(
            f'/api/payments/orders/{payment_id}/refund-request', headers=self.auth_headers()
        )
        self.assertEqual(requested.status_code, 202)
        self.assertEqual(requested.json['status'], 'refund_requested')
        payer_cannot_approve = self.client.post(
            f'/api/payments/orders/{payment_id}/refund', headers=self.auth_headers()
        )
        self.assertEqual(payer_cannot_approve.status_code, 404)
        refunded = self.client.post(
            f'/api/payments/orders/{payment_id}/refund',
            headers={'Authorization': f'Bearer {self.payee_token}'},
        )
        self.assertEqual(refunded.status_code, 200)
        self.assertEqual(refunded.json['status'], 'refunded')
        self.assertEqual(refunded.json['providerRefundId'], 'rfnd_provider_test')
        repeated = self.client.post(
            f'/api/payments/orders/{payment_id}/refund',
            headers={'Authorization': f'Bearer {self.payee_token}'},
        )
        self.assertEqual(repeated.status_code, 200)
        create_refund.assert_called_once()

    @patch('routes.payments_bp.create_provider_refund')
    def test_refund_timeout_stays_inflight_and_cannot_submit_twice(self, create_refund):
        create_refund.side_effect = RuntimeError('Payment provider is temporarily unavailable')
        with app.app_context():
            payment = PaymentOrder(
                payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                amount_paise=5100, provider_order_id='order_refund_timeout',
                provider_payment_id='pay_refund_timeout', status='refund_requested',
            )
            db.session.add(payment)
            db.session.commit()
            payment_id = payment.id
        headers = {'Authorization': f'Bearer {self.payee_token}'}
        first = self.client.post(f'/api/payments/orders/{payment_id}/refund', headers=headers)
        retry = self.client.post(f'/api/payments/orders/{payment_id}/refund', headers=headers)
        self.assertEqual(first.status_code, 503)
        self.assertIn('reconciliation is pending', first.json['error'])
        self.assertEqual(retry.status_code, 202)
        self.assertEqual(retry.json['status'], 'refunding')
        create_refund.assert_called_once()

    def test_authenticated_users_cannot_mutate_each_others_content(self):
        with app.app_context():
            product = CatalogProduct(owner_id=self.user_id, name='Private product', price=10)
            reel = Reel(user_id=self.user_id, video_url='https://media.example/private.mp4')
            post = SocialPost(user_id=self.user_id, caption='Private post')
            status = Status(
                user_id=self.user_id, media_url='https://media.example/private.jpg',
                media_type='image', expires_at=utc_now(),
            )
            message = Message(chat_id=self.chat_id, sender_id=self.user_id, content='encrypted-content')
            db.session.add_all([product, reel, post, status, message])
            db.session.commit()
            ids = product.id, reel.id, post.id, status.id, message.id
        merchant_headers = {'Authorization': f'Bearer {self.payee_token}'}
        product_id, reel_id, post_id, status_id, message_id = ids
        self.assertEqual(self.client.delete(f'/api/business/products/{product_id}', headers=merchant_headers).status_code, 404)
        self.assertEqual(self.client.delete(f'/api/reels/{reel_id}', headers=merchant_headers).status_code, 403)
        self.assertEqual(self.client.put(f'/api/reels/{reel_id}', json={'caption': 'hijacked'}, headers=merchant_headers).status_code, 403)
        self.assertEqual(self.client.delete(f'/api/social/posts/{post_id}', headers=merchant_headers).status_code, 403)
        self.assertEqual(self.client.delete(f'/api/status/{status_id}', headers=merchant_headers).status_code, 404)
        self.assertEqual(self.client.put(f'/api/messages/{message_id}', json={'content': 'hijacked'}, headers=merchant_headers).status_code, 403)
        self.assertEqual(self.client.delete(f'/api/messages/{message_id}?option=everyone', headers=merchant_headers).status_code, 403)

    def test_only_group_admin_can_add_members(self):
        with app.app_context():
            third = User(
                username='third-user', email='third@example.com', phone='7777777777',
                password_hash=generate_password_hash('third-password'), email_verified=True,
            )
            group = Chat(is_group=True, name='Private group', group_admin_id=self.user_id)
            db.session.add_all([third, group])
            db.session.flush()
            db.session.add_all([
                ChatParticipant(chat_id=group.id, user_id=self.user_id),
                ChatParticipant(chat_id=group.id, user_id=self.payee_id),
            ])
            db.session.commit()
            group_id, third_id = group.id, third.id
        denied = self.client.post(
            f'/api/chats/{group_id}/participants', json={'userId': third_id},
            headers={'Authorization': f'Bearer {self.payee_token}'},
        )
        self.assertEqual(denied.status_code, 403)
        allowed = self.client.post(
            f'/api/chats/{group_id}/participants', json={'userId': third_id},
            headers=self.auth_headers(),
        )
        self.assertEqual(allowed.status_code, 200)

    def test_webhook_rejects_invalid_signature(self):
        body = json.dumps({'event': 'payment.captured'}).encode()
        with patch.dict(os.environ, {'RAZORPAY_WEBHOOK_SECRET': 'webhook-secret'}):
            response = self.client.post('/api/payments/webhooks/razorpay', data=body, headers={
                'Content-Type': 'application/json', 'X-Razorpay-Signature': 'invalid',
            })
        self.assertEqual(response.status_code, 400)

    def test_signed_webhooks_reconcile_captured_and_failed_payments(self):
        secret = 'webhook-secret'
        with app.app_context():
            captured = PaymentOrder(
                payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                amount_paise=2500, provider_order_id='order_webhook_captured', status='created',
            )
            failed = PaymentOrder(
                payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                amount_paise=3500, provider_order_id='order_webhook_failed', status='created',
            )
            db.session.add_all([captured, failed])
            db.session.commit()
            captured_id, failed_id = captured.id, failed.id

        def signed_post(event):
            body = json.dumps(event, separators=(',', ':')).encode()
            signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
            with patch.dict(os.environ, {'RAZORPAY_WEBHOOK_SECRET': secret}):
                return self.client.post('/api/payments/webhooks/razorpay', data=body, headers={
                    'Content-Type': 'application/json', 'X-Razorpay-Signature': signature,
                })

        captured_response = signed_post({
            'event': 'payment.captured', 'payload': {'payment': {'entity': {
                'id': 'pay_webhook_captured', 'order_id': 'order_webhook_captured',
                'amount': 2500, 'currency': 'INR', 'status': 'captured',
            }}},
        })
        failed_response = signed_post({
            'event': 'payment.failed', 'payload': {'payment': {'entity': {
                'id': 'pay_webhook_failed', 'order_id': 'order_webhook_failed',
                'amount': 3500, 'currency': 'INR', 'status': 'failed',
            }}},
        })
        self.assertEqual(captured_response.status_code, 200)
        self.assertEqual(failed_response.status_code, 200)
        with app.app_context():
            self.assertEqual(db.session.get(PaymentOrder, captured_id).status, 'captured')
            self.assertEqual(db.session.get(PaymentOrder, failed_id).status, 'failed')

    def test_webhook_replay_cannot_regress_terminal_or_claimed_payment_state(self):
        secret = 'webhook-secret'
        with app.app_context():
            refunded = PaymentOrder(
                payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                amount_paise=2500, provider_order_id='order_already_refunded',
                provider_payment_id='pay_already_refunded', provider_refund_id='rfnd_final',
                status='refunded', refunded_at=utc_now(),
            )
            claimed = PaymentOrder(
                payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                amount_paise=3000, provider_order_id='order_claimed_source',
                provider_payment_id='pay_claimed_once', status='captured', paid_at=utc_now(),
            )
            target = PaymentOrder(
                payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                amount_paise=3000, provider_order_id='order_collision_target', status='created',
            )
            missing_entity = PaymentOrder(
                payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                amount_paise=4000, provider_order_id='order_missing_payment', status='created',
            )
            db.session.add_all([refunded, claimed, target, missing_entity])
            db.session.commit()
            ids = refunded.id, target.id, missing_entity.id

        def signed_post(event):
            body = json.dumps(event, separators=(',', ':')).encode()
            signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
            with patch.dict(os.environ, {'RAZORPAY_WEBHOOK_SECRET': secret}):
                return self.client.post('/api/payments/webhooks/razorpay', data=body, headers={
                    'Content-Type': 'application/json', 'X-Razorpay-Signature': signature,
                })

        self.assertEqual(signed_post({
            'event': 'payment.captured', 'payload': {'payment': {'entity': {
                'id': 'pay_already_refunded', 'order_id': 'order_already_refunded',
                'amount': 2500, 'currency': 'INR', 'status': 'captured',
            }}},
        }).status_code, 200)
        self.assertEqual(signed_post({
            'event': 'refund.failed', 'payload': {'refund': {'entity': {
                'id': 'rfnd_final', 'payment_id': 'pay_already_refunded',
                'amount': 2500, 'currency': 'INR', 'status': 'failed',
            }}},
        }).status_code, 200)
        self.assertEqual(signed_post({
            'event': 'payment.captured', 'payload': {'payment': {'entity': {
                'id': 'pay_claimed_once', 'order_id': 'order_collision_target',
                'amount': 3000, 'currency': 'INR', 'status': 'captured',
            }}},
        }).status_code, 200)
        self.assertEqual(signed_post({
            'event': 'order.paid', 'payload': {'order': {'entity': {
                'id': 'order_missing_payment', 'amount_paid': 4000, 'currency': 'INR',
            }}},
        }).status_code, 200)
        with app.app_context():
            self.assertEqual(db.session.get(PaymentOrder, ids[0]).status, 'refunded')
            self.assertEqual(db.session.get(PaymentOrder, ids[0]).provider_refund_id, 'rfnd_final')
            self.assertEqual(db.session.get(PaymentOrder, ids[1]).status, 'created')
            self.assertIsNone(db.session.get(PaymentOrder, ids[1]).provider_payment_id)
            self.assertEqual(db.session.get(PaymentOrder, ids[2]).status, 'created')

    @patch('payment_reconciliation.provider_request')
    def test_payment_reconciliation_resolves_unknown_order_and_refund(self, provider_call):
        old = utc_now() - timedelta(minutes=10)
        with app.app_context():
            unknown = PaymentOrder(
                payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                amount_paise=6200, provider_order_id='pending-local-unknown',
                client_request_id='request-reconcile-order-001', status='creation_unknown',
                updated_at=old,
            )
            refunding = PaymentOrder(
                payer_id=self.user_id, payee_id=self.payee_id, chat_id=self.chat_id,
                amount_paise=7300, provider_order_id='order_reconcile_refund',
                provider_payment_id='pay_reconcile_refund', status='refunding',
                updated_at=old,
            )
            db.session.add_all([unknown, refunding])
            db.session.commit()
            unknown_id, refunding_id = unknown.id, refunding.id

            def provider_response(path, method='GET', payload=None):
                if path.startswith('orders?receipt='):
                    return {'items': [{
                        'id': 'order_reconciled', 'amount': 6200, 'currency': 'INR',
                        'receipt': f'cheetchat-{unknown_id}', 'status': 'paid',
                    }]}
                if path == 'orders/order_reconciled/payments':
                    return {'items': [{
                        'id': 'pay_reconciled', 'order_id': 'order_reconciled',
                        'amount': 6200, 'currency': 'INR', 'status': 'captured',
                    }]}
                if path == 'payments/pay_reconcile_refund/refunds?count=100':
                    return {'items': [{
                        'id': 'rfnd_reconciled', 'payment_id': 'pay_reconcile_refund',
                        'amount': 7300, 'currency': 'INR', 'status': 'processed',
                        'notes': {'payment_order_id': str(refunding_id)},
                    }]}
                raise AssertionError(f'Unexpected provider path: {path}')

            provider_call.side_effect = provider_response
            result = reconcile_payments()
            self.assertEqual(result, {'checked': 2, 'reconciled': 2, 'errors': 0})
            resolved_order = db.session.get(PaymentOrder, unknown_id)
            resolved_refund = db.session.get(PaymentOrder, refunding_id)
            self.assertEqual(resolved_order.status, 'captured')
            self.assertEqual(resolved_order.provider_order_id, 'order_reconciled')
            self.assertEqual(resolved_order.provider_payment_id, 'pay_reconciled')
            self.assertEqual(resolved_refund.status, 'refunded')
            self.assertEqual(resolved_refund.provider_refund_id, 'rfnd_reconciled')

    @patch('routes.auth_bp.get_supabase_user')
    def test_password_reset_requires_recovery_rewrap(self, get_supabase_user):
        get_supabase_user.return_value = {'email': 'audit@example.com'}
        with app.app_context():
            user = db.session.get(User, self.user_id)
            user.encrypted_recovery_key = 'r' * 100
            db.session.commit()
        backup = self.client.post('/api/reset-password/key-backup', json={'accessToken': 'valid-reset-token'})
        self.assertEqual(backup.status_code, 200)
        self.assertTrue(backup.json['recoveryRequired'])
        rejected = self.client.post('/api/reset-password', json={
            'accessToken': 'valid-reset-token', 'newPassword': 'reset-password',
        })
        self.assertEqual(rejected.status_code, 409)
        accepted = self.client.post('/api/reset-password', json={
            'accessToken': 'valid-reset-token', 'newPassword': 'reset-password',
            'encryptedPrivateKey': 'z' * 100,
        })
        self.assertEqual(accepted.status_code, 200)
        with app.app_context():
            self.assertEqual(db.session.get(User, self.user_id).encrypted_private_key, 'z' * 100)

    def test_business_profile_catalog_and_analytics_flow(self):
        profile = self.client.put('/api/business/profile', json={
            'businessName': 'Launch Store', 'category': 'Retail',
            'description': 'Production test store', 'catalogVisible': True,
        }, headers=self.auth_headers())
        self.assertEqual(profile.status_code, 200)
        product = self.client.post('/api/business/products', json={
            'name': 'Test product', 'price': 99.5, 'inStock': True,
        }, headers=self.auth_headers())
        self.assertEqual(product.status_code, 201)
        dashboard = self.client.get('/api/business/me', headers=self.auth_headers())
        self.assertEqual(len(dashboard.json['products']), 1)
        analytics = self.client.get('/api/business/analytics', headers=self.auth_headers())
        self.assertEqual(analytics.status_code, 200)
        self.assertEqual(analytics.json['products'], 1)

    def test_social_post_create_like_and_delete_flow(self):
        created = self.client.post('/api/social/posts', data={'caption': 'Launch test post'}, headers=self.auth_headers())
        self.assertEqual(created.status_code, 201)
        post_id = created.json['id']
        liked = self.client.post(f'/api/social/posts/{post_id}/like', headers=self.auth_headers())
        self.assertEqual(liked.status_code, 200)
        self.assertTrue(liked.json['isLiked'])
        first_share = self.client.post(f'/api/social/posts/{post_id}/share', headers=self.auth_headers())
        repeated_share = self.client.post(f'/api/social/posts/{post_id}/share', headers=self.auth_headers())
        self.assertEqual(first_share.json['shareCount'], 1)
        self.assertEqual(repeated_share.json['shareCount'], 1)
        story = self.client.post(f'/api/social/posts/{post_id}/story', headers=self.auth_headers())
        self.assertEqual(story.status_code, 201)
        with app.app_context():
            shared_status = db.session.get(Status, story.json['id'])
            self.assertEqual(shared_status.caption, 'Launch test post')
            self.assertEqual(shared_status.media_type, 'image')
        feed = self.client.get('/api/social/posts', headers=self.auth_headers())
        self.assertTrue(any(post['id'] == post_id for post in feed.json))
        deleted = self.client.delete(f'/api/social/posts/{post_id}', headers=self.auth_headers())
        self.assertEqual(deleted.status_code, 200)

    def test_social_feeds_are_bounded_and_text_inputs_reject_oversized_content(self):
        with app.app_context():
            db.session.add_all([
                SocialPost(user_id=self.user_id, caption=f'post-{index}')
                for index in range(55)
            ])
            db.session.commit()
        feed = self.client.get('/api/social/posts?limit=500', headers=self.auth_headers())
        self.assertEqual(feed.status_code, 200)
        self.assertEqual(len(feed.json), 50)
        oversized_post = self.client.post(
            '/api/social/posts', data={'caption': 'x' * 1001}, headers=self.auth_headers(),
        )
        self.assertEqual(oversized_post.status_code, 400)
        missing_reel_comment = self.client.post(
            '/api/reels/999999/comments', json={'content': 'orphan'}, headers=self.auth_headers(),
        )
        self.assertEqual(missing_reel_comment.status_code, 404)

    def test_structured_values_are_rejected_at_text_input_boundaries(self):
        created = self.client.post(
            '/api/social/posts', data={'caption': 'Input boundary post'}, headers=self.auth_headers(),
        )
        social_comment = self.client.post(
            f"/api/social/posts/{created.json['id']}/comments",
            json={'content': {'unexpected': 'object'}}, headers=self.auth_headers(),
        )
        ai_message = self.client.post(
            '/api/ai/chat', json={'message': ['unexpected', 'array']}, headers=self.auth_headers(),
        )
        self.assertEqual(social_comment.status_code, 400)
        self.assertEqual(ai_message.status_code, 400)

    @patch('routes.payments_bp.create_provider_order', side_effect=RuntimeError('private-provider-body'))
    def test_payment_provider_failures_are_generic_in_every_environment(self, _create_order):
        with patch.dict(os.environ, {
            'RAZORPAY_KEY_ID': 'rzp_test', 'RAZORPAY_KEY_SECRET': 'secret',
            'RAZORPAY_WEBHOOK_SECRET': 'webhook-secret',
        }):
            response = self.client.post('/api/payments/orders', json={
                'chatId': self.chat_id, 'payeeId': self.payee_id, 'amount': 10,
                'clientRequestId': 'request-generic-provider-error-001',
            }, headers=self.auth_headers())
        self.assertEqual(response.status_code, 503)
        self.assertNotIn('private-provider-body', response.get_data(as_text=True))
        self.assertIn('reconciliation is pending', response.json['error'])

    @patch('routes.status_bp.upload_to_cloudinary')
    def test_oversized_status_caption_is_rejected_before_upload(self, upload):
        response = self.client.post('/api/status', data={
            'media': (io.BytesIO(b'image-bytes'), 'status.jpg'),
            'caption': 'x' * 301,
        }, headers=self.auth_headers(), content_type='multipart/form-data')
        self.assertEqual(response.status_code, 400)
        upload.assert_not_called()

    @patch('routes.status_bp.upload_to_cloudinary', return_value='https://media.example/status.jpg')
    def test_status_upload_view_and_delete_flow(self, _upload):
        created = self.client.post('/api/status', data={
            'media': (io.BytesIO(b'image-bytes'), 'status.jpg'), 'caption': 'Audit status',
        }, headers=self.auth_headers(), content_type='multipart/form-data')
        self.assertEqual(created.status_code, 201)
        status_id = created.json['id']
        feed = self.client.get('/api/status', headers=self.auth_headers())
        self.assertEqual(feed.status_code, 200)
        self.assertTrue(feed.json)
        first_view = self.client.post(f'/api/status/{status_id}/view', headers=self.auth_headers())
        repeated_view = self.client.post(f'/api/status/{status_id}/view', headers=self.auth_headers())
        self.assertEqual(first_view.status_code, 200)
        self.assertEqual(repeated_view.status_code, 200)
        deleted = self.client.delete(f'/api/status/{status_id}', headers=self.auth_headers())
        self.assertEqual(deleted.status_code, 200)

    def test_non_contact_cannot_view_or_react_to_private_status(self):
        with app.app_context():
            status = Status(
                user_id=self.user_id, media_url='https://media.example/private-status.jpg',
                media_type='image', expires_at=utc_now() + timedelta(hours=1),
            )
            db.session.add(status)
            db.session.commit()
            status_id = status.id
        merchant_headers = {'Authorization': f'Bearer {self.payee_token}'}
        self.assertEqual(self.client.post(f'/api/status/{status_id}/view', headers=merchant_headers).status_code, 403)
        self.assertEqual(self.client.post(
            f'/api/status/{status_id}/react', json={'emoji': '🔥'}, headers=merchant_headers,
        ).status_code, 403)

    def test_status_reply_is_e2ee_idempotent_and_reaction_does_not_create_plaintext_chat(self):
        with app.app_context():
            status = Status(
                user_id=self.payee_id, media_url='https://media.example/merchant-status.jpg',
                media_type='image', expires_at=utc_now() + timedelta(hours=1),
            )
            db.session.add_all([status, Contact(owner_id=self.user_id, contact_user_id=self.payee_id)])
            db.session.commit()
            status_id = status.id
        reaction = self.client.post(
            f'/api/status/{status_id}/react', json={'emoji': '🔥'}, headers=self.auth_headers(),
        )
        self.assertEqual(reaction.status_code, 200)
        with app.app_context():
            self.assertEqual(Message.query.count(), 0)

        plaintext = self.client.post(
            f'/api/status/{status_id}/reply',
            json={'message': 'private status reply', 'clientMessageId': 'status-reply-1'},
            headers=self.auth_headers(),
        )
        envelope = self.encrypted_envelope('status-reply')
        valid = self.client.post(
            f'/api/status/{status_id}/reply',
            json={'content': envelope, 'clientMessageId': 'status-reply-1'},
            headers=self.auth_headers(),
        )
        duplicate = self.client.post(
            f'/api/status/{status_id}/reply',
            json={'content': envelope, 'clientMessageId': 'status-reply-1'},
            headers=self.auth_headers(),
        )
        self.assertEqual(plaintext.status_code, 400)
        self.assertEqual(valid.status_code, 201)
        self.assertEqual(duplicate.status_code, 200)
        self.assertTrue(duplicate.json['duplicate'])
        with app.app_context():
            stored = Message.query.filter_by(client_message_id='status-reply-1').one()
            self.assertEqual(stored.content, envelope)
            self.assertIsNone(stored.reply_content)

    @patch('routes.reels_bp.upload_to_cloudinary', return_value='https://media.example/reel.mp4')
    def test_reel_upload_public_view_like_and_delete_flow(self, _upload):
        created = self.client.post('/api/reels', data={
            'video': (io.BytesIO(b'video-bytes'), 'reel.mp4'), 'caption': 'Audit reel',
        }, headers=self.auth_headers(), content_type='multipart/form-data')
        self.assertEqual(created.status_code, 201)
        reel_id = created.json['id']
        public = self.client.get(f'/api/reels/{reel_id}/public')
        self.assertEqual(public.status_code, 200)
        liked = self.client.post(f'/api/reels/{reel_id}/like', headers=self.auth_headers())
        self.assertEqual(liked.status_code, 200)
        reposted = self.client.post(
            f'/api/reels/{reel_id}/repost', json={'note': '🔥 Great reel'}, headers=self.auth_headers()
        )
        self.assertEqual(reposted.status_code, 200)
        self.assertTrue(reposted.json['isReposted'])
        profile = self.client.get(f'/api/users/{self.user_id}/reels', headers=self.auth_headers())
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.json['reposts'][0]['repostNote'], '🔥 Great reel')
        story = self.client.post(f'/api/reels/{reel_id}/story', headers=self.auth_headers())
        self.assertEqual(story.status_code, 201)
        removed = self.client.delete(f'/api/reels/{reel_id}/repost', headers=self.auth_headers())
        self.assertEqual(removed.status_code, 200)
        self.assertFalse(removed.json['isReposted'])
        deleted = self.client.delete(f'/api/reels/{reel_id}', headers=self.auth_headers())
        self.assertEqual(deleted.status_code, 200)

    def test_ai_routes_require_auth_and_expose_provider_state(self):
        self.assertEqual(self.client.get('/api/ai/info').status_code, 401)
        info = self.client.get('/api/ai/info', headers=self.auth_headers())
        self.assertEqual(info.status_code, 200)
        self.assertIn('providers', info.json)
        blank = self.client.post('/api/ai/chat', json={'message': ''}, headers=self.auth_headers())
        self.assertEqual(blank.status_code, 400)
        oversized = self.client.post('/api/ai/chat', json={'message': 'x' * 8001}, headers=self.auth_headers())
        self.assertEqual(oversized.status_code, 400)
        invalid_image = self.client.post('/api/ai/chat', json={
            'message': 'Inspect this', 'image': 'data:image/svg+xml;base64,PHN2Zz4=',
        }, headers=self.auth_headers())
        self.assertEqual(invalid_image.status_code, 400)
        unsupported_language = self.client.post('/api/ai/chat', json={
            'message': 'Hello', 'language': 'xx-XX',
        }, headers=self.auth_headers())
        self.assertEqual(unsupported_language.status_code, 400)
        with patch('routes.ai_bp._get_ai_reply', return_value='नमस्ते, मैं सुन रही हूँ।'):
            hindi = self.client.post('/api/ai/chat', json={
                'message': 'Hello', 'language': 'hi-IN',
            }, headers=self.auth_headers())
        self.assertEqual(hindi.status_code, 200)
        self.assertEqual(hindi.json['reply'], 'नमस्ते, मैं सुन रही हूँ।')
        oversized_prompt = self.client.post('/api/ai/image', json={
            'prompt': 'x' * 2001,
        }, headers=self.auth_headers())
        self.assertEqual(oversized_prompt.status_code, 400)
        hostile_stream = self.client.post('/api/ai/chat/stream', json={'message': ''}, headers={
            **self.auth_headers(), 'Origin': 'https://attacker.example',
        })
        self.assertEqual(hostile_stream.status_code, 400)
        self.assertNotIn('Access-Control-Allow-Origin', hostile_stream.headers)

    def test_ai_memory_is_bounded_by_age_and_per_account_row_limit(self):
        with app.app_context(), patch.dict(app.config, {
            'AI_MEMORY_RETENTION_DAYS': 30, 'AI_MEMORY_MAX_ROWS': 100,
        }):
            old = utc_now() - timedelta(days=31)
            db.session.add_all([
                AiConversation(user_id=self.user_id, role='user', content=f'expired-{index}', created_at=old)
                for index in range(3)
            ] + [
                AiConversation(user_id=self.user_id, role='user', content=f'recent-{index}')
                for index in range(105)
            ])
            db.session.commit()
            result = maintain_ai_memory()
            self.assertEqual(result, {'expiredDeleted': 3, 'overflowDeleted': 5})
            self.assertEqual(AiConversation.query.filter_by(user_id=self.user_id).count(), 100)
            _save_turn(self.user_id, 'new private question', 'new private answer')
            rows = AiConversation.query.filter_by(user_id=self.user_id).all()
            self.assertEqual(len(rows), 100)
            self.assertTrue(any(row.content == 'new private question' for row in rows))

    def test_push_subscription_create_and_delete_flow(self):
        self.assertEqual(self.client.get('/api/push/config').status_code, 401)
        invalid = self.client.post('/api/push/subscriptions', json={'endpoint': 'not-https'}, headers=self.auth_headers())
        self.assertEqual(invalid.status_code, 400)
        payload = {
            'endpoint': 'https://push.example/subscription-1',
            'keys': {'p256dh': 'test-public-key', 'auth': 'test-auth-secret'},
        }
        created = self.client.post('/api/push/subscriptions', json=payload, headers=self.auth_headers())
        self.assertEqual(created.status_code, 201)
        with app.app_context():
            subscription = PushSubscription.query.filter_by(user_id=self.user_id).one()
            self.assertEqual(subscription.session_id, self.session_id)
        deleted = self.client.delete('/api/push/subscriptions', json={
            'endpoint': payload['endpoint'],
        }, headers=self.auth_headers())
        self.assertEqual(deleted.status_code, 200)
        with app.app_context():
            self.assertEqual(PushSubscription.query.filter_by(user_id=self.user_id).count(), 0)

    def test_push_config_requires_complete_vapid_credentials(self):
        with patch.dict(os.environ, {'VAPID_PUBLIC_KEY': 'public-only'}, clear=False):
            os.environ.pop('VAPID_PRIVATE_KEY', None)
            os.environ.pop('VAPID_SUBJECT', None)
            incomplete = self.client.get('/api/push/config', headers=self.auth_headers())
        self.assertFalse(incomplete.json['enabled'])
        self.assertIsNone(incomplete.json['publicKey'])
        with patch.dict(os.environ, {
            'VAPID_PUBLIC_KEY': 'public', 'VAPID_PRIVATE_KEY': 'private',
            'VAPID_SUBJECT': 'mailto:security@example.com',
        }):
            ready = self.client.get('/api/push/config', headers=self.auth_headers())
        self.assertTrue(ready.json['enabled'])
        self.assertEqual(ready.json['publicKey'], 'public')

    def test_expired_push_endpoint_is_removed(self):
        with app.app_context():
            db.session.add(PushSubscription(
                user_id=self.user_id, session_id=self.session_id,
                endpoint='https://push.example/expired',
                subscription_json='{"endpoint":"https://push.example/expired","keys":{"p256dh":"key","auth":"auth"}}',
            ))
            db.session.commit()

            class ExpiredPush(Exception):
                def __init__(self):
                    self.response = SimpleNamespace(status_code=410)

            fake_module = SimpleNamespace(webpush=lambda **_kwargs: (_ for _ in ()).throw(ExpiredPush()), WebPushException=ExpiredPush)
            with patch.dict(sys.modules, {'pywebpush': fake_module}), patch.dict(os.environ, {
                'VAPID_PRIVATE_KEY': 'private', 'VAPID_SUBJECT': 'mailto:security@example.com',
            }):
                self.assertEqual(send_push_notification(self.user_id, 'CHEETCHAT', 'New encrypted message'), 0)
            self.assertEqual(PushSubscription.query.filter_by(user_id=self.user_id).count(), 0)


if __name__ == '__main__':
    unittest.main()
