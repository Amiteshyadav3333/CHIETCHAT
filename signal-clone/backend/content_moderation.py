"""Server-side adult-content checks for public social media uploads."""

import os

import requests


ADULT_SCORE_THRESHOLD = float(os.environ.get('ADULT_SCORE_THRESHOLD', '0.90'))
_EXPLICIT_CLASSES = ('sexual_activity', 'sexual_display', 'erotica')


class ModerationUnavailable(RuntimeError):
    pass


def _adult_score(payload):
    """Return the highest explicit-content confidence in an image/video result."""
    nudity_results = []
    if isinstance(payload.get('nudity'), dict):
        nudity_results.append(payload['nudity'])
    for frame in ((payload.get('data') or {}).get('frames') or []):
        if isinstance(frame.get('nudity'), dict):
            nudity_results.append(frame['nudity'])
    return max(
        (float(result.get(label) or 0) for result in nudity_results for label in _EXPLICIT_CLASSES),
        default=0.0,
    )


def check_adult_content(file, media_kind):
    """Analyze an upload before storage and return its explicit-adult score.

    Production fails closed when the provider is missing or unavailable. Local
    development can opt out by leaving credentials unset.
    """
    api_user = os.environ.get('SIGHTENGINE_API_USER', '').strip()
    api_secret = os.environ.get('SIGHTENGINE_API_SECRET', '').strip()
    required = os.environ.get('CONTENT_MODERATION_REQUIRED', '').lower() in {'1', 'true', 'yes'}
    if not api_user or not api_secret:
        if required or os.environ.get('RENDER') == 'true' or os.environ.get('APP_ENV') == 'production':
            raise ModerationUnavailable('Content safety service is not configured')
        return 0.0

    endpoint = 'video/check-sync.json' if media_kind == 'video' else 'check.json'
    try:
        file.stream.seek(0)
        response = requests.post(
            f'https://api.sightengine.com/1.0/{endpoint}',
            data={
                'models': 'nudity-2.1',
                'api_user': api_user,
                'api_secret': api_secret,
                **({'interval': '1'} if media_kind == 'video' else {}),
            },
            files={'media': (file.filename or 'upload', file.stream, file.mimetype)},
            timeout=90 if media_kind == 'video' else 20,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get('status') != 'success':
            raise ModerationUnavailable('Content safety service did not return a result')
        return _adult_score(payload)
    except (requests.RequestException, ValueError, TypeError) as error:
        raise ModerationUnavailable('Content safety check could not be completed') from error
    finally:
        file.stream.seek(0)


def reject_adult_content(file, media_kind):
    score = check_adult_content(file, media_kind)
    return score >= ADULT_SCORE_THRESHOLD, score
