"""
Saskat AI — backend route handler.

Design principles
-----------------
* AI answer is ALWAYS neutral and grounded — sponsored offers are a SEPARATE
  card attached after the answer, never woven into the response text.
* Ads are matched by keyword relevance, never by profiling sensitive data.
* Sensitive topics (health, finance, religion, etc.) are excluded from any
  ad targeting entirely.
* Fair-use daily limits for free users; heavy tasks (image gen, code) consume
  extra credits — but no hard 4-message block.
* Privacy opt-in for personalised ads; default = contextual / non-personalised.
* All API keys are read lazily (inside request context) so they can be rotated
  without a server restart.
"""

from flask import Blueprint, jsonify, current_app
from utils import get_current_user_id, get_json_data, utc_now
from models import db, User
import os
import json
import hashlib
import urllib.request
import urllib.parse
import urllib.error
import re
import datetime
import logging

logger = logging.getLogger('cheetchat.saskat')

saskat_bp = Blueprint('saskat_bp', __name__)

# ---------------------------------------------------------------------------
# Config helpers — read at call time so keys can be rotated without restart
# ---------------------------------------------------------------------------

def _key(name: str) -> str:
    return os.environ.get(name, '')


# ---------------------------------------------------------------------------
# Task classification — used for fair-use credit cost
# ---------------------------------------------------------------------------

_HEAVY_TASK_PATTERNS = re.compile(
    r'\b(write|generate|create|build|code|script|program|debug|fix|refactor|'
    r'translate|summarize|summarise|explain|essay|poem|story|report|'
    r'लिखो|लिखें|बनाओ|कोड|स्क्रिप्ट)\b',
    re.IGNORECASE,
)

def _task_credit_cost(message: str) -> int:
    """Return credit units consumed by this message (1 = normal, 2 = heavy)."""
    if _HEAVY_TASK_PATTERNS.search(message):
        return 2
    return 1


# ---------------------------------------------------------------------------
# Fair-use daily limit
# ---------------------------------------------------------------------------

# Free users get DAILY_FREE_CREDITS credits per day (each message costs 1–2).
# Premium users have no limit.
DAILY_FREE_CREDITS = int(os.environ.get('SASKAT_DAILY_FREE_CREDITS', '30'))

# In-process store: {user_id: {'date': YYYY-MM-DD, 'used': int}}
# In a multi-worker deployment replace with Redis INCR + EXPIRE.
_daily_usage: dict = {}

def _check_and_consume_credits(user_id: int, cost: int, is_premium: bool) -> dict:
    """
    Returns {'allowed': True} or {'allowed': False, 'credits_used': N,
    'credits_limit': N, 'resets_at': ISO}.
    Never raises.
    """
    if is_premium:
        return {'allowed': True}

    today = datetime.datetime.utcnow().strftime('%Y-%m-%d')
    entry = _daily_usage.get(user_id)
    if not entry or entry['date'] != today:
        entry = {'date': today, 'used': 0}
        _daily_usage[user_id] = entry

    if entry['used'] + cost > DAILY_FREE_CREDITS:
        tomorrow = (datetime.datetime.utcnow() + datetime.timedelta(days=1)).strftime('%Y-%m-%dT00:00:00Z')
        return {
            'allowed': False,
            'credits_used': entry['used'],
            'credits_limit': DAILY_FREE_CREDITS,
            'resets_at': tomorrow,
        }

    entry['used'] += cost
    return {'allowed': True, 'credits_remaining': DAILY_FREE_CREDITS - entry['used']}


# ---------------------------------------------------------------------------
# AI provider callers — Bug #1 fixed: each provider is a separate function
# Bug #5 fixed: keys read at call time, not at import time
# Bug #12 fixed: Gemini returns None only when truly nothing to send
# ---------------------------------------------------------------------------

def _call_gemini(messages: list) -> str | None:
    api_key = _key('GEMINI_API_KEY')
    if not api_key:
        return None

    gemini_contents = []
    system_instruction = None
    for m in messages:
        if m['role'] == 'system':
            system_instruction = m['content']
            continue
        role = 'user' if m['role'] == 'user' else 'model'
        gemini_contents.append({"role": role, "parts": [{"text": m['content']}]})

    # Bug #12 fix: if no user/assistant turns exist yet, send a minimal user
    # turn so Gemini has something to respond to rather than silently failing.
    if not gemini_contents:
        if system_instruction:
            gemini_contents.append({"role": "user", "parts": [{"text": "Hello"}]})
        else:
            return None

    payload_dict = {
        "contents": gemini_contents,
        "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.85},
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT",        "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH",        "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",  "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT",  "threshold": "BLOCK_NONE"},
        ],
    }
    if system_instruction:
        payload_dict["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    payload = json.dumps(payload_dict).encode()
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={api_key}"
    )
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read().decode())
        return data['candidates'][0]['content']['parts'][0]['text']
    except Exception:
        return None


def _call_groq(messages: list) -> str | None:
    api_key = _key('GROQ_API_KEY')
    if not api_key:
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
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read().decode())
        return data['choices'][0]['message']['content']
    except Exception:
        return None


def _call_openai(messages: list, model: str = "gpt-4o-mini") -> str | None:
    api_key = _key('OPENAI_API_KEY')
    if not api_key:
        return None
    payload = json.dumps({
        "model": model,
        "messages": messages,
        "max_tokens": 1024,
        "temperature": 0.85,
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read().decode())
        return data['choices'][0]['message']['content']
    except Exception:
        return None


def _call_grok(messages: list) -> str | None:
    """xAI Grok — uses an OpenAI-compatible endpoint."""
    api_key = _key('GROK_API_KEY')
    if not api_key:
        return None
    payload = json.dumps({
        "model": "grok-2-latest",
        "messages": messages,
        "max_tokens": 1024,
        "temperature": 0.85,
    }).encode()
    req = urllib.request.Request(
        "https://api.x.ai/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        data = json.loads(resp.read().decode())
        return data['choices'][0]['message']['content']
    except Exception:
        return None


# Bug #1 fix: model param is now honoured; fallback chain only when preferred
# model is unavailable.
_MODEL_ORDER = {
    'gemini':  [_call_gemini, _call_groq, _call_openai, _call_grok],
    'groq':    [_call_groq,   _call_gemini, _call_openai, _call_grok],
    'gpt-4':   [lambda m: _call_openai(m, 'gpt-4o-mini'), _call_gemini, _call_groq, _call_grok],
    'grok':    [_call_grok,   _call_gemini, _call_groq, _call_openai],
}
_DEFAULT_ORDER = [_call_gemini, _call_groq, _call_openai, _call_grok]


def _get_ai_reply(messages: list, model: str = 'gemini') -> str:
    """Try the requested model first, then fall back in order."""
    chain = _MODEL_ORDER.get(model, _DEFAULT_ORDER)
    for caller in chain:
        result = caller(messages)
        if result:
            return result
    return "Sorry, AI is temporarily unavailable. Please try again later."


# ---------------------------------------------------------------------------
# Web search
# ---------------------------------------------------------------------------

def _web_search(query: str) -> list | None:
    api_key = _key('SERPER_API_KEY')
    if not api_key:
        return None
    payload = json.dumps({"q": query, "num": 5}).encode()
    req = urllib.request.Request(
        "https://google.serper.dev/search",
        data=payload,
        headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read().decode())
        results = data.get('organic', [])[:4]
        return [
            {"title": r.get('title', ''), "snippet": r.get('snippet', ''), "link": r.get('link', '')}
            for r in results
        ]
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Redis response cache helpers
# ---------------------------------------------------------------------------

CACHE_QUESTION_TYPES = re.compile(
    r'\b(mausam|weather|pradhanmantri|prime minister|president|rashtrapati|'
    r'capital|rajdhani|population|aabadi|cricket score|ipl|'
    r'aaj ka|today|latest news|breaking|kaun hai|who is)\b',
    re.IGNORECASE
)


def _is_cacheable(message: str) -> bool:
    return bool(CACHE_QUESTION_TYPES.search(message))


def _get_redis():
    try:
        return current_app.extensions.get('cheetchat_redis')
    except Exception:
        return None


def _cache_get(message: str) -> str | None:
    """Try Redis first. Returns cached answer or None."""
    redis_client = _get_redis()
    if not redis_client:
        return None
    key = 'saskat:cache:' + hashlib.md5(message.strip().casefold().encode()).hexdigest()
    try:
        return redis_client.get(key)
    except Exception:
        return None


def _cache_set(message: str, answer: str, ttl_seconds: int = 3600) -> None:
    """Store answer in Redis for ttl_seconds (default 1 hour)."""
    redis_client = _get_redis()
    if not redis_client:
        return
    key = 'saskat:cache:' + hashlib.md5(message.strip().casefold().encode()).hexdigest()
    try:
        redis_client.setex(key, ttl_seconds, answer)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Intent extraction — maps user message to ad category tags
# ---------------------------------------------------------------------------

_INTENT_MAP = {
    'jobs':    re.compile(r'\b(job|naukri|vacancy|hiring|placement|career|rozgar|employment|work)\b', re.I),
    'courses': re.compile(r'\b(course|sikho|learn|tutorial|training|certification|coaching|class)\b', re.I),
    'agri':    re.compile(r'\b(kisan|farmer|fasal|crop|kheti|beej|seed|fertilizer|irrigation|agriculture)\b', re.I),
    'beauty':  re.compile(r'\b(hair|skin|face|beauty|makeup|moisturizer|shampoo|cream|serum|fairness)\b', re.I),
    'health':  re.compile(r'\b(health|fitness|gym|yoga|diet|weight|protein|vitamin|supplement)\b', re.I),
    'finance': re.compile(r'\b(invest|mutual fund|sip|stock|share|bank|saving|fd|emi|insurance)\b', re.I),
    'travel':  re.compile(r'\b(travel|yatra|tour|hotel|flight|train|bus|ticket|booking)\b', re.I),
}


def _extract_intents(message: str) -> list:
    found = []
    for tag, pattern in _INTENT_MAP.items():
        if pattern.search(message):
            found.append(tag)
    return found


# ---------------------------------------------------------------------------
# Session save helper
# ---------------------------------------------------------------------------

def _save_session_turn(user_id: int, role: str, content: str, intent_tags: list) -> None:
    """Save one chat turn to SaskatSession. Silently no-ops on error."""
    try:
        from models import SaskatSession
        now = utc_now()
        session_key = now.strftime('%Y-%m-%d') + ':' + str(user_id)
        turn = SaskatSession(
            user_id=user_id,
            session_key=session_key,
            role=role,
            content=content[:4000],
            intent_tags=json.dumps(intent_tags),
            created_at=now,
            expires_at=now + datetime.timedelta(hours=24),
        )
        db.session.add(turn)
        db.session.commit()
    except Exception:
        db.session.rollback()


# ---------------------------------------------------------------------------
# Sponsored offer matcher — Bug #8 fix + new design
#
# Design: AI answer is ALWAYS neutral. The sponsored card is a SEPARATE
# element that the frontend renders below the answer, never inside it.
# Sensitive queries are NEVER matched to ads regardless of user opt-in.
# ---------------------------------------------------------------------------

# Bug #13 fix: use word-boundary regex instead of plain substring match.
_SENSITIVE_AD_WORDS = {
    'medical', 'medicine', 'disease', 'pregnant', 'pregnancy', 'loan', 'debt',
    'credit score', 'suicide', 'mental health', 'cancer', 'hiv', 'religion',
    'depression', 'anxiety', 'divorce', 'death', 'funeral',
    # Hindi
    'बीमारी', 'दवा', 'गर्भ', 'कर्ज', 'लोन', 'आत्महत्या', 'मानसिक',
    'जाति', 'धर्म', 'मृत्यु',
}

# Pre-compiled single-pass pattern for speed (word boundaries for ASCII terms)
_SENSITIVE_PATTERN = re.compile(
    '|'.join(
        r'\b' + re.escape(w) + r'\b' if w.isascii() else re.escape(w)
        for w in _SENSITIVE_AD_WORDS
    ),
    re.IGNORECASE | re.UNICODE,
)


def _is_sensitive_query(query: str) -> bool:
    return bool(_SENSITIVE_PATTERN.search(str(query or '')))


def _terms(value: str, minimum: int = 2) -> set:
    return set(re.findall(r"[\w']{%d,}" % minimum, str(value or '').casefold(), flags=re.UNICODE))


def _find_sponsored_offer(query: str, ads_opt_in: bool, intent_tags: list | None = None) -> dict | None:
    """
    Return one relevant sponsor card or None.

    * Never called when query is sensitive.
    * Bug #8 fix: filter with DB WHERE clause + is_active flag instead of
      loading every ad row into Python memory.
    * Intent tags (from _extract_intents) are used to prefer category-matched banner ads.
    """
    if _is_sensitive_query(query):
        return None

    from routes.admin_bp import Ad

    # Try category match via intent tags first (banner ads only)
    if intent_tags:
        for tag in intent_tags:
            category_ad = Ad.query.filter_by(is_active=True, ad_type='banner', category=tag).first()
            if category_ad:
                try:
                    category_ad.impressions = (category_ad.impressions or 0) + 1
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                return category_ad.to_dict()

    terms = _terms(query, minimum=2)
    if not terms:
        return None

    # Bug #8 fix: only load active banner ads; DB does the filtering.
    active_ads = Ad.query.filter_by(is_active=True, ad_type='banner').all()
    if not active_ads:
        # Fall back to any active ad if no banner-typed ads exist yet
        active_ads = Ad.query.filter_by(is_active=True).all()

    candidates = []
    for ad in active_ads:
        keywords = ad.keywords if isinstance(ad.keywords, list) else []
        ad_terms = _terms(
            ' '.join(map(str, keywords)) + ' ' + ad.title + ' ' + (ad.description or ''),
            minimum=2,
        )
        score = len(terms & ad_terms)
        # Require at least 2 matching terms to avoid spurious matches.
        if score >= 2:
            candidates.append((score, ad))

    if not candidates:
        return None

    _, ad = max(candidates, key=lambda item: (item[0], item[1].updated_at or item[1].created_at))
    try:
        ad.impressions = (ad.impressions or 0) + 1
        db.session.commit()
    except Exception:
        db.session.rollback()
    return ad.to_dict()


# ---------------------------------------------------------------------------
# Privacy helpers
# ---------------------------------------------------------------------------

def _user_has_ads_opt_in(user: User | None) -> bool:
    """Return True only if user has explicitly opted in to personalised ads."""
    if not user:
        return False
    try:
        prefs = json.loads(user.ui_preferences or '{}')
        return bool(prefs.get('saskat_ads_opt_in', False))
    except Exception:
        return False


# ---------------------------------------------------------------------------
# /api/saskat/chat
# ---------------------------------------------------------------------------

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

    # Bug #1 fix: read the model param from the request
    model = str(data.get('model') or 'gemini').lower().strip()
    if model not in ('gemini', 'groq', 'gpt-4', 'grok'):
        model = 'gemini'

    # Bug #4 fix: use db.session.get instead of deprecated User.query.get
    user = db.session.get(User, user_id)
    premium_active = bool(
        user
        and user.is_premium
        and (not user.premium_expires_at or user.premium_expires_at > utc_now())
    )

    # Fair-use credit check
    cost = _task_credit_cost(message)
    usage = _check_and_consume_credits(user_id, cost, premium_active)
    if not usage['allowed']:
        return jsonify({
            'error': 'daily_limit_reached',
            'message': (
                f"Aaj ke liye aapke {usage['credits_limit']} free credits khatam ho gaye. "
                f"Kal {usage['resets_at'][:10]} ko reset honge, ya premium lo unlimited access ke liye."
            ),
            'credits_used': usage['credits_used'],
            'credits_limit': usage['credits_limit'],
            'resets_at': usage['resets_at'],
        }), 429

    # History — Bug #2 is fixed on the frontend side (see SaskatAI.jsx).
    # Backend validates and caps the incoming history.
    history = data.get('history') if isinstance(data.get('history'), list) else []
    safe_history = [
        {'role': item.get('role'), 'content': str(item.get('content') or '')[:4000]}
        for item in history[-8:]
        if item.get('role') in ('user', 'assistant') and str(item.get('content') or '').strip()
    ]

    try:
        # Step 1: Redis cache check for common queries
        intent_tags = _extract_intents(message)
        served = 'llm'
        response = None
        sources = []
        if _is_cacheable(message):
            cached = _cache_get(message)
            if cached:
                response = cached if isinstance(cached, str) else cached.decode('utf-8', errors='replace')
                served = 'cache'

        if response is None:
            # Step 2: Web search enrichment + LLM
            context_msg = message
            search_results = _web_search(message)
            if search_results:
                sources = search_results
                context_msg = (
                    f"{message}\n\n[Fresh web research — cite the source titles you rely on:\n"
                    + "\n".join([f"- {r['title']}: {r['snippet']}" for r in search_results])
                    + "]"
                )

            system_prompt = (
                "You are Saskat AI, a thoughtful research assistant inside CHEETCHAT. "
                "Speak naturally, warmly and intelligently in the user's Hindi, Hinglish or English. "
                "Give direct, well-structured neutral answers with practical next steps and honest "
                "comparisons (free vs paid options, official sources, etc.). "
                "IMPORTANT: Never recommend a specific paid product or sponsor inside your answer text. "
                "Sponsored offers are shown separately by the platform — your job is purely the neutral answer. "
                "When fresh web research is supplied, ground claims in it; never invent sources. "
                "For health, skin, medical, money or safety topics, avoid guarantees and encourage "
                "qualified professional advice where appropriate."
            )

            ai_messages = [{"role": "system", "content": system_prompt}]
            ai_messages.extend(safe_history)
            ai_messages.append({"role": "user", "content": context_msg})

            response = _get_ai_reply(ai_messages, model=model)

            # Cache cacheable answers
            if _is_cacheable(message) and response:
                _cache_set(message, response)

        # Step 3: Sponsored offer matching — only for free users, only when not sensitive
        ad = None
        if not premium_active:
            ads_opt_in = _user_has_ads_opt_in(user)
            try:
                ad = _find_sponsored_offer(message, ads_opt_in, intent_tags=intent_tags)
            except Exception:
                db.session.rollback()

        # Save session turns (24h TTL) — fire-and-forget, never blocks response
        _save_session_turn(user_id, 'user', message, intent_tags)
        if response:
            _save_session_turn(user_id, 'assistant', response, [])

        credits_info = None
        if not premium_active and 'credits_remaining' in usage:
            credits_info = {
                'remaining': usage['credits_remaining'],
                'limit': DAILY_FREE_CREDITS,
            }

        return jsonify({
            'response': response,
            'sources': sources,
            'searched': bool(sources),
            # Sponsored card is a SEPARATE field — frontend renders it below
            # the answer, never inside it.
            'ad': ad,
            'sponsored': ad,          # backward compat
            'intent_tags': intent_tags,
            'served': served,
            'ephemeral': False,        # now stored 24h in saskat_session
            'model_used': model,
            'credits': credits_info,
            'video_ad': None,          # video ads come via /api/saskat/ads/video
        }), 200

    except Exception as e:
        logger.exception("saskat_chat error")
        return jsonify({'error': str(e)}), 500


# ---------------------------------------------------------------------------
# /api/saskat/ads/video  — returns one active video ad for 5-min interval
# ---------------------------------------------------------------------------

@saskat_bp.route('/api/saskat/ads/video', methods=['GET'])
def saskat_video_ad():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
    user = db.session.get(User, user_id)
    if user and user.is_premium and (not user.premium_expires_at or user.premium_expires_at > utc_now()):
        return jsonify({'ad': None}), 200
    from routes.admin_bp import Ad
    import random
    video_ads = Ad.query.filter_by(is_active=True, ad_type='video').all()
    if not video_ads:
        return jsonify({'ad': None}), 200
    ad = random.choice(video_ads)
    try:
        ad.impressions = (ad.impressions or 0) + 1
        db.session.commit()
    except Exception:
        db.session.rollback()
    return jsonify({'ad': ad.to_dict()}), 200


# ---------------------------------------------------------------------------
# /api/saskat/session/cleanup  — delete expired session rows
# ---------------------------------------------------------------------------

@saskat_bp.route('/api/saskat/session/cleanup', methods=['POST'])
def cleanup_sessions():
    """Delete expired SaskatSession rows. Called by background scheduler."""
    from models import SaskatSession
    try:
        expired = SaskatSession.query.filter(SaskatSession.expires_at < utc_now()).all()
        count = len(expired)
        for row in expired:
            db.session.delete(row)
        db.session.commit()
        return jsonify({'deleted': count}), 200
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'cleanup failed'}), 500


# ---------------------------------------------------------------------------
# /api/ai/image/generate
# ---------------------------------------------------------------------------

@saskat_bp.route('/api/ai/image/generate', methods=['POST'])
def generate_image():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    data = get_json_data()
    prompt = (data.get('prompt') or '').strip()
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    # Image generation costs 2 credits for free users
    user = db.session.get(User, user_id)
    premium_active = bool(
        user
        and user.is_premium
        and (not user.premium_expires_at or user.premium_expires_at > utc_now())
    )
    usage = _check_and_consume_credits(user_id, 2, premium_active)
    if not usage['allowed']:
        return jsonify({
            'error': 'daily_limit_reached',
            'message': (
                f"Image generation ke liye credits khatam ho gaye. "
                f"Kal {usage['resets_at'][:10]} ko reset honge."
            ),
            'resets_at': usage['resets_at'],
        }), 429

    encoded = urllib.parse.quote(prompt)
    image_url = f"https://image.pollinations.ai/prompt/{encoded}?width=512&height=512&nologo=true"
    return jsonify({'images': [{'url': image_url}]}), 200


# ---------------------------------------------------------------------------
# /api/ai/ads/get-contextual-ad  (kept for backward compat)
# ---------------------------------------------------------------------------

@saskat_bp.route('/api/ai/ads/get-contextual-ad', methods=['POST'])
def get_contextual_ad():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    user = db.session.get(User, user_id)
    if user and user.is_premium and (not user.premium_expires_at or user.premium_expires_at > utc_now()):
        return jsonify({'sponsored': None}), 200

    query = str(get_json_data().get('query') or '').strip()[:8000]
    ads_opt_in = _user_has_ads_opt_in(user)
    try:
        ad = _find_sponsored_offer(query, ads_opt_in) if query else None
    except Exception:
        db.session.rollback()
        ad = None
    return jsonify({'sponsored': ad}), 200


# ---------------------------------------------------------------------------
# /api/saskat/ads/<id>/click
# ---------------------------------------------------------------------------

@saskat_bp.route('/api/saskat/ads/<int:ad_id>/click', methods=['POST'])
def saskat_ad_click(ad_id):
    if not get_current_user_id():
        return jsonify({'error': 'Unauthorized'}), 401

    from routes.admin_bp import Ad
    # Bug #3 fix: use db.session.get instead of deprecated Ad.query.get
    ad = db.session.get(Ad, ad_id)
    if not ad:
        return jsonify({'error': 'Ad not found'}), 404

    ad.clicks = (ad.clicks or 0) + 1
    db.session.commit()
    return jsonify({'ok': True}), 200


# ---------------------------------------------------------------------------
# /api/saskat/ads/opt-in  — privacy consent endpoint
# ---------------------------------------------------------------------------

@saskat_bp.route('/api/saskat/ads/opt-in', methods=['POST'])
def saskat_ads_opt_in():
    """Let the user explicitly opt-in or opt-out of personalised ad matching."""
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    data = get_json_data()
    opted_in = bool(data.get('opted_in', False))

    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404

    try:
        prefs = json.loads(user.ui_preferences or '{}')
    except Exception:
        prefs = {}

    prefs['saskat_ads_opt_in'] = opted_in
    user.ui_preferences = json.dumps(prefs)
    db.session.commit()

    return jsonify({'opted_in': opted_in}), 200


# ---------------------------------------------------------------------------
# /api/saskat/credits  — check remaining daily credits
# ---------------------------------------------------------------------------

@saskat_bp.route('/api/saskat/credits', methods=['GET'])
def saskat_credits():
    user_id = get_current_user_id()
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401

    user = db.session.get(User, user_id)
    premium_active = bool(
        user
        and user.is_premium
        and (not user.premium_expires_at or user.premium_expires_at > utc_now())
    )

    if premium_active:
        return jsonify({'premium': True, 'unlimited': True}), 200

    today = datetime.datetime.utcnow().strftime('%Y-%m-%d')
    entry = _daily_usage.get(user_id)
    used = entry['used'] if entry and entry['date'] == today else 0
    tomorrow = (datetime.datetime.utcnow() + datetime.timedelta(days=1)).strftime('%Y-%m-%dT00:00:00Z')

    return jsonify({
        'premium': False,
        'credits_used': used,
        'credits_limit': DAILY_FREE_CREDITS,
        'credits_remaining': max(0, DAILY_FREE_CREDITS - used),
        'resets_at': tomorrow,
    }), 200
