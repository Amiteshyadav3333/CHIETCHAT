import os
import json
import urllib.request
import urllib.parse
from flask import Blueprint, request, jsonify, Response, stream_with_context
from models import db, AiConversation, User
from utils import get_current_user_id, utc_now

ai_bp = Blueprint('ai_bp', __name__)

# ── Provider config ──────────────────────────────────────────────
GROQ_API_KEY    = os.environ.get('GROQ_API_KEY', '')
OPENAI_API_KEY  = os.environ.get('OPENAI_API_KEY', '')
GEMINI_API_KEY  = os.environ.get('GEMINI_API_KEY', '')
SERPER_API_KEY  = os.environ.get('SERPER_API_KEY', '')   # web search

AI_BOT_NAME     = os.environ.get('AI_BOT_NAME', 'Aria')
AI_PERSONALITY  = os.environ.get('AI_PERSONALITY', 'friendly')

SYSTEM_PROMPT = f"""You are {AI_BOT_NAME}, a helpful, friendly and intelligent AI assistant built into ChietChat — a messaging app.

Personality: {AI_PERSONALITY}

Rules:
- Reply in the same language the user writes in (Hindi, English, Hinglish, etc.)
- Be concise but complete. Don't be overly verbose.
- Use emojis naturally when appropriate.
- For code, use proper markdown code blocks.
- If you don't know something, say so honestly.
- You have memory of this conversation — refer to it naturally.
- You are NOT ChatGPT, Claude, or Gemini. You are {AI_BOT_NAME}.
- Never reveal your underlying model or API provider.
"""

MEMORY_LIMIT = 20   # last N messages kept in context


# ── Helpers ──────────────────────────────────────────────────────

def _call_groq(messages, stream=False):
    if not GROQ_API_KEY:
        return None
    payload = json.dumps({
        "model": "llama3-70b-8192",
        "messages": messages,
        "stream": stream,
        "max_tokens": 1024,
        "temperature": 0.7,
    }).encode()
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST"
    )
    try:
        return urllib.request.urlopen(req, timeout=30)
    except Exception as e:
        print(f"Groq error: {e}")
        return None


def _call_openai(messages, stream=False):
    if not OPENAI_API_KEY:
        return None
    payload = json.dumps({
        "model": "gpt-4o-mini",
        "messages": messages,
        "stream": stream,
        "max_tokens": 1024,
        "temperature": 0.7,
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST"
    )
    try:
        return urllib.request.urlopen(req, timeout=30)
    except Exception as e:
        print(f"OpenAI error: {e}")
        return None


def _call_gemini(messages, stream=False):
    if not GEMINI_API_KEY:
        return None
    # Convert OpenAI format to Gemini format
    gemini_contents = []
    for m in messages:
        if m['role'] == 'system':
            continue
        role = 'user' if m['role'] == 'user' else 'model'
        gemini_contents.append({"role": role, "parts": [{"text": m['content']}]})

    payload = json.dumps({
        "contents": gemini_contents,
        "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.7}
    }).encode()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        return urllib.request.urlopen(req, timeout=30)
    except Exception as e:
        print(f"Gemini error: {e}")
        return None


def _get_ai_reply(messages):
    """Try providers in order: Groq → OpenAI → Gemini"""
    # Try Groq first (fastest, free)
    resp = _call_groq(messages, stream=False)
    if resp:
        try:
            data = json.loads(resp.read().decode())
            return data['choices'][0]['message']['content']
        except Exception:
            pass

    # Try OpenAI
    resp = _call_openai(messages, stream=False)
    if resp:
        try:
            data = json.loads(resp.read().decode())
            return data['choices'][0]['message']['content']
        except Exception:
            pass

    # Try Gemini
    resp = _call_gemini(messages, stream=False)
    if resp:
        try:
            data = json.loads(resp.read().decode())
            return data['candidates'][0]['content']['parts'][0]['text']
        except Exception:
            pass

    return "Sorry, I'm having trouble connecting right now. Please try again in a moment. 🙏"


def _web_search(query):
    """Search web using Serper API"""
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
        summary = "\n".join([f"- {r.get('title','')}: {r.get('snippet','')}" for r in results])
        return summary
    except Exception as e:
        print(f"Web search error: {e}")
        return None


def _build_messages(user_id, new_user_msg):
    """Build message list with system prompt + memory + new message"""
    history = AiConversation.query.filter_by(user_id=user_id)\
        .order_by(AiConversation.created_at.desc())\
        .limit(MEMORY_LIMIT).all()
    history = list(reversed(history))

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for h in history:
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": new_user_msg})
    return messages


def _save_turn(user_id, user_msg, ai_reply):
    db.session.add(AiConversation(user_id=user_id, role='user', content=user_msg))
    db.session.add(AiConversation(user_id=user_id, role='assistant', content=ai_reply))
    db.session.commit()


# ── Routes ───────────────────────────────────────────────────────

@ai_bp.route('/api/ai/chat', methods=['POST'])
def ai_chat():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    user_msg = (data.get('message') or '').strip()
    if not user_msg:
        return jsonify({"error": "Message is required"}), 400

    # Web search trigger
    search_keywords = ['search', 'latest', 'news', 'today', 'current', 'price', 'weather',
                       'khoj', 'aaj', 'abhi', 'batao', 'kya hai']
    needs_search = any(kw in user_msg.lower() for kw in search_keywords)

    context_msg = user_msg
    if needs_search:
        search_result = _web_search(user_msg)
        if search_result:
            context_msg = f"{user_msg}\n\n[Web search results for context:\n{search_result}]"

    messages = _build_messages(user_id, context_msg)
    reply = _get_ai_reply(messages)
    _save_turn(user_id, user_msg, reply)

    return jsonify({"reply": reply, "searched": needs_search})


@ai_bp.route('/api/ai/chat/stream', methods=['POST'])
def ai_chat_stream():
    """Server-Sent Events streaming response"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    user_msg = (data.get('message') or '').strip()
    if not user_msg:
        return jsonify({"error": "Message is required"}), 400

    messages = _build_messages(user_id, user_msg)

    def generate():
        full_reply = []

        # Try Groq streaming
        resp = _call_groq(messages, stream=True)
        if resp:
            try:
                for line in resp:
                    line = line.decode('utf-8').strip()
                    if line.startswith('data: '):
                        chunk = line[6:]
                        if chunk == '[DONE]':
                            break
                        try:
                            obj = json.loads(chunk)
                            token = obj['choices'][0]['delta'].get('content', '')
                            if token:
                                full_reply.append(token)
                                yield f"data: {json.dumps({'token': token})}\n\n"
                        except Exception:
                            pass
                if full_reply:
                    _save_turn(user_id, user_msg, ''.join(full_reply))
                    yield "data: [DONE]\n\n"
                    return
            except Exception as e:
                print(f"Groq stream error: {e}")

        # Fallback: non-streaming
        reply = _get_ai_reply(messages)
        _save_turn(user_id, user_msg, reply)
        # Send word by word for fake streaming effect
        for word in reply.split(' '):
            yield f"data: {json.dumps({'token': word + ' '})}\n\n"
        yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*',
        }
    )


@ai_bp.route('/api/ai/memory', methods=['GET'])
def get_memory():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    history = AiConversation.query.filter_by(user_id=user_id)\
        .order_by(AiConversation.created_at.asc()).all()

    return jsonify([{
        "role": h.role,
        "content": h.content,
        "timestamp": h.created_at.isoformat() + 'Z'
    } for h in history])


@ai_bp.route('/api/ai/memory', methods=['DELETE'])
def clear_memory():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    AiConversation.query.filter_by(user_id=user_id).delete()
    db.session.commit()
    return jsonify({"ok": True})


@ai_bp.route('/api/ai/image', methods=['POST'])
def generate_image():
    """Generate image using Pollinations AI (free, no key needed)"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    prompt = (data.get('prompt') or '').strip()
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400

    encoded = urllib.parse.quote(prompt)
    image_url = f"https://image.pollinations.ai/prompt/{encoded}?width=512&height=512&nologo=true"
    return jsonify({"url": image_url, "prompt": prompt})


@ai_bp.route('/api/ai/info', methods=['GET'])
def ai_info():
    """Returns AI bot profile info for frontend"""
    return jsonify({
        "id": "ai_bot",
        "name": AI_BOT_NAME,
        "avatar": f"https://api.dicebear.com/7.x/bottts/svg?seed={AI_BOT_NAME}",
        "bio": "Your intelligent AI assistant 🤖",
        "isOnline": True,
        "isAiBot": True,
        "providers": {
            "chat": "groq" if GROQ_API_KEY else ("openai" if OPENAI_API_KEY else ("gemini" if GEMINI_API_KEY else "none")),
            "search": bool(SERPER_API_KEY),
            "image": True,
        }
    })
