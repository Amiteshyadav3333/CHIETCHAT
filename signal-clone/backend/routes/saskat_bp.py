from flask import Blueprint, jsonify
from utils import get_current_user_id, get_json_data
from models import db, User
from utils import utc_now
import os
import json
import urllib.request
import urllib.parse
import urllib.error

saskat_bp = Blueprint('saskat_bp', __name__)

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
SERPER_API_KEY = os.environ.get('SERPER_API_KEY', '')


def _call_gemini(messages):
    if not GEMINI_API_KEY:
        return None
    gemini_contents = []
    system_instruction = None
    for m in messages:
        if m['role'] == 'system':
            system_instruction = m['content']
            continue
        role = 'user' if m['role'] == 'user' else 'model'
        gemini_contents.append({"role": role, "parts": [{"text": m['content']}]})

    if not gemini_contents:
        return None

    payload_dict = {
        "contents": gemini_contents,
        "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.85},
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ]
    }
    if system_instruction:
        payload_dict["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    payload = json.dumps(payload_dict).encode()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read().decode())
        return data['candidates'][0]['content']['parts'][0]['text']
    except Exception:
        return None


def _call_groq(messages):
    if not GROQ_API_KEY:
        return None
    payload = json.dumps({
        "model": "llama-3.3-70b-versatile",
        "messages": messages,
        "max_tokens": 1024,
        "temperature": 0.85,
    }).encode()
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
        method="POST"
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read().decode())
        return data['choices'][0]['message']['content']
    except Exception:
        return None


def _call_openai(messages):
    if not OPENAI_API_KEY:
        return None
    payload = json.dumps({
        "model": "gpt-4o-mini",
        "messages": messages,
        "max_tokens": 1024,
        "temperature": 0.85,
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
        method="POST"
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read().decode())
        return data['choices'][0]['message']['content']
    except Exception:
        return None


def _get_ai_reply(messages):
    """Try Gemini first (confirmed working), then Groq, then OpenAI."""
    result = _call_gemini(messages)
    if result:
        return result

    result = _call_groq(messages)
    if result:
        return result

    result = _call_openai(messages)
    if result:
        return result

    return "Sorry, AI is temporarily unavailable. Please try again."


def _web_search(query):
    if not SERPER_API_KEY:
        return None
    payload = json.dumps({"q": query, "num": 5}).encode()
    req = urllib.request.Request(
        "https://google.serper.dev/search",
        data=payload,
        headers={"X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json"},
        method="POST"
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read().decode())
        results = data.get('organic', [])[:4]
        return [{"title": r.get('title', ''), "snippet": r.get('snippet', ''), "link": r.get('link', '')} for r in results]
    except Exception:
        return None


def _ad_for_query(query):
    """Realtime catalog retrieval: only aggregate ad metrics are persisted, never the query."""
    from routes.admin_bp import Ad
    terms = set(re.findall(r"[\w']{3,}", query.lower()))
    candidates = []
    for ad in Ad.query.all():
        keywords = ad.keywords if isinstance(ad.keywords, list) else []
        ad_terms = set(re.findall(r"[\w']{2,}", ' '.join(map(str, keywords)).lower()))
        score = len(terms & ad_terms)
        if score:
            candidates.append((score, ad))
    if not candidates:
        return None
    _, ad = max(candidates, key=lambda item: (item[0], item[1].updated_at or item[1].created_at))
    ad.impressions = (ad.impressions or 0) + 1
    db.session.commit()
    return ad.to_dict()


@saskat_bp.route('/api/saskat/chat', methods=['POST'])
def saskat_chat():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    data = get_json_data()
    message = (data.get('message') or '').strip()
    if not message:
        return jsonify({'error': 'Message is required'}), 400
    if len(message) > 8000:
        return jsonify({'error': 'Message too long'}), 400
    history = data.get('history') if isinstance(data.get('history'), list) else []
    # Saskat is session-only: the browser sends a small current-session context,
    # but neither the question nor the answer is written to the database.
    safe_history = [
        {'role': item.get('role'), 'content': str(item.get('content') or '')[:4000]}
        for item in history[-8:]
        if item.get('role') in ('user', 'assistant') and str(item.get('content') or '').strip()
    ]

    try:
        context_msg = message
        sources = []
        search_results = _web_search(message)
        if search_results:
            sources = search_results
            context_msg = (
                f"{message}\n\n[Fresh web research — cite the source titles you rely on:\n"
                + "\n".join([f"- {r['title']}: {r['snippet']}" for r in search_results])
                + "]"
            )

        messages = [
            {
                "role": "system",
                "content": (
                    "You are Saskat AI, a thoughtful, capable research assistant inside CHEETCHAT. "
                    "Speak naturally, warmly and intelligently in the user's Hindi, Hinglish or English. "
                    "Give direct, well-structured answers with useful nuance, practical next steps and uncertainty where appropriate. "
                    "When fresh web research is supplied, ground claims in it; never invent sources. "
                    "For health, skin, medical, money or safety topics, avoid guarantees and encourage qualified professional advice when appropriate."
                )
            }
        ]
        messages.extend(safe_history)
        messages.append({"role": "user", "content": context_msg})

        response = _get_ai_reply(messages)
        user = User.query.get(user_id)
        premium_active = bool(user and user.is_premium and (not user.premium_expires_at or user.premium_expires_at > utc_now()))
        # Advertising must never interrupt the assistant.  A missing legacy ad
        # table, bad catalog row, or metrics failure simply means no ad.
        ad = None
        if not premium_active:
            try:
                ad = _ad_for_query(message)
            except Exception:
                db.session.rollback()

        return jsonify({
            'response': response,
            'sources': sources,
            'searched': bool(search_results),
            'ad': ad,
            'ephemeral': True,
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@saskat_bp.route('/api/ai/image/generate', methods=['POST'])
def generate_image():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    data = get_json_data()
    prompt = (data.get('prompt') or '').strip()
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    encoded = urllib.parse.quote(prompt)
    image_url = f"https://image.pollinations.ai/prompt/{encoded}?width=512&height=512&nologo=true"
    return jsonify({'images': [{'url': image_url}]}), 200


@saskat_bp.route('/api/ai/ads/get-contextual-ad', methods=['POST'])
def get_contextual_ad():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    user = User.query.get(user_id)
    if user and user.is_premium and (not user.premium_expires_at or user.premium_expires_at > utc_now()):
        return jsonify({'ad': None}), 200
    query = str(get_json_data().get('query') or '').strip()[:8000]
    try:
        ad = _ad_for_query(query) if query else None
    except Exception:
        db.session.rollback()
        ad = None
    return jsonify({'ad': ad}), 200


@saskat_bp.route('/api/saskat/ads/<int:ad_id>/click', methods=['POST'])
def saskat_ad_click(ad_id):
    if not get_current_user_id():
        return jsonify({'error': 'Unauthorized'}), 401
    from routes.admin_bp import Ad
    ad = db.session.get(Ad, ad_id)
    if not ad:
        return jsonify({'error': 'Ad not found'}), 404
    ad.clicks = (ad.clicks or 0) + 1
    db.session.commit()
    return jsonify({'ok': True}), 200
