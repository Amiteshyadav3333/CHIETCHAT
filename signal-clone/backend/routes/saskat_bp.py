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


def _find_sponsored_offer(query: str, ads_opt_in: bool) -> dict | None:
    """
    Return one relevant sponsor card or None.

    * Never called when query is sensitive.
    * Bug #8 fix: filter with DB WHERE clause + is_active flag instead of
      loading every ad row into Python memory.
    """
    if _is_sensitive_query(query):
        return None

    from routes.admin_bp import Ad

    terms = _terms(query, minimum=2)
    if not terms:
        return None

    # Bug #8 fix: only load active ads; DB does the filtering.
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
        # Web search enrichment
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

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(safe_history)
        messages.append({"role": "user", "content": context_msg})

        response = _get_ai_reply(messages, model=model)

        # Sponsored offer matching — only for free users, only when not sensitive,
        # only after the neutral AI answer is already decided.
        ad = None
        if not premium_active:
            ads_opt_in = _user_has_ads_opt_in(user)
            try:
                ad = _find_sponsored_offer(message, ads_opt_in)
            except Exception:
                db.session.rollback()

        credits_info = None
        if not premium_active and 'credits_remaining' in usage:
            credits_info = {
                'remaining': usage['credits_remaining'],
                'limit': DAILY_FREE_CREDITS,
            }

        return jsonify({
            'response': response,
            'sources': sources,
            'searched': bool(search_results),
            # Sponsored card is a SEPARATE field — frontend renders it below
            # the answer, never inside it.
            'sponsored': ad,
            'ephemeral': True,
            'model_used': model,
            'credits': credits_info,
        }), 200

    except Exception as e:
        logger.exception("saskat_chat error")
        return jsonify({'error': str(e)}), 500


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
