import os
from flask import Blueprint, jsonify, request, send_from_directory, current_app
from utils import get_current_user_id, upload_to_cloudinary

main_bp = Blueprint('main_bp', __name__)

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

    try:
        url = upload_to_cloudinary(file, folder='chietchat/uploads', resource_type='auto')
        return jsonify({"url": url})
    except Exception as e:
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

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
