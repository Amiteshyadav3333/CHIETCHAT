import urllib.parse
import json

from flask import current_app, g, has_request_context


def _safe_url(value):
    try:
        parsed = urllib.parse.urlsplit(str(value or ''))
        return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, '', ''))
    except ValueError:
        return ''


def _safe_stacktrace(stacktrace):
    frames = []
    for frame in (stacktrace or {}).get('frames', []):
        frames.append({
            key: frame.get(key) for key in
            ('filename', 'abs_path', 'module', 'function', 'lineno', 'in_app')
            if frame.get(key) is not None
        })
    return {'frames': frames}


def sanitize_sentry_event(event, _hint=None):
    """Allowlist diagnostic structure; never export request/user/message values."""
    safe = {
        key: event.get(key) for key in
        ('event_id', 'timestamp', 'platform', 'level', 'logger', 'release', 'environment')
        if event.get(key) is not None
    }
    transaction = event.get('transaction')
    if transaction:
        safe['transaction'] = _safe_url(transaction)
    request = event.get('request') or {}
    if request:
        safe['request'] = {
            'method': request.get('method'),
            'url': _safe_url(request.get('url')),
        }
    values = []
    for value in (event.get('exception') or {}).get('values', []):
        item = {
            key: value.get(key) for key in ('type', 'module', 'mechanism')
            if value.get(key) is not None
        }
        if value.get('stacktrace'):
            item['stacktrace'] = _safe_stacktrace(value['stacktrace'])
        values.append(item)
    if values:
        safe['exception'] = {'values': values}
    return safe


def sanitize_sentry_transaction(event, hint=None):
    safe = sanitize_sentry_event(event, hint)
    safe['type'] = 'transaction'
    safe['transaction_info'] = event.get('transaction_info', {})
    safe['start_timestamp'] = event.get('start_timestamp')
    safe['timestamp'] = event.get('timestamp')
    safe_spans = []
    for span in event.get('spans', []):
        safe_spans.append({
            key: (_safe_url(value) if key == 'description' else value)
            for key, value in span.items()
            if key in ('span_id', 'trace_id', 'parent_span_id', 'op', 'status', 'start_timestamp', 'timestamp', 'description')
        })
    safe['spans'] = safe_spans
    contexts = event.get('contexts') or {}
    if isinstance(contexts.get('trace'), dict):
        safe['contexts'] = {'trace': {
            key: contexts['trace'].get(key)
            for key in ('trace_id', 'span_id', 'parent_span_id', 'op', 'status', 'origin')
            if contexts['trace'].get(key) is not None
        }}
    return safe


def report_safe_exception(event_name, error):
    """Report exception structure without interpolating its potentially private value."""
    payload = {
        'event': str(event_name)[:100],
        'errorType': type(error).__name__,
    }
    if has_request_context():
        payload['requestId'] = getattr(g, 'request_id', None)
    current_app.logger.error(json.dumps(payload, separators=(',', ':')))
    try:
        import sentry_sdk
        sentry_sdk.capture_exception(error)
    except Exception:
        # Logging must never replace the original application error path.
        pass
