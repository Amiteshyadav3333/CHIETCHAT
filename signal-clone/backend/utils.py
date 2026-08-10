import os
import jwt
import datetime
import json
import uuid
import hashlib
import urllib.parse
import urllib.request
from pathlib import Path
from flask import request, current_app, has_request_context
from werkzeug.utils import secure_filename
from sqlalchemy import inspect, text
from extensions import socketio, socket_users, user_connection_counts
from models import (
    db, User, Chat, ChatParticipant, Contact, Block, Notification,
    ProfileAudienceAvatar, MediaDeletionTask, UploadAsset,
)
import cloudinary.uploader
from observability import report_safe_exception

UPLOAD_EXTENSIONS = {
    'image': {'jpg', 'jpeg', 'png', 'gif', 'webp'},
    'video': {'mp4', 'mov', 'webm', 'avi'},
    'audio': {'mp3', 'wav', 'm4a', 'aac', 'oga', 'ogg', 'flac'},
    'document': {'pdf', 'txt', 'docx', 'xlsx', 'pptx'},
}


def _detected_upload_kind(header, extension):
    if header.startswith(b'\xff\xd8\xff') or header.startswith(b'\x89PNG\r\n\x1a\n') or header[:6] in (b'GIF87a', b'GIF89a'):
        return 'image'
    if header.startswith(b'RIFF') and header[8:12] == b'WEBP': return 'image'
    if header.startswith(b'%PDF-'): return 'document'
    if header.startswith(b'PK\x03\x04') and extension in {'docx', 'xlsx', 'pptx'}: return 'document'
    if header[4:8] == b'ftyp': return 'audio' if extension == 'm4a' else 'video'
    if header.startswith(b'\x1aE\xdf\xa3'): return 'video'
    if header.startswith(b'RIFF') and header[8:12] == b'AVI ': return 'video'
    if header.startswith(b'RIFF') and header[8:12] == b'WAVE': return 'audio'
    if header.startswith((b'ID3', b'OggS', b'fLaC')) or (len(header) > 1 and header[0] == 0xff and header[1] & 0xe0 == 0xe0): return 'audio'
    if extension == 'txt':
        try:
            header.decode('utf-8'); return 'document'
        except UnicodeDecodeError: return None
    return None


def validate_upload(file, allowed_kinds, max_bytes):
    filename = secure_filename(getattr(file, 'filename', '') or '')
    extension = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    allowed_extensions = set().union(*(UPLOAD_EXTENSIONS[kind] for kind in allowed_kinds))
    if not extension or extension not in allowed_extensions:
        raise ValueError('This file type is not allowed')
    current = file.stream.tell()
    file.stream.seek(0, os.SEEK_END)
    size = file.stream.tell()
    file.stream.seek(0)
    header = file.stream.read(64)
    file.stream.seek(current)
    if size <= 0 or size > max_bytes:
        raise ValueError(f'File must be between 1 byte and {max_bytes // (1024 * 1024)} MB')
    detected_kind = _detected_upload_kind(header, extension)
    if detected_kind not in allowed_kinds or extension not in UPLOAD_EXTENSIONS[detected_kind]:
        raise ValueError('File contents do not match the selected file type')
    return detected_kind

def upload_to_cloudinary(file, folder='chietchat', resource_type='auto'):
    if not isinstance(file, (bytes, bytearray)):
        if resource_type == 'image': validate_upload(file, {'image'}, 10 * 1024 * 1024)
        elif resource_type == 'video': validate_upload(file, {'video', 'audio'}, 100 * 1024 * 1024)
        elif resource_type == 'raw': validate_upload(file, {'document'}, 25 * 1024 * 1024)
        else: validate_upload(file, {'image', 'video', 'audio', 'document'}, 100 * 1024 * 1024)
    cloud_name = os.environ.get('CLOUDINARY_CLOUD_NAME')
    api_key = os.environ.get('CLOUDINARY_API_KEY')
    api_secret = os.environ.get('CLOUDINARY_API_SECRET')

    if not all([cloud_name, api_key, api_secret]):
        return _save_locally(file)

    if not isinstance(file, (bytes, bytearray)):
        file_data = file.read()
    else:
        file_data = file

    try:
        result = cloudinary.uploader.upload(
            file_data,
            folder=folder,
            resource_type=resource_type
        )
        return result['secure_url']
    except Exception as e:
        err_str = str(e).lower()
        # If uploading disabled or quota exceeded, fallback to local
        if 'disabled' in err_str or 'quota' in err_str or 'limit' in err_str or 'upgrade' in err_str:
            report_safe_exception('cloudinary_fallback_used', e)
            return _save_locally(file_data, getattr(file, 'filename', 'upload'))
        raise


def _save_locally(file, filename=None):
    upload_folder = current_app.config['UPLOAD_FOLDER']
    os.makedirs(upload_folder, exist_ok=True)
    if filename is None:
        filename = getattr(file, 'filename', None) or 'upload'
    filename = secure_filename(filename)
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'bin'
    local_name = f"{uuid.uuid4().hex}.{ext}"
    path = os.path.join(upload_folder, local_name)
    if isinstance(file, (bytes, bytearray)):
        with open(path, 'wb') as f:
            f.write(file)
    else:
        file.save(path)
    # Return absolute URL using request host
    from flask import request as flask_request
    base = os.environ.get('BACKEND_URL', '').rstrip('/')
    if not base:
        try:
            base = flask_request.host_url.rstrip('/')
        except Exception:
            base = 'http://localhost:5001'
    return f"{base}/uploads/{local_name}"


def get_managed_media_reference(media_url, resource_type='image'):
    """Resolve only CHEETCHAT-owned local or Cloudinary media targets."""
    try:
        parsed = urllib.parse.urlparse(str(media_url or ''))
    except ValueError:
        return None
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        return None

    path_parts = [urllib.parse.unquote(part) for part in parsed.path.split('/') if part]
    if len(path_parts) == 2 and path_parts[0] == 'uploads':
        allowed_hosts = set()
        configured_backend = os.environ.get('BACKEND_URL', '').strip()
        if configured_backend:
            configured_host = urllib.parse.urlparse(configured_backend).hostname
            if configured_host:
                allowed_hosts.add(configured_host)
        if has_request_context():
            allowed_hosts.add(request.host.split(':', 1)[0])
        if not allowed_hosts or parsed.hostname not in allowed_hosts:
            return None
        filename = secure_filename(path_parts[1])
        if filename != path_parts[1] or not filename:
            return None
        upload_root = Path(current_app.config['UPLOAD_FOLDER']).resolve()
        target = (upload_root / filename).resolve()
        if target.parent != upload_root:
            return None
        return {'provider': 'local', 'target': target}

    configured_cloud = os.environ.get('CLOUDINARY_CLOUD_NAME', '').strip()
    if parsed.hostname != 'res.cloudinary.com' or not configured_cloud or not path_parts:
        return None
    if path_parts[0] != configured_cloud or 'upload' not in path_parts:
        return None
    upload_index = path_parts.index('upload')
    public_parts = path_parts[upload_index + 1:]
    if public_parts and public_parts[0].startswith('v') and public_parts[0][1:].isdigit():
        public_parts = public_parts[1:]
    if not public_parts:
        return None
    public_id = '/'.join(public_parts)
    if resource_type != 'raw' and '.' in public_parts[-1]:
        public_id = '/'.join(public_parts[:-1] + [public_parts[-1].rsplit('.', 1)[0]])
    return {'provider': 'cloudinary', 'public_id': public_id, 'resource_type': resource_type}


def delete_managed_media(media_url, resource_type='image'):
    reference = get_managed_media_reference(media_url, resource_type)
    if not reference:
        raise ValueError('Media URL is not a configured CHEETCHAT-managed asset')
    if reference['provider'] == 'local':
        reference['target'].unlink(missing_ok=True)
        return True
    result = cloudinary.uploader.destroy(
        reference['public_id'], resource_type=reference['resource_type'], invalidate=True
    )
    if result.get('result') not in {'ok', 'not found'}:
        raise RuntimeError(f"Cloudinary deletion returned {result.get('result', 'unknown')}")
    return True


def queue_media_deletion(media_url, resource_type='image', trusted=False):
    if not media_url:
        return None
    if not trusted and not get_managed_media_reference(media_url, resource_type):
        return None
    existing = MediaDeletionTask.query.filter_by(media_url=media_url).first()
    if existing:
        return existing
    task = MediaDeletionTask(media_url=media_url, resource_type=resource_type)
    db.session.add(task)
    return task


def process_media_deletion_task(task_id):
    task = db.session.get(MediaDeletionTask, task_id)
    if not task:
        return True
    try:
        delete_managed_media(task.media_url, task.resource_type)
        db.session.delete(task)
        db.session.commit()
        return True
    except Exception as error:
        db.session.rollback()
        task = db.session.get(MediaDeletionTask, task_id)
        if task:
            task.attempts = (task.attempts or 0) + 1
            task.last_error = str(error)[:500]
            db.session.commit()
        current_app.logger.warning('media_deletion_deferred', extra={'taskId': task_id})
        return False


def claim_upload_asset(asset_id, owner_id, claim_type, claim_id, allowed_kinds=None):
    asset_id = str(asset_id or '').strip()
    if not asset_id:
        return None
    asset = db.session.get(UploadAsset, asset_id)
    if not asset or asset.owner_id != owner_id:
        raise ValueError('Upload asset was not found')
    if asset.status == 'pending' and asset.expires_at <= utc_now():
        raise ValueError('Upload asset has expired')
    if allowed_kinds and asset.media_kind not in allowed_kinds:
        raise ValueError('Upload asset type does not match the message')
    normalized_claim_id = str(claim_id)
    if asset.status == 'claimed':
        if asset.claim_type == claim_type and asset.claim_id == normalized_claim_id:
            return asset
        raise ValueError('Upload asset has already been claimed')
    asset.status = 'claimed'
    asset.claim_type = claim_type
    asset.claim_id = normalized_claim_id
    asset.claimed_at = utc_now()
    return asset


def queue_claimed_upload_assets(claim_type, claim_id):
    task_ids = []
    assets = UploadAsset.query.filter_by(claim_type=claim_type, claim_id=str(claim_id)).all()
    for asset in assets:
        task = queue_media_deletion(asset.media_url, asset.resource_type, trusted=True)
        if task:
            db.session.flush()
            task_ids.append(task.id)
        db.session.delete(asset)
    return task_ids

def add_missing_columns(inspector, table_name, columns):
    if table_name not in inspector.get_table_names():
        return

    existing_columns = {column['name'] for column in inspector.get_columns(table_name)}
    preparer = db.engine.dialect.identifier_preparer
    quoted_table = preparer.quote(table_name)

    for column_name, column_type in columns.items():
        if column_name in existing_columns:
            continue

        quoted_column = preparer.quote(column_name)
        compiled_type = column_type.compile(dialect=db.engine.dialect)
        try:
            db.session.execute(text(f'ALTER TABLE {quoted_table} ADD COLUMN {quoted_column} {compiled_type}'))
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise RuntimeError(f"Could not add {table_name}.{column_name}: {e}") from e

SCHEMA_VERSION = '20260810_17_google_auth'


def ensure_database_schema(force=False):
    try:
        # Quick connectivity check before heavy operations
        db.session.execute(text('SELECT 1'))
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        if force:
            raise RuntimeError(f'Database is not reachable: {e}') from e
        report_safe_exception('database_schema_check_failed', e)
        return

    try:
        db.session.execute(text(
            'CREATE TABLE IF NOT EXISTS schema_migration '
            '(version VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)'
        ))
        db.session.commit()
        already_applied = db.session.execute(
            text('SELECT 1 FROM schema_migration WHERE version = :version'),
            {'version': SCHEMA_VERSION}
        ).first()
        if already_applied:
            return
        db.create_all()
        inspector = inspect(db.engine)
        
        # Notification table is created by create_all(), but we check other tables' columns
        add_missing_columns(inspector, 'notification', {
            'target_id': db.Integer(),
        })
        add_missing_columns(inspector, 'user', {
            'email': db.String(120),
            'public_key': db.Text(),
            'encrypted_private_key': db.Text(),
            'encrypted_recovery_key': db.Text(),
            'avatar': db.String(200),
            'last_seen': db.DateTime(),
            'created_at': db.DateTime(),
        })
        add_missing_columns(inspector, 'reel', {
            'music_url': db.String(500),
            'music_name': db.String(200),
            'music_volume': db.Float(),
            'shares_count': db.Integer(),
            'views_count': db.Integer(),
            'parent_reel_id': db.Integer(),
            'filter_name': db.String(50),
        })
        add_missing_columns(inspector, 'user', {
            'bio': db.String(200),
            'website_url': db.String(200),
            'email_verified': db.Boolean(),
            'failed_login_attempts': db.Integer(),
            'password_login_locked': db.Boolean(),
            'platform_id': db.String(30),
            'profile_setup_done': db.Boolean(),
            'hide_last_seen': db.Boolean(),
            'hide_online_status': db.Boolean(),
            'read_receipts': db.Boolean(),
            'profile_photo_privacy': db.String(20),
            'two_factor_enabled': db.Boolean(),
            'two_factor_secret': db.String(100),
            'bio_expires_at': db.DateTime(),
            'auth_provider': db.String(20),
            'supabase_user_id': db.String(64),
            'phone_verified': db.Boolean(),
        })
        if 'user' in inspector.get_table_names() and db.engine.dialect.name == 'postgresql':
            db.session.execute(text('ALTER TABLE "user" ALTER COLUMN password_hash DROP NOT NULL'))
        if 'user' in inspector.get_table_names():
            user_indexes = {index['name'] for index in inspect(db.engine).get_indexes('user')}
            if 'uq_user_supabase_user_id' not in user_indexes:
                db.session.execute(text(
                    'CREATE UNIQUE INDEX uq_user_supabase_user_id '
                    'ON "user" (supabase_user_id) WHERE supabase_user_id IS NOT NULL'
                ))
        add_missing_columns(inspector, 'pending_registration', {
            'encrypted_private_key': db.Text(),
            'encrypted_recovery_key': db.Text(),
        })
        add_missing_columns(inspector, 'chat_participant', {
            'is_archived': db.Boolean(),
            'deleted_at': db.DateTime(),
        })
        if 'user' in inspector.get_table_names():
            user_columns = {column['name'] for column in inspector.get_columns('user')}
            updates = []
            if 'email_verified' in user_columns:
                updates.append('email_verified = COALESCE(email_verified, TRUE)')
            if 'failed_login_attempts' in user_columns:
                updates.append('failed_login_attempts = COALESCE(failed_login_attempts, 0)')
            if 'password_login_locked' in user_columns:
                updates.append('password_login_locked = COALESCE(password_login_locked, FALSE)')
            if 'hide_last_seen' in user_columns:
                updates.append('hide_last_seen = COALESCE(hide_last_seen, FALSE)')
            if 'hide_online_status' in user_columns:
                updates.append('hide_online_status = COALESCE(hide_online_status, FALSE)')
            if 'read_receipts' in user_columns:
                updates.append('read_receipts = COALESCE(read_receipts, TRUE)')
            if 'profile_photo_privacy' in user_columns:
                updates.append("profile_photo_privacy = COALESCE(profile_photo_privacy, 'everyone')")
            if 'two_factor_enabled' in user_columns:
                updates.append('two_factor_enabled = COALESCE(two_factor_enabled, FALSE)')
            if 'auth_provider' in user_columns:
                updates.append("auth_provider = COALESCE(auth_provider, 'password')")
            if 'phone_verified' in user_columns:
                updates.append('phone_verified = COALESCE(phone_verified, FALSE)')
            if updates:
                db.session.execute(text(f'UPDATE "user" SET {", ".join(updates)}'))
        if 'chat_participant' in inspector.get_table_names():
            cp_columns = {column['name'] for column in inspector.get_columns('chat_participant')}
            if 'is_archived' in cp_columns:
                db.session.execute(text('UPDATE "chat_participant" SET is_archived = COALESCE(is_archived, FALSE)'))
        add_missing_columns(inspector, 'chat', {
            'is_group': db.Boolean(),
            'name': db.String(100),
            'group_admin_id': db.Integer(),
            'is_public': db.Boolean(),
            'is_chat_disabled': db.Boolean(),
            'snap_mode': db.Boolean(),
            'created_at': db.DateTime(),
        })
        add_missing_columns(inspector, 'message', {
            'status': db.String(20),
            'ttl': db.Integer(),
            'reply_to_id': db.Integer(),
            'reply_content': db.Text(),
            'reply_sender_name': db.String(80),
            'edited_at': db.DateTime(),
            'deleted_at': db.DateTime(),
            'read_at': db.DateTime(),
            'delivered_at': db.DateTime(),
            'reactions': db.Text(),
            'is_pinned': db.Boolean(),
            'client_message_id': db.String(100),
            'snap_mode': db.Boolean(),
            'snap_expires_at': db.DateTime(),
        })
        add_missing_columns(inspector, 'payment_order', {
            'provider_refund_id': db.String(100),
            'refund_requested_at': db.DateTime(),
            'refunded_at': db.DateTime(),
            'payer_ref': db.String(64),
            'payee_ref': db.String(64),
            'retention_until': db.DateTime(),
            'chat_ref': db.String(64),
            'client_request_id': db.String(100),
        })
        if db.engine.dialect.name == 'postgresql' and 'payment_order' in inspector.get_table_names():
            db.session.execute(text('ALTER TABLE payment_order ALTER COLUMN payer_id DROP NOT NULL'))
            db.session.execute(text('ALTER TABLE payment_order ALTER COLUMN payee_id DROP NOT NULL'))
            db.session.execute(text('ALTER TABLE payment_order ALTER COLUMN chat_id DROP NOT NULL'))
        add_missing_columns(inspector, 'push_subscription', {
            'session_id': db.Integer(),
        })
        if 'message' in inspector.get_table_names():
            message_indexes = {index['name'] for index in inspector.get_indexes('message')}
            if 'uq_message_sender_client_id' not in message_indexes:
                try:
                    db.session.execute(text(
                        'CREATE UNIQUE INDEX uq_message_sender_client_id '
                        'ON message (sender_id, client_message_id)'
                    ))
                    db.session.commit()
                except Exception as index_error:
                    db.session.rollback()
                    raise RuntimeError(f'Could not create message idempotency index: {index_error}') from index_error
        add_missing_columns(inspector, 'status', {
            'music_url': db.String(500),
            'music_name': db.String(200),
            'duration': db.Integer(),
        })
        if 'status_view' in inspector.get_table_names():
            db.session.execute(text(
                'DELETE FROM status_view WHERE id NOT IN '
                '(SELECT MIN(id) FROM status_view GROUP BY status_id, viewer_id)'
            ))
            status_view_indexes = {index['name'] for index in inspect(db.engine).get_indexes('status_view')}
            if 'uq_status_viewer' not in status_view_indexes:
                db.session.execute(text(
                    'CREATE UNIQUE INDEX uq_status_viewer ON status_view (status_id, viewer_id)'
                ))
        if 'payment_order' in inspector.get_table_names():
            payment_indexes = {index['name'] for index in inspect(db.engine).get_indexes('payment_order')}
            if 'uq_payment_provider_refund_id' not in payment_indexes:
                db.session.execute(text(
                    'CREATE UNIQUE INDEX uq_payment_provider_refund_id '
                    'ON payment_order (provider_refund_id)'
                ))
            if 'uq_payment_payer_request' not in payment_indexes:
                db.session.execute(text(
                    'CREATE UNIQUE INDEX uq_payment_payer_request '
                    'ON payment_order (payer_id, client_request_id)'
                ))
        add_missing_columns(inspector, 'social_post', {
            'retweet_of_id': db.Integer(),
            'share_count': db.Integer(),
        })
        add_missing_columns(inspector, 'social_post_comment', {
            'parent_id': db.Integer(),
        })
        add_missing_columns(inspector, 'reel_comment', {
            'parent_id': db.Integer(),
        })
        if 'ai_conversation' in inspector.get_table_names():
            ai_indexes = {index['name'] for index in inspect(db.engine).get_indexes('ai_conversation')}
            if 'ix_ai_conversation_user_id' not in ai_indexes:
                db.session.execute(text(
                    'CREATE INDEX ix_ai_conversation_user_id ON ai_conversation (user_id)'
                ))
            if 'ix_ai_conversation_created_at' not in ai_indexes:
                db.session.execute(text(
                    'CREATE INDEX ix_ai_conversation_created_at ON ai_conversation (created_at)'
                ))
        add_missing_columns(inspector, 'user', {
            'gender': db.String(10),
        })


        if 'user' in inspector.get_table_names():
            user_columns = {column['name'] for column in inspector.get_columns('user')}
            if {'last_seen', 'created_at'}.issubset(user_columns):
                db.session.execute(text('UPDATE "user" SET last_seen = created_at WHERE last_seen IS NULL'))
        
        # Clean up broken seeded reels from the database dynamically
        if 'reel' in inspector.get_table_names():
            try:
                from models import Reel
                broken_patterns = ['ryq5tpznexkohkhwfzrn', 'iq2oc0u5t9z2g2lh0yam']
                for pattern in broken_patterns:
                    broken_reels = Reel.query.filter(Reel.video_url.like(f'%{pattern}%')).all()
                    for r in broken_reels:
                        db.session.delete(r)
                print("Cleaned up broken reels from db")
            except Exception as re_err:
                report_safe_exception('broken_reel_cleanup_failed', re_err)

        db.session.execute(
            text('INSERT INTO schema_migration (version) VALUES (:version) ON CONFLICT (version) DO NOTHING'),
            {'version': SCHEMA_VERSION}
        )
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise RuntimeError(f"Database migration failed: {e}") from e

def get_json_data():
    return request.get_json(silent=True) or {}

def normalize_phone(phone):
    return ''.join(ch for ch in str(phone or '') if ch.isdigit())

def is_valid_phone(phone):
    return len(phone) == 10

def get_current_user_id():
    token = get_request_auth_token()
    if not token:
        return None
    try:
        payload = jwt.decode(token, current_app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        user_id = payload.get('user_id')
        session_id = payload.get('session_id')
        if session_id:
            from models import ActiveSession
            session = db.session.get(ActiveSession, session_id)
            if not session:
                return None  # Session revoked
        return user_id
    except jwt.InvalidTokenError as e:
        report_safe_exception('jwt_validation_failed', e)
        return None

def get_current_session_id():
    token = get_request_auth_token()
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, current_app.config['JWT_SECRET_KEY'], algorithms=['HS256']
        )
        return payload.get('session_id')
    except jwt.InvalidTokenError:
        return None

def get_request_auth_token():
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
        if token and token not in ('null', 'undefined', 'cookie-session'):
            return token
    return request.cookies.get(current_app.config.get('AUTH_COOKIE_NAME', 'cheetchat_session'))

def user_is_chat_participant(user_id, chat_id):
    return ChatParticipant.query.filter_by(user_id=user_id, chat_id=chat_id).first() is not None

def get_socket_user_id():
    # request in socket context
    return socket_users.get(request.sid)

def get_chat_participant_ids(chat_id):
    return [
        participant.user_id
        for participant in ChatParticipant.query.filter_by(chat_id=chat_id).all()
    ]

def find_direct_chat(user_a_id, user_b_id):
    first_user_chats = ChatParticipant.query.filter_by(user_id=user_a_id).all()
    target_ids = {user_a_id, user_b_id}
    for participation in first_user_chats:
        chat = db.session.get(Chat, participation.chat_id)
        if not chat or chat.is_group:
            continue
        participant_ids = {p.user_id for p in ChatParticipant.query.filter_by(chat_id=chat.id).all()}
        if participant_ids == target_ids:
            return chat
    return None

def get_or_create_direct_chat(user_a_id, user_b_id):
    existing_chat = find_direct_chat(user_a_id, user_b_id)
    if existing_chat:
        return existing_chat

    chat = Chat(is_group=False)
    db.session.add(chat)
    db.session.commit()
    db.session.add(ChatParticipant(chat_id=chat.id, user_id=user_a_id))
    db.session.add(ChatParticipant(chat_id=chat.id, user_id=user_b_id))
    db.session.commit()
    return chat

def users_share_direct_chat(user_a_id, user_b_id):
    return find_direct_chat(user_a_id, user_b_id) is not None

def has_contact(owner_id, contact_user_id):
    return Contact.query.filter_by(owner_id=owner_id, contact_user_id=contact_user_id).first() is not None

def add_contact(owner_id, contact_user_id):
    if owner_id == contact_user_id:
        return False
    if has_contact(owner_id, contact_user_id):
        return False
    db.session.add(Contact(owner_id=owner_id, contact_user_id=contact_user_id))
    db.session.commit()
    return True

def get_contact_user_ids(owner_id):
    return [
        contact.contact_user_id
        for contact in Contact.query.filter_by(owner_id=owner_id).all()
    ]

def user_can_access_chat(user_id, chat_id):
    chat = db.session.get(Chat, chat_id)
    return bool(chat and user_is_chat_participant(user_id, chat_id))

def is_blocked(user_a_id, user_b_id):
    blocked = Block.query.filter(
        ((Block.blocker_id == user_a_id) & (Block.blocked_id == user_b_id)) |
        ((Block.blocker_id == user_b_id) & (Block.blocked_id == user_a_id))
    ).first()
    return blocked is not None

def decode_socket_user_id(auth, secret_key):
    token = auth.get('token') if isinstance(auth, dict) else None
    if not token or token in ('null', 'undefined', 'cookie-session'):
        token = request.cookies.get(current_app.config.get('AUTH_COOKIE_NAME', 'cheetchat_session'))
    if not token:
        return None
    try:
        payload = jwt.decode(token, secret_key, algorithms=['HS256'])
        user_id = payload.get('user_id')
        session_id = payload.get('session_id')
        if session_id:
            from models import ActiveSession
            session = ActiveSession.query.filter_by(id=session_id, user_id=user_id).first()
            if not session:
                return None
        return user_id
    except Exception:
        return None

def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

def iso_utc(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')

def is_user_online(user_id):
    return user_connection_counts.get(user_id, 0) > 0

def serialize_user(user, viewer_id=None):
    avatar = user.avatar
    # Apply profile photo privacy rules
    if user.profile_photo_privacy == 'nobody':
        avatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=hidden"
    elif user.profile_photo_privacy == 'contacts' and viewer_id and viewer_id != user.id:
        if not has_contact(user.id, viewer_id):
            avatar = "https://api.dicebear.com/7.x/avataaars/svg?seed=hidden"

    # An explicitly selected per-contact photo takes precedence over the public
    # default and broad visibility rule for that one trusted contact.
    if viewer_id and viewer_id != user.id:
        audience_avatar = ProfileAudienceAvatar.query.filter_by(
            owner_id=user.id, viewer_id=viewer_id
        ).first()
        if audience_avatar:
            avatar = audience_avatar.avatar_url

    # Last seen privacy rules
    show_last_seen = True
    if user.hide_last_seen:
        show_last_seen = False
        if viewer_id == user.id:
            show_last_seen = True

    # Online status privacy rules
    show_online_status = True
    if user.hide_online_status:
        show_online_status = False
        if viewer_id == user.id:
            show_online_status = True

    user_bio = user.bio
    if user.bio_expires_at and utc_now() > user.bio_expires_at:
        user_bio = ""

    return {
        "id": user.id,
        "username": user.username,
        "phone": user.phone,
        "avatar": avatar,
        "hasCustomAudienceAvatar": bool(viewer_id and viewer_id != user.id and avatar != user.avatar),
        "publicKey": user.public_key,
        "bio": user_bio or "",
        "websiteUrl": user.website_url or "",
        "platformId": user.platform_id or "",
        "profileSetupDone": bool(user.profile_setup_done),
        "lastSeen": iso_utc(user.last_seen) if show_last_seen else None,
        "isOnline": is_user_online(user.id) if show_online_status else False,
        "hideLastSeen": bool(user.hide_last_seen),
        "hideOnlineStatus": bool(user.hide_online_status),
        "readReceipts": bool(user.read_receipts),
        "profilePhotoPrivacy": user.profile_photo_privacy,
        "twoFactorEnabled": bool(user.two_factor_enabled),
        "recoveryKeyEnabled": bool(user.encrypted_recovery_key) if viewer_id == user.id else None,
        "gender": getattr(user, 'gender', None) or ""
    }

def emit_to_user_chat_contacts(user_id, event, payload):
    participations = ChatParticipant.query.filter_by(user_id=user_id).all()
    notified_user_ids = set()
    for participation in participations:
        participants = ChatParticipant.query.filter_by(chat_id=participation.chat_id).all()
        for participant in participants:
            notified_user_ids.add(participant.user_id)
    notified_user_ids.add(user_id)
    for participant_id in notified_user_ids:
        socketio.emit(event, payload, room=f"user_{participant_id}")

def create_notification(recipient_id, sender_id, n_type, content=None, target_id=None):
    if recipient_id == sender_id:
        return None
    # Avoid duplicate notifications for same target/type/sender (e.g. liking multiple times)
    existing = Notification.query.filter_by(
        recipient_id=recipient_id,
        sender_id=sender_id,
        type=n_type,
        target_id=target_id,
        is_read=False
    ).first()
    
    if existing:
        existing.created_at = utc_now()
        db.session.commit()
        return existing

    new_n = Notification(
        recipient_id=recipient_id,
        sender_id=sender_id,
        type=n_type,
        content=content,
        target_id=target_id
    )
    db.session.add(new_n)
    db.session.commit()
    
    # Build post preview for socket push
    post_preview = None
    if n_type in ('like', 'comment', 'comment_reply', 'retweet', 'share') and target_id:
        from models import SocialPost
        post = db.session.get(SocialPost, target_id)
        if post and post.caption:
            post_preview = post.caption[:80] + ('…' if len(post.caption) > 80 else '')

    # Real-time emit
    from extensions import socketio
    socketio.emit('new_notification', {
        "id": new_n.id,
        "type": n_type,
        "senderName": new_n.sender.username if new_n.sender else "Someone",
        "senderAvatar": new_n.sender.avatar if new_n.sender else None,
        "sender": {
            "id": new_n.sender.id if new_n.sender else None,
            "username": new_n.sender.username if new_n.sender else "Someone",
            "avatar": new_n.sender.avatar if new_n.sender else None,
        },
        "content": content,
        "targetId": target_id,
        "postPreview": post_preview,
        "isRead": False,
        "createdAt": iso_utc(new_n.created_at)
    }, room=f"user_{recipient_id}")
    
    return new_n

def send_push_notification(user_id, title, body, url='/'):
    """Best-effort Web Push; invalid/expired endpoints are removed."""
    from models import PushSubscription
    private_key = os.environ.get('VAPID_PRIVATE_KEY', '')
    subject = os.environ.get('VAPID_SUBJECT', '')
    if not private_key or not subject:
        return 0
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return 0
    delivered = 0
    notification_tag = f"cheetchat-{hashlib.sha256(str(url).encode()).hexdigest()[:16]}"
    payload = json.dumps({
        'title': title, 'body': body, 'url': url,
        'icon': '/icons/icon-192.png', 'tag': notification_tag,
    })
    for subscription in PushSubscription.query.filter_by(user_id=user_id).all():
        try:
            webpush(
                subscription_info=json.loads(subscription.subscription_json), data=payload,
                vapid_private_key=private_key, vapid_claims={'sub': subject}, ttl=60,
            )
            delivered += 1
        except WebPushException as exc:
            status = getattr(getattr(exc, 'response', None), 'status_code', None)
            if status in (404, 410):
                db.session.delete(subscription)
        except Exception:
            continue
    db.session.commit()
    return delivered

def search_itunes_tracks(query, limit=12):
    params = urllib.parse.urlencode({
        "term": query,
        "media": "music",
        "entity": "song",
        "limit": limit,
    })
    url = f"https://itunes.apple.com/search?{params}"
    request_obj = urllib.request.Request(url, headers={"User-Agent": "CHIETCHAT/1.0"})

    with urllib.request.urlopen(request_obj, timeout=6) as response:
        payload = json.loads(response.read().decode("utf-8"))

    tracks = []
    for item in payload.get("results", []):
        preview_url = item.get("previewUrl")
        if not preview_url:
            continue
        artwork = item.get("artworkUrl100")
        if artwork:
            artwork = artwork.replace("100x100bb", "300x300bb")
        tracks.append({
            "id": str(item.get("trackId") or preview_url),
            "title": item.get("trackName") or "Unknown song",
            "artist": item.get("artistName") or "Unknown artist",
            "album": item.get("collectionName") or "",
            "previewUrl": preview_url,
            "artwork": artwork,
            "source": "itunes",
            "durationMs": item.get("trackTimeMillis"),
        })
    return tracks

def get_totp_token(secret, intervals_no):
    import hmac
    import hashlib
    import struct
    import base64
    try:
        key = base64.b32decode(secret, True)
        msg = struct.pack(">Q", intervals_no)
        h = hmac.new(key, msg, hashlib.sha1).digest()
        o = h[19] & 15
        h = (struct.unpack(">I", h[o:o+4])[0] & 0x7fffffff) % 1000000
        return f"{h:06d}"
    except Exception:
        return ""

def verify_totp(secret, token, window=1):
    import time
    try:
        token = str(token).strip()
        if len(token) != 6 or not token.isdigit():
            return False
        base32_secret = secret.upper()
        missing_padding = len(base32_secret) % 8
        if missing_padding:
            base32_secret += '=' * (8 - missing_padding)
        
        now = int(time.time()) // 30
        for i in range(-window, window + 1):
            if get_totp_token(base32_secret, now + i) == token:
                return True
    except Exception as e:
        report_safe_exception('totp_verification_failed', e)
    return False

def generate_totp_secret():
    import secrets
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    return "".join(secrets.choice(chars) for _ in range(16))
