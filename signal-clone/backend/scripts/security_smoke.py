#!/usr/bin/env python3
"""Non-destructive security assertions against a deployed CHEETCHAT backend."""

import argparse
import json
from urllib.parse import urlparse
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def fetch(base_url, path, method='GET', token=''):
    headers = {'Origin': 'https://security-smoke.invalid'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    request = Request(base_url.rstrip('/') + path, method=method, headers=headers)
    try:
        with urlopen(request, timeout=10) as response:
            return response.status, dict(response.headers)
    except HTTPError as error:
        return error.code, dict(error.headers)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('base_url')
    parser.add_argument('--token', default='')
    parser.add_argument('--allow-http-local', action='store_true')
    args = parser.parse_args()
    hostname = (urlparse(args.base_url).hostname or '').lower()
    if args.allow_http_local and hostname not in ('127.0.0.1', 'localhost', '::1'):
        parser.error('--allow-http-local is restricted to loopback hosts')
    checks = []

    status, headers = fetch(args.base_url, '/health/live')
    checks.append(('liveness', status == 200))
    checks.append(('nosniff', headers.get('X-Content-Type-Options') == 'nosniff'))
    checks.append(('clickjacking-denied', headers.get('X-Frame-Options') == 'DENY'))
    checks.append(('referrer-policy', headers.get('Referrer-Policy') == 'strict-origin-when-cross-origin'))
    checks.append(('permissions-policy', 'camera=(self)' in headers.get('Permissions-Policy', '')))
    checks.append(('hsts', args.allow_http_local or 'max-age=' in headers.get('Strict-Transport-Security', '')))
    checks.append(('hostile-origin-blocked', 'security-smoke.invalid' not in headers.get('Access-Control-Allow-Origin', '')))

    for path in ('/api/chats', '/api/business/me', '/api/payments/config', '/api/calls/ice-config'):
        anonymous_status, _ = fetch(args.base_url, path)
        checks.append((f'anonymous:{path}', anonymous_status == 401))

    if args.token:
        authenticated_status, authenticated_headers = fetch(args.base_url, '/api/chats', token=args.token)
        checks.append(('authenticated-chats', authenticated_status == 200))
        checks.append(('authenticated-no-store', 'no-store' in authenticated_headers.get('Cache-Control', '')))

    report = {'ok': all(ok for _, ok in checks), 'checks': {name: ok for name, ok in checks}}
    print(json.dumps(report))
    if not report['ok']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
