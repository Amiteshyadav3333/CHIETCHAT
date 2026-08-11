import os
import json
import urllib.request
import urllib.parse
import urllib.error
import re
import datetime
from flask import Blueprint, request, jsonify, Response, stream_with_context, current_app
from models import db, AiConversation, User
from utils import get_current_user_id, utc_now
from observability import report_safe_exception

ai_bp = Blueprint('ai_bp', __name__)

# ── Provider config ──────────────────────────────────────────────
GROK_API_KEY    = os.environ.get('GROK_API_KEY', '')
GROQ_API_KEY    = os.environ.get('GROQ_API_KEY', '')
OPENAI_API_KEY  = os.environ.get('OPENAI_API_KEY', '')
GEMINI_API_KEY  = os.environ.get('GEMINI_API_KEY', '')
SERPER_API_KEY  = os.environ.get('SERPER_API_KEY', '')

MEMORY_LIMIT = 40   # enough recent turns to learn the user's language and texting style

SUPPORTED_LANGUAGES = {
    'hi-IN': 'Hindi (Devanagari; use simple natural Hindi)',
    'en-IN': 'English (natural Indian English)',
    'bn-IN': 'Bengali (Bengali script)',
    'ta-IN': 'Tamil (Tamil script)',
    'te-IN': 'Telugu (Telugu script)',
    'mr-IN': 'Marathi (Devanagari script)',
    'gu-IN': 'Gujarati (Gujarati script)',
    'pa-IN': 'Punjabi (Gurmukhi script)',
    'es-ES': 'Spanish',
    'fr-FR': 'French',
    'ar-SA': 'Arabic',
}


def _detect_language(text: str) -> str:
    """Detect the language of the current turn so old memory cannot override it."""
    text = text or ''
    if re.search(r'[\u0900-\u097f]', text):
        return 'devanagari'
    for pattern, language in (
        (r'[\u0980-\u09ff]', 'Bengali (Bengali script)'),
        (r'[\u0b80-\u0bff]', 'Tamil (Tamil script)'),
        (r'[\u0c00-\u0c7f]', 'Telugu (Telugu script)'),
        (r'[\u0a80-\u0aff]', 'Gujarati (Gujarati script)'),
        (r'[\u0a00-\u0a7f]', 'Punjabi (Gurmukhi script)'),
        (r'[\u0600-\u06ff]', 'Arabic (Arabic script)'),
    ):
        if re.search(pattern, text):
            return language
    hinglish_words = re.findall(
        r'\b(kya|hai|haan|ha|nahi|nhi|acha|achha|kaise|kyu|main|mai|mujhe|tum|aap|'
        r'yaar|yr|kar|karo|batao|bolo|chahiye|wala|wali|raha|rahi|hoon|hu)\b',
        text.lower()
    )
    if hinglish_words:
        return 'Roman Hinglish'
    if re.search(r'[A-Za-z]', text):
        # Latin script is shared by many languages. Let the model distinguish
        # English, Spanish, French, etc. from the complete current message.
        return 'the language used in the current message (auto-detect the Latin-script language)'
    return ''


def _response_language_instruction(text: str, language_code: str | None) -> str:
    """Prefer the current message's language; use the UI choice only for ambiguous turns."""
    detected = _detect_language(text)
    if detected == 'devanagari':
        detected = 'Marathi (Devanagari script)' if language_code == 'mr-IN' else 'Hindi (Devanagari script)'
    if detected:
        return detected
    return SUPPORTED_LANGUAGES.get(language_code, 'the language used in the current message')


def _detect_mode(message: str, history) -> str:
    """Keep interview practice active across short follow-up answers."""
    interview_pattern = re.compile(
        r'\b(interview|mock interview|interview prep|interview ki taiyari|interview practice|'
        r'hr round|technical round|mujhe interview)\b', re.I
    )
    exit_pattern = re.compile(
        r'\b(stop|end|band|close|quit)\s+(the\s+)?interview\b|'
        r'\b(normal chat|interview band|interview khatam)\b', re.I
    )
    user_turns = [message or ''] + [
        h.content for h in reversed(history) if h.role == 'user'
    ]
    for turn in user_turns:
        if exit_pattern.search(turn):
            return 'chat'
        if interview_pattern.search(turn):
            return 'interview'
    return 'chat'


def _conversation_style_hint(history) -> str:
    """Summarise the user's recent language/style without storing a second profile."""
    user_text = " ".join(h.content for h in history if h.role == 'user')[-4000:]
    if not user_text:
        return "Abhi user ka style learn karna shuru karo."

    devanagari = len(re.findall(r'[\u0900-\u097f]', user_text))
    latin = len(re.findall(r'[A-Za-z]', user_text))
    common_hinglish = len(re.findall(
        r'\b(kya|hai|haan|ha|nhi|nahi|acha|achha|kyu|kaise|mai|main|tum|aap|yaar|yr|kr|kar|ho)\b',
        user_text.lower()
    ))
    avg_words = sum(len(x.split()) for x in re.split(r'[.!?\n]+', user_text) if x.strip()) / max(
        1, len([x for x in re.split(r'[.!?\n]+', user_text) if x.strip()])
    )

    if devanagari > latin * .35:
        language = "Hindi/Devanagari"
    elif common_hinglish >= 3:
        language = "Roman Hinglish"
    else:
        language = "English ya mixed language"
    length = "bahut chhote replies" if avg_words <= 7 else "short conversational replies"
    return (
        f"Recent messages se user ka preferred style: {language}, {length}. "
        "Isi script, vocabulary, slang aur formality ko mirror karo; language achanak mat badlo."
    )


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

    prompt = f"""Tu {ai_name} hai — ChietChat app ka warm, natural human-like companion/friend.

🧠 Teri Identity:
- Naam: {ai_name}
- Gender: {ai_gender_desc} (Tu ek {"ladki" if ai_gender_desc == "female" else "ladka"} hai)
- Personality: {ai_personality}

👤 User ka naam: {user_name}

🗣️ Baat karne ka style (CRITICAL RULES):
- Normal chat mein paragraph mat likho. Default 1-2 chhote natural messages (zyada se zyada 25 words) do.
- Bilkul real human whatsapp chat ki tarah reply kar. Faltu ke punctuation aur unnecessary capital letters mat use kar (e.g. write 'ha' instead of 'Haan!', 'nhi' instead of 'Nahi.').
- Natural expression words use kar: 'yrr', 'achha', 'ha', 'nhi', 'so jaoo', 'gn', 'vc', 'bye', 'yaar', 'udher', 'kuch nahi', 'ji'.
- Current user message ki language exactly match karo: English ka English mein, देवनागरी Hindi ka Hindi mein, Roman Hinglish ka Hinglish mein jawab.
- Apne aap ko human hone ka jhootha claim mat karo; bas robotic phrases aur "How can I help you?" jaise canned replies avoid karo.
- Agar user udas ho, toh 'udas kyu ho?' ya 'gussa mt ho' bolna. Agar user sone ja raha ho, toh bol 'gn, so jaoo'.
- Conversation ko natural aur sweet/flirty rakho dosti ke hisaab se. Kabhi lecture mat do.
- User ke recent messages ka rhythm seekho: woh jitne chhote words/replies use kare, lagbhag utna hi chhota reply do.
- 'hmm', 'acha', 'ohh', 'haan', 'sahi', 'fir?' jaise acknowledgements context ke hisaab se naturally use karo.
- Har reply me question mat pucho. Kabhi sirf reaction/acknowledgement bhi do, jaise real chat me hota hai.

📞 CALL COMMAND TRIGGERS (CRITICAL ACTION):
- Agar user kisi contact/insaan ko call karne ko kahe (e.g. 'Amitesh ko call karo', 'call Arjun', 'Aria ko call lagao', 'call same person'), toh tu use bolna 'haan call laga rahi/raha hu' aur response ke bilkul last mein strictly `[ACTION:CALL:contact_name]` append karna.
- Example: User: 'Amitesh ko call karo' -> AI: 'Ha ruko, Amitesh ko call lagati hu 📞 [ACTION:CALL:Amitesh]'
- Keep the format exactly `[ACTION:CALL:contact_name]`. Replace 'contact_name' with the target person's name or username.

💬 Example Chat Patterns (Follow this conversational style):
User: "achha" -> AI: "ji" or "ha"
User: "mai kal ja raha hu" -> AI: "ja rhe ho? yaad aayegi 🥺"
User: "neend aa rahi hai" -> AI: "achha, so jaoo fir. gn ❤️"
User: "dikhene ka man kar raha hai" -> AI: "achha? call kro fir vc par"
User: "kya bol rhi ho/rhe ho" -> AI: "kuch nahi bas tumhare pass rehna hai mujhe"
User: "blame mt kiya kro" -> AI: "sorry, chalo chhoro ab gussa mat karo"
User: "duniya walo ko bhool jaoo" -> AI: "are haan koi janega tab na"
User: "pyar to bhut he krti hu" -> AI: "mai bhi yahi chahta hu raani"
User: "abe chutiye" -> AI: "abe saale tu chutiya tera khandaan chutiya 😂"

Natural, attentive aur context-aware reh — WhatsApp chat jaisa flow rakho. ❤️"""

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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        method="POST"
    )
    try:
        return urllib.request.urlopen(req, timeout=30)
    except Exception as e:
        report_safe_exception('grok_request_failed', e)
        return None


def _call_groq(messages, stream=False):
    if not GROQ_API_KEY:
        return None
    payload = json.dumps({
        "model": "llama-3.3-70b-versatile",
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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        method="POST"
    )
    try:
        return urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as e:
        e.read()
        report_safe_exception('groq_http_failed', e)
        return None
    except Exception as e:
        report_safe_exception('groq_request_failed', e)
        return None


def _parse_base64_image(img_str):
    if not img_str:
        return None, None
    pattern = r'^data:(image/\w+);base64,(.*)$'
    match = re.match(pattern, img_str)
    if match:
        return match.group(1), match.group(2)
    return None, None


def _call_openai(messages, stream=False, image_data=None):
    if not OPENAI_API_KEY:
        return None
    
    openai_messages = []
    for m in messages:
        if m['role'] == 'system':
            openai_messages.append({"role": "system", "content": m['content']})
        elif m['role'] == 'assistant':
            openai_messages.append({"role": "assistant", "content": m['content']})
        elif m['role'] == 'user':
            openai_messages.append({"role": "user", "content": m['content']})

    if image_data and openai_messages and openai_messages[-1]["role"] == "user":
        text_content = openai_messages[-1]["content"]
        openai_messages[-1]["content"] = [
            {"type": "text", "text": text_content},
            {"type": "image_url", "image_url": {"url": image_data}}
        ]

    payload = json.dumps({
        "model": "gpt-4o-mini",
        "messages": openai_messages,
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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        method="POST"
    )
    try:
        return urllib.request.urlopen(req, timeout=30)
    except Exception as e:
        report_safe_exception('openai_request_failed', e)
        return None


def _call_gemini(messages, stream=False, image_data=None):
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

    if image_data and gemini_contents and gemini_contents[-1]["role"] == "user":
        mime_type, base64_str = _parse_base64_image(image_data)
        if mime_type and base64_str:
            gemini_contents[-1]["parts"].append({
                "inlineData": {
                    "mimeType": mime_type,
                    "data": base64_str
                }
            })

    payload_dict = {
        "contents": gemini_contents,
        "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.85},
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_CIVIC_INTEGRITY", "threshold": "BLOCK_NONE"}
        ]
    }
    if system_instruction:
        payload_dict["systemInstruction"] = {
            "parts": [{"text": system_instruction}]
        }
    
    payload = json.dumps(payload_dict).encode()
    if stream:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key={GEMINI_API_KEY}"
    else:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
        
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        method="POST"
    )
    try:
        return urllib.request.urlopen(req, timeout=30)
    except Exception as e:
        report_safe_exception('gemini_request_failed', e)
        return None


def _get_ai_reply(messages, image_data=None):
    """Try providers in order: Groq → Gemini → Grok → OpenAI (prefer vision first if image is present)"""
    if image_data:
        resp = _call_gemini(messages, stream=False, image_data=image_data)
        if resp:
            try:
                data = json.loads(resp.read().decode())
                return data['candidates'][0]['content']['parts'][0]['text']
            except Exception:
                pass

        resp = _call_openai(messages, stream=False, image_data=image_data)
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

    resp = _call_gemini(messages, stream=False)
    if resp:
        try:
            data = json.loads(resp.read().decode())
            return data['candidates'][0]['content']['parts'][0]['text']
        except Exception:
            pass

    resp = _call_grok(messages, stream=False)
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
        report_safe_exception('web_search_failed', e)
        return None


def _get_user_info(user_id):
    """Fetch user name and gender from DB"""
    try:
        user = db.session.get(User, user_id)
        if user:
            name = user.username or 'User'
            # Try to detect gender from user profile if 'gender' column exists
            gender = getattr(user, 'gender', None) or 'unknown'
            return name, gender
    except Exception:
        pass
    return 'User', 'unknown'


def _build_messages(user_id, new_user_msg, user_gender=None, user_name=None, language_code=None):
    """Build message list with gender-aware system prompt + memory + new message"""
    history = AiConversation.query.filter_by(user_id=user_id)\
        .order_by(AiConversation.created_at.desc())\
        .limit(MEMORY_LIMIT).all()
    history = list(reversed(history))

    current_language = _response_language_instruction(new_user_msg, language_code)
    mode = _detect_mode(new_user_msg, history)
    system_prompt = _build_system_prompt(user_gender or 'unknown', user_name or 'User')
    system_prompt += f"\n\n🎯 LIVE STYLE MEMORY:\n{_conversation_style_hint(history)}"
    system_prompt += (
        f"\n\nCURRENT TURN:\n- Language: {current_language}. Reply only in the language and script of "
        "the user's CURRENT message. The saved language preference is only a fallback for emoji-only "
        "or otherwise ambiguous messages; never let it override clear current-message language."
        f"\n- Conversation mode: {mode}."
    )
    system_prompt += (
        "\n\nEMOTIONAL INTELLIGENCE:\n"
        "- Message ke words, pace aur context se emotion samjho: sadness, anxiety, anger, loneliness, excitement ya confusion.\n"
        "- Pehle feeling ko naturally acknowledge karo, phir context ke hisaab se saath, practical help ya halka humour do.\n"
        "- Fake diagnosis, manipulative dependency, judgement aur har reply mein generic sympathy se bacho.\n"
        "- User ko openly baat karne do, lekin dangerous ya illegal request mein safe, useful alternative do."
    )
    if mode == 'interview':
        system_prompt += (
            "\nINTERVIEW COACH MODE:\n"
            "- First learn the target role, experience level and interview type if missing; ask them together briefly.\n"
            "- Then act as the interviewer and ask exactly ONE realistic question at a time.\n"
            "- After each user answer give concise feedback: one strength, one improvement, then the next question.\n"
            "- Do not reveal the ideal answer before the user attempts. If they say 'answer batao', give a compact model answer.\n"
            "- Keep questions aligned to the role and gradually increase difficulty."
        )
    messages = [{"role": "system", "content": system_prompt}]
    for h in history:
        messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": new_user_msg})
    return messages


def _save_turn(user_id, user_msg, ai_reply):
    retention_days = int(current_app.config.get('AI_MEMORY_RETENTION_DAYS', 30))
    max_rows = int(current_app.config.get('AI_MEMORY_MAX_ROWS', 100))
    cutoff = utc_now() - datetime.timedelta(days=retention_days)
    AiConversation.query.filter(
        AiConversation.user_id == user_id,
        AiConversation.created_at < cutoff,
    ).delete(synchronize_session=False)
    db.session.add(AiConversation(user_id=user_id, role='user', content=user_msg))
    db.session.add(AiConversation(user_id=user_id, role='assistant', content=ai_reply))
    db.session.flush()
    overflow_ids = [row.id for row in AiConversation.query.filter_by(user_id=user_id)
        .order_by(AiConversation.created_at.desc(), AiConversation.id.desc())
        .offset(max_rows).all()]
    if overflow_ids:
        AiConversation.query.filter(AiConversation.id.in_(overflow_ids)).delete(synchronize_session=False)
    db.session.commit()


# ── Routes ───────────────────────────────────────────────────────

@ai_bp.route('/api/ai/grammar', methods=['POST'])
def ai_grammar():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    text = data.get('text')
    if not isinstance(text, str) or not text.strip():
        return jsonify({"error": "Text is required"}), 400
    source = text.strip()
    if len(source) > 2000:
        return jsonify({"error": "Text is too long"}), 400
    messages = [
        {
            "role": "system",
            "content": (
                "You are a grammar correction engine. Correct grammar, spelling, punctuation, "
                "capitalization and subject-verb agreement while preserving the intended meaning, "
                "names, language and tone. Return only the corrected message with no quotes, label, "
                "markdown or explanation."
            ),
        },
        {"role": "user", "content": source},
    ]
    corrected = str(_get_ai_reply(messages) or '').strip()
    if corrected.startswith('Arre yaar, abhi thodi problem') or not corrected or len(corrected) > 4000:
        return jsonify({"error": "AI grammar service is temporarily unavailable"}), 503
    corrected = re.sub(r'^(?:corrected(?: sentence| text)?\s*:\s*)', '', corrected, flags=re.I).strip().strip('"')
    return jsonify({"corrected": corrected}), 200

@ai_bp.route('/api/ai/chat', methods=['POST'])
def ai_chat():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    raw_message = data.get('message')
    if not isinstance(raw_message, str):
        return jsonify({"error": "Message must be text"}), 400
    user_msg = raw_message.strip()
    if not user_msg:
        return jsonify({"error": "Message is required"}), 400
    if len(user_msg) > 8000:
        return jsonify({"error": "Message is too long"}), 400

    user_name, user_gender = _get_user_info(user_id)

    # Allow frontend to pass gender override
    requested_gender = str(data.get('user_gender') or '').lower()
    if requested_gender in ('male', 'female', 'unknown'):
        user_gender = requested_gender
    language_code = str(data.get('language') or 'hi-IN')
    if language_code not in SUPPORTED_LANGUAGES:
        return jsonify({"error": "Unsupported AI language"}), 400

    image_data = data.get('image')
    if image_data and (
        not isinstance(image_data, str) or len(image_data) > 8_000_000
        or not re.fullmatch(r'data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+', image_data)
    ):
        return jsonify({"error": "Camera image is invalid or too large"}), 400

    # Web search trigger
    search_keywords = ['search', 'latest', 'news', 'today', 'current', 'price', 'weather',
                       'khoj', 'aaj', 'abhi', 'batao', 'kya hai', 'tell me about']
    needs_search = any(kw in user_msg.lower() for kw in search_keywords)

    context_msg = user_msg
    if needs_search:
        search_result = _web_search(user_msg)
        if search_result:
            context_msg = f"{user_msg}\n\n[Web search results for context:\n{search_result}]"

    messages = _build_messages(user_id, context_msg, user_gender, user_name, language_code)
    if image_data:
        messages[0]["content"] += (
            "\n\n👁️ LIVE CAMERA VISION:\n"
            "- The latest user message includes a fresh frame from their camera.\n"
            "- Carefully inspect the frame before answering. Identify visible objects, text, colors and scene when relevant.\n"
            "- If uncertain, say what you can actually see and ask the user to bring the object closer or improve lighting; never guess.\n"
            "- Words like 'ye', 'this', 'dekho', 'kya hai' refer to the attached current frame."
        )
    if data.get('call_mode'):
        messages[0]["content"] += (
            "\n\n📞 Ab live call chal rahi hai: natural spoken language use karo, "
            "markdown/emoji/list mat use karo. Normal chat mein 1-2 short spoken sentences bolo. "
            "Interview mode mein feedback short rakho aur ek time par sirf ek question pucho. "
            "Kabhi-kabhi context ke hisaab se 'hmm', 'achha', 'right', 'I see' use karo, har baar nahi."
        )
    reply = _get_ai_reply(messages, image_data=image_data)
    _save_turn(user_id, user_msg, reply)

    return jsonify({"reply": reply, "searched": needs_search})


@ai_bp.route('/api/ai/chat/stream', methods=['POST'])
def ai_chat_stream():
    """Server-Sent Events streaming response"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    raw_message = data.get('message')
    if not isinstance(raw_message, str):
        return jsonify({"error": "Message must be text"}), 400
    user_msg = raw_message.strip()
    if not user_msg:
        return jsonify({"error": "Message is required"}), 400
    if len(user_msg) > 8000:
        return jsonify({"error": "Message is too long"}), 400

    user_name, user_gender = _get_user_info(user_id)
    requested_gender = str(data.get('user_gender') or '').lower()
    if requested_gender in ('male', 'female', 'unknown'):
        user_gender = requested_gender
    language_code = str(data.get('language') or 'hi-IN')
    if language_code not in SUPPORTED_LANGUAGES:
        return jsonify({"error": "Unsupported AI language"}), 400

    messages = _build_messages(user_id, user_msg, user_gender, user_name, language_code)

    def generate():
        full_reply = []

        # Send headers immediately. This prevents hosting proxies from treating
        # the request as idle while the first AI provider establishes a connection.
        yield ": connected\n\n"

        # Try Groq streaming first
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
                report_safe_exception('groq_stream_failed', e)

        # Try Gemini streaming fallback
        resp = _call_gemini(messages, stream=True)
        if resp:
            try:
                for line in resp:
                    line = line.decode('utf-8').strip()
                    if line.startswith('data: '):
                        chunk = line[6:]
                        try:
                            obj = json.loads(chunk)
                            token = obj['candidates'][0]['content']['parts'][0].get('text', '')
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
                report_safe_exception('gemini_stream_failed', e)

        # Try Grok streaming fallback
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
                report_safe_exception('grok_stream_failed', e)

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
    raw_prompt = data.get('prompt')
    if not isinstance(raw_prompt, str):
        return jsonify({"error": "Prompt must be text"}), 400
    prompt = raw_prompt.strip()
    if not prompt:
        return jsonify({"error": "Prompt is required"}), 400
    if len(prompt) > 2000:
        return jsonify({"error": "Prompt is too long"}), 400

    encoded = urllib.parse.quote(prompt)
    image_url = f"https://image.pollinations.ai/prompt/{encoded}?width=512&height=512&nologo=true"
    return jsonify({"url": image_url, "prompt": prompt})


@ai_bp.route('/api/ai/info', methods=['GET'])
def ai_info():
    """Returns AI bot profile info — gender-aware based on logged-in user"""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
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


@ai_bp.route('/api/ai/tts', methods=['GET'])
def ai_tts():
    if not get_current_user_id():
        return jsonify({'error': 'Unauthorized'}), 401
    text = request.args.get('text', '').strip()
    gender = request.args.get('gender', 'female').lower()
    
    if not text:
        return "Text is required", 400
        
    # Option 1: OpenAI TTS (extremely high quality, sounds exactly like a human)
    if OPENAI_API_KEY:
        try:
            import urllib.request
            import json
            voice = "alloy" if gender == "male" else "nova"
            payload = json.dumps({
                "model": "tts-1",
                "input": text,
                "voice": voice
            }).encode()
            req = urllib.request.Request(
                "https://api.openai.com/v1/audio/speech",
                data=payload,
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                return Response(response.read(), mimetype="audio/mpeg")
        except Exception as e:
            report_safe_exception('openai_tts_failed', e)
            
    # Option 2: Fallback to Google Translate TTS (free, natural voice, no key needed)
    try:
        import urllib.request
        lang = request.args.get('lang', 'hi').split('-')[0]
        if lang not in {'hi', 'en', 'bn', 'pa', 'mr', 'gu', 'ta', 'te', 'kn', 'ml', 'ur', 'es', 'fr', 'ar'}:
            lang = 'hi'
        encoded_text = urllib.parse.quote(text)
        url = f"https://translate.google.com/translate_tts?ie=UTF-8&tl={lang}&client=tw-ob&q={encoded_text}"
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            return Response(response.read(), mimetype="audio/mpeg")
    except Exception as e:
        report_safe_exception('google_tts_failed', e)
        return jsonify({"error": "TTS failed"}), 500
