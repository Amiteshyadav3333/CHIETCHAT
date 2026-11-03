from flask import Blueprint, jsonify, request
from utils import get_current_user_id, search_itunes_tracks
from observability import report_safe_exception
from service_gateway import call_music_service
import os

music_bp = Blueprint('music_bp', __name__)

@music_bp.route('/api/music/search', methods=['GET'])
def search_music():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    query = (request.args.get('q') or '').strip()
    if len(query) < 2:
        return jsonify({"tracks": []})
    if len(query) > 120:
        return jsonify({"error": "Search query is too long"}), 400

    try:
        limit = min(max(int(request.args.get('limit', 12)), 1), 25)
    except ValueError:
        limit = 12

    try:
        if os.environ.get('MUSIC_SERVICE_URL'):
            tracks = call_music_service(user_id, query, limit)
        else:
            # Local development keeps the public API usable before the
            # independently deployed Music service has been configured.
            tracks = search_itunes_tracks(query, limit)
        return jsonify({"tracks": tracks})
    except Exception as e:
        report_safe_exception('music_search_failed', e)
        return jsonify({
            "tracks": [],
            "warning": "Song search is temporarily unavailable. You can still post your status."
        }), 200
