import os
import datetime
import json
import re
import urllib.parse
import urllib.request
import asyncio
from flask import Blueprint, jsonify, request, send_from_directory, current_app
from models import db, UploadAsset
from utils import (
    get_current_user_id, upload_to_cloudinary, validate_upload, utc_now,
    queue_media_deletion, process_media_deletion_task,
)
from observability import report_safe_exception
from content_moderation import ModerationUnavailable, reject_adult_content
from googletrans import LANGUAGES, Translator

main_bp = Blueprint('main_bp', __name__)
SUPPORTED_UI_LANGUAGES = {'as','bn','brx','doi','gu','hi','kn','ks','kok','mai','ml','mni','mr','ne','or','pa','sa','sat','sd','ta','te','ur'}
GOOGLETRANS_LANGUAGE_ALIASES = {'kok': 'gom', 'mni': 'mni-mtei'}
LANGUAGES.update({'ks': 'kashmiri', 'brx': 'bodo'})

@main_bp.route('/api/ui/translate', methods=['POST'])
def translate_ui_batch():
    if not get_current_user_id():
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    language = str(data.get('language') or '')
    texts = data.get('texts')
    if language not in SUPPORTED_UI_LANGUAGES or not isinstance(texts, list) or not 1 <= len(texts) <= 75:
        return jsonify({"error": "Unsupported language or translation batch"}), 400
    clean = [str(value)[:500] for value in texts]
    try:
        async def run_translation():
            async with Translator() as translator:
                result = await translator.translate(clean, src='en', dest=GOOGLETRANS_LANGUAGE_ALIASES.get(language, language))
                rows = result if isinstance(result, list) else [result]
                return [row.text for row in rows]
        translated = asyncio.run(run_translation())
        if len(translated) != len(clean):
            raise ValueError('Translation count mismatch')
        return jsonify({'translations': translated})
    except Exception as error:
        report_safe_exception('ui_translation_failed', error)
        return jsonify({"error": "App translation is temporarily unavailable"}), 502

@main_bp.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(current_app.config['UPLOAD_FOLDER'], filename)

@main_bp.route('/api/upload', methods=['POST'])
def upload_file():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    if 'file' not in request.files:
        return jsonify({"error": "No file"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selection"}), 400

    url = None
    resource_type = None
    try:
        media_kind = validate_upload(
            file, {'image', 'video', 'audio', 'document'}, 100 * 1024 * 1024
        )
        if media_kind in {'image', 'video'}:
            blocked, adult_score = reject_adult_content(file, media_kind)
            if blocked:
                return jsonify({
                    "error": "Adult content cannot be shared in chat.",
                    "code": "ADULT_CONTENT_BLOCKED",
                    "adultScore": adult_score,
                }), 422
        resource_type = {
            'image': 'image', 'video': 'video', 'audio': 'video', 'document': 'raw',
        }[media_kind]
        url = upload_to_cloudinary(file, folder='chietchat/uploads', resource_type=resource_type)
        asset = UploadAsset(
            owner_id=user_id,
            media_url=url,
            media_kind=media_kind,
            resource_type=resource_type,
            expires_at=utc_now() + datetime.timedelta(days=7),
        )
        db.session.add(asset)
        db.session.commit()
        return jsonify({"url": url, "assetId": asset.id, "expiresAt": asset.expires_at.isoformat() + 'Z'})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except ModerationUnavailable:
        return jsonify({"error": "Media safety check is temporarily unavailable. Please try again.", "code": "MODERATION_UNAVAILABLE"}), 503
    except Exception as e:
        db.session.rollback()
        if url and resource_type:
            deletion_task = queue_media_deletion(url, resource_type, trusted=True)
            if deletion_task:
                db.session.commit()
                process_media_deletion_task(deletion_task.id)
        report_safe_exception('upload_failed', e)
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

@main_bp.route('/api/translate', methods=['POST'])
def translate_text():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    text = data.get('text')
    target_lang = data.get('target_lang')
    source_lang = data.get('source_lang', 'auto')

    if not isinstance(text, str) or not text.strip():
        return jsonify({"error": "Missing 'text' parameter"}), 400
    if len(text) > 8000:
        return jsonify({"error": "Text is too long"}), 400
    language_pattern = re.compile(r'^[A-Za-z]{2,3}(?:-[A-Za-z]{2,4})?$')
    if not isinstance(target_lang, str) or not language_pattern.fullmatch(target_lang):
        return jsonify({"error": "Missing 'target_lang' parameter"}), 400
    if source_lang != 'auto' and (
        not isinstance(source_lang, str) or not language_pattern.fullmatch(source_lang)
    ):
        return jsonify({"error": "Invalid 'source_lang' parameter"}), 400

    try:
        query = urllib.parse.urlencode({
            'client': 'gtx', 'sl': source_lang, 'tl': target_lang,
            'dt': 't', 'q': text,
        })
        upstream_request = urllib.request.Request(
            f'https://translate.googleapis.com/translate_a/single?{query}',
            headers={'User-Agent': 'CHEETCHAT/1.0'},
        )
        with urllib.request.urlopen(upstream_request, timeout=10) as response:
            payload = json.loads(response.read(256 * 1024))
        translated = ''.join(
            segment[0] for segment in payload[0]
            if isinstance(segment, list) and segment and isinstance(segment[0], str)
        )
        if not translated:
            raise ValueError('Translation provider returned an empty response')
        return jsonify({"translatedText": translated})
    except Exception as e:
        report_safe_exception('translation_failed', e)
        return jsonify({"error": "Translation is temporarily unavailable"}), 502

@main_bp.route('/', defaults={'path': ''})

@main_bp.route('/<path:path>')
def serve(path):
    static_folder = current_app.static_folder
    if path != "" and os.path.exists(os.path.join(static_folder, path)):
        return send_from_directory(static_folder, path)
    elif os.path.exists(os.path.join(static_folder, 'index.html')):
        return send_from_directory(static_folder, 'index.html')
    else:
        return "Cheat Chat Backend Running.", 200
