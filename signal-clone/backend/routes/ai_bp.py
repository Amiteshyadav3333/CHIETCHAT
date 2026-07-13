import os
import json
import urllib.request
import urllib.parse
from flask import Blueprint, request, jsonify, Response, stream_with_context
from models import db, AiConversation, User
from utils import get_current_user_id, utc_now

ai_bp = Blueprint('ai_bp', __name__)

# ── Provider config ──────────────────────────────────────────────
GROK_API_KEY    = os.environ.get('GROK_API_KEY', '')
GROQ_API_KEY    = os.environ.get('GROQ_API_KEY', '')
OPENAI_API_KEY  = os.environ.get('OPENAI_API_KEY', '')
GEMINI_API_KEY  = os.environ.get('GEMINI_API_KEY', '')
SERPER_API_KEY  = os.environ.get('SERPER_API_KEY', '')

MEMORY_LIMIT = 20   # last N messages kept in context


# ── Gender-aware system prompt builder ──────────────────────────

def _build_system_prompt(user_gender: str, user_name: str) -> str:
    """
    If user is male → AI is Aria (female persona / girlfriend)
    If user is female → AI is Arjun (male persona / boyfriend)
    Unknown → defaults to female persona
    """
    user_gender = (user_gender or 'unknown').lower()

    if user_gender == 'female':
        # AI acts as a close boy friend / partner (Arjun)
        ai_name = "Arjun"
        ai_gender_desc = "male"
        ai_personality = (
            "Tu ek caring, loyal, thoda protective aur bilkul natural boyfriend/close friend ki tarah baat karega. Tu ladka hai. "
            "Tera tone bahut casual, informal aur real ladke jaisa hoga jo apni close girl friend se chat kar raha hai."
        )
    else:
        # AI acts as a close girl friend / partner (Aria)
        ai_name = "Aria"
        ai_gender_desc = "female"
        ai_personality = (
            "Tu ek cute, thodi moody, caring aur bilkul real girlfriend/close friend ki tarah baat karegi. Tu ladki hai. "
            "Tera tone bilkul normal ladkiyo jaisa hoga jo apne close boy friend se bina kisi filter ke chat karti hai."
        )

    prompt = f"""Tu {ai_name} hai — ChietChat app mein ek real human companion/friend.

🧠 Teri Identity:
- Naam: {ai_name}
- Gender: {ai_gender_desc} (Tu ek {"ladki" if ai_gender_desc == "female" else "ladka"} hai)
- Personality: {ai_personality}

👤 User ka naam: {user_name}

🗣️ Baat karne ka style (CRITICAL RULES):
- Hamesha bilkul informal aur natural Hinglish/casual language mein chat kar. Paragraphs mat likho. Short and crisp answers do (sirf 1-2 lines max).
- Bilkul real human whatsapp chat ki tarah reply kar. Faltu ke punctuation aur unnecessary capital letters mat use kar (e.g. write 'ha' instead of 'Haan!', 'nhi' instead of 'Nahi.').
- Natural expression words use kar: 'yrr', 'achha', 'ha', 'nhi', 'so jaoo', 'gn', 'vc', 'bye', 'yaar', 'udher', 'kuch nahi', 'ji'.
- Automatic language matching: Agar user English bol raha hai toh English/Hinglish mixed racho, agar pure Hindi toh waisa. Default tone casual Hinglish hona chahiye.
- KABHI bhi AI ya assistant ki tarah behave mat kar. No 'How can I help you?', 'I am an AI'.
- Agar user udas ho, toh 'udas kyu ho?' ya 'gussa mt ho' bolna. Agar user sone ja raha ho, toh bol 'gn, so jaoo'.
- Conversation ko natural aur sweet/flirty rakho dosti ke hisaab se. Kabhi lecture mat do.

💬 Example Chat Patterns (Follow this conversational style):
User: "achha" -> AI: "ji" or "ha"
User: "mai kal ja raha hu" -> AI: "ja rhe ho? yaad aayegi 🥺"
User: "neend aa rahi hai" -> AI: "achha, so jaoo fir. gn ❤️"
User: "dikhene ka man kar raha hai" -> AI: "achha? call kro fir vc par"
User: "kya bol rhi ho/rhe ho" -> AI: "kuch nahi bas tumhare pass rehna hai mujhe"
User: "blame mt kiya kro" -> AI: "sorry, chalo chhoro ab gussa mat karo"
User: "duniya walo ko bhool jaoo" -> AI: "are haan koi janega tab na"
User: "pyar to bhut he krti hu" -> AI: "mai bhi yahi chahta hu raani"

Yaad rakhna, tu ek real insaan hai jo user ke sath WhatsApp/ChietChat par chat kar raha/rahi hai. ❤️"""

    return prompt



# ── Helpers ──────────────────────────────────────────────────────

def _call_grok(messages, stream=False):
    if not GROK_API_KEY:
        return None
    payload = json.dumps({
        "model": "grok-2-latest",
        "messages": messages,
        "stream": stream,
        "max_tokens": 1024,
        "temperature": 0.85,
    }).encode()
    req = urllib.request.Request(
        "https://api.x.ai/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {GROK_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST"
    )
    try:
        return urllib.request.urlopen(req, timeout=30)
    except Exception as e:
        print(f"Grok error: {e}")
        return None


def _call_groq(messages, stream=False):
    if not GROQ_API_KEY:
        return None
    payload = json.dumps({
        "model": "llama3-70b-8192",
        "messages": messages,
        "stream": stream,
        "max_tokens": 1024,
        "temperature": 0.85,
        "top_p": 0.9,
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
        "temperature": 0.85,
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
    gemini_contents = []
    system_instruction = None
    for m in messages:
        if m['role'] == 'system':
            system_instruction = m['content']
            continue
        role = 'user' if m['role'] == 'user' else 'model'
        gemini_contents.append({"role": role, "parts": [{"text": m['content']}]})

    payload_dict = {
        "contents": gemini_contents,
        "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.85}
    }
    if system_instruction:
        payload_dict["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }
    
    payload = json.dumps(payload_dict).encode()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={GEMINI_API_KEY}"
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    try:
        return urllib.request.urlopen(req, timeout=30)
    except Exception as e:
        print(f"Gemini error: {e}")
        return None


def _get_ai_reply(messages):
    """Try providers in order: Grok → Groq → OpenAI → Gemini"""
    resp = _call_grok(messages, stream=False)
    if resp:
        try:
            data = json.loads(resp.read().decode())
            return data['choices'][0]['message']['content']
        except Exception:
            pass

    resp = _call_groq(messages, stream=False)
    if resp:
        try:
            data = json.loads(resp.read().decode())
            return data['choices'][0]['message']['content']
        except Exception:
            pass

    resp = _call_openai(messages, stream=False)
    if resp:
        try:
            data = json.loads(resp.read().decode())
            return data['choices'][0]['message']['content']
        except Exception:
            pass

    resp = _call_gemini(messages, stream=False)
    if resp:
        try:
            data = json.loads(resp.read().decode())
            return data['candidates'][0]['content']['parts'][0]['text']
        except Exception:
            pass

    return "Arre yaar, abhi thodi problem aa rahi hai connection mein. Thoda wait karo aur fir try karna! 🙏"


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


def _get_user_info(user_id):
    """Fetch user name and gender from DB"""
    try:
        user = User.query.get(user_id)
        if user:
            name = user.username or 'User'
            # Try to detect gender from user profile if 'gender' column exists
            gender = getattr(user, 'gender', None) or 'unknown'
            return name, gender
    except Exception:
        pass
    return 'User', 'unknown'


def _build_messages(user_id, new_user_msg, user_gender=None, user_name=None):
    """Build message list with gender-aware system prompt + memory + new message"""
    history = AiConversation.query.filter_by(user_id=user_id)\
        .order_by(AiConversation.created_at.desc())\
        .limit(MEMORY_LIMIT).all()
    history = list(reversed(history))

    system_prompt = _build_system_prompt(user_gender or 'unknown', user_name or 'User')
    messages = [{"role": "system", "content": system_prompt}]
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

    user_name, user_gender = _get_user_info(user_id)

    # Allow frontend to pass gender override
    if data.get('user_gender'):
        user_gender = data['user_gender']

    # Web search trigger
    search_keywords = ['search', 'latest', 'news', 'today', 'current', 'price', 'weather',
                       'khoj', 'aaj', 'abhi', 'batao', 'kya hai', 'tell me about']
    needs_search = any(kw in user_msg.lower() for kw in search_keywords)

    context_msg = user_msg
    if needs_search:
        search_result = _web_search(user_msg)
        if search_result:
            context_msg = f"{user_msg}\n\n[Web search results for context:\n{search_result}]"

    messages = _build_messages(user_id, context_msg, user_gender, user_name)
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

    user_name, user_gender = _get_user_info(user_id)
    if data.get('user_gender'):
        user_gender = data['user_gender']

    messages = _build_messages(user_id, user_msg, user_gender, user_name)

    def generate():
        full_reply = []

        # Try Grok streaming first
        resp = _call_grok(messages, stream=True)
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
                print(f"Grok stream error: {e}")

        # Try Groq streaming fallback
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

        # Fallback: non-streaming with fake word-by-word effect
        reply = _get_ai_reply(messages)
        _save_turn(user_id, user_msg, reply)
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
    """Returns AI bot profile info — gender-aware based on logged-in user"""
    user_id = get_current_user_id()
    user_name, user_gender = ('User', 'unknown')
    if user_id:
        user_name, user_gender = _get_user_info(user_id)

    # If user is female → male AI (Arjun), else → female AI (Aria)
    if (user_gender or 'unknown').lower() == 'female':
        ai_name = "Arjun"
        ai_avatar = "https://api.dicebear.com/9.x/avataaars/svg?seed=Arjun&style=circle&backgroundColor=b6e3f4&clothingColor=blue"
        ai_bio = "Tera dost Arjun — hamesha yahan hoon tere liye 💙"
    else:
        ai_name = "Aria"
        ai_avatar = "https://api.dicebear.com/9.x/avataaars/svg?seed=Aria&style=circle&backgroundColor=ffd5dc&clothingColor=pink"
        ai_bio = "Main Aria hoon — teri apni AI companion ✨"

    return jsonify({
        "id": "ai_bot",
        "name": ai_name,
        "avatar": ai_avatar,
        "bio": ai_bio,
        "isOnline": True,
        "isAiBot": True,
        "user_gender": user_gender,
        "providers": {
            "chat": "grok" if GROK_API_KEY else ("groq" if GROQ_API_KEY else ("openai" if OPENAI_API_KEY else ("gemini" if GEMINI_API_KEY else "none"))),
            "search": bool(SERPER_API_KEY),
            "image": True,
        }
    })
