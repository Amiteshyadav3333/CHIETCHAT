from flask import Blueprint, jsonify
from utils import get_current_user_id, get_json_data
from models import db, AiConversation
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


def _save_turn(user_id, user_msg, ai_reply):
    try:
        db.session.add(AiConversation(user_id=user_id, role='user', content=user_msg))
        db.session.add(AiConversation(user_id=user_id, role='assistant', content=ai_reply))
        db.session.commit()
    except Exception:
        pass


@saskat_bp.route('/api/ai/chat', methods=['POST'])
def ai_chat():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    data = get_json_data()
    message = (data.get('message') or '').strip()
    if not message:
        return jsonify({'error': 'Message is required'}), 400
    if len(message) > 8000:
        return jsonify({'error': 'Message too long'}), 400

    try:
        search_keywords = ['search', 'latest', 'news', 'today', 'current', 'price', 'weather',
                           'khoj', 'aaj', 'abhi', 'batao']
        needs_search = any(kw in message.lower() for kw in search_keywords)

        context_msg = message
        sources = []
        if needs_search:
            search_results = _web_search(message)
            if search_results:
                sources = search_results
                context_msg = (
                    f"{message}\n\n[Web search results:\n"
                    + "\n".join([f"- {r['title']}: {r['snippet']}" for r in search_results])
                    + "]"
                )

        messages = [
            {
                "role": "system",
                "content": (
                    "You are Saskat AI, a helpful and knowledgeable assistant built into ChietChat. "
                    "Answer clearly and concisely. Support Hindi, Hinglish, and English. "
                    "When web search results are provided, use them to give accurate answers."
                )
            },
            {"role": "user", "content": context_msg}
        ]

        response = _get_ai_reply(messages)
        _save_turn(user_id, message, response)

        return jsonify({
            'response': response,
            'sources': sources,
            'searched': needs_search
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
    return jsonify({}), 200
