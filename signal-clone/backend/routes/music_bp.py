from flask import Blueprint, jsonify, request
from utils import get_current_user_id, search_itunes_tracks

music_bp = Blueprint('music_bp', __name__)

@music_bp.route('/api/music/search', methods=['GET'])
def search_music():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    query = (request.args.get('q') or '').strip()
    if len(query) < 2:
        return jsonify({"tracks": []})

    try:
        limit = min(max(int(request.args.get('limit', 12)), 1), 25)
    except ValueError:
        limit = 12

    try:
        return jsonify({"tracks": search_itunes_tracks(query, limit)})
    except Exception as e:
        print(f"Music Search Error: {e}")
        return jsonify({
            "tracks": [],
            "warning": "Song search is temporarily unavailable. You can still post your status."
        }), 200
