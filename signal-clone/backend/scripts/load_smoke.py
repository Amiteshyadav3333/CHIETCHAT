#!/usr/bin/env python3
"""Small dependency-free readiness/load smoke test for a deployed backend."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import time
from urllib.request import Request, urlopen


def request_once(url, timeout, token):
    started = time.perf_counter()
    try:
        headers = {'Authorization': f'Bearer {token}'} if token else {}
        with urlopen(Request(url, headers=headers), timeout=timeout) as response:
            ok = response.status == 200
    except Exception:
        ok = False
    return ok, (time.perf_counter() - started) * 1000


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int((len(ordered) - 1) * fraction))]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('base_url')
    parser.add_argument('--requests', type=int, default=100)
    parser.add_argument('--concurrency', type=int, default=10)
    parser.add_argument('--timeout', type=float, default=5)
    parser.add_argument('--token', default='')
    parser.add_argument('--path', action='append', default=[])
    parser.add_argument('--max-p95-ms', type=float, default=1500)
    parser.add_argument('--min-success-rate', type=float, default=0.99)
    args = parser.parse_args()
    if args.requests < 1 or args.concurrency < 1 or args.timeout <= 0:
        parser.error('requests, concurrency and timeout must be positive')
    if not 0 < args.min_success_rate <= 1 or args.max_p95_ms <= 0:
        parser.error('thresholds are invalid')
    paths = args.path or ['/health/ready']
    urls = [args.base_url.rstrip('/') + path for path in paths]
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        results = list(pool.map(
            lambda index: request_once(urls[index % len(urls)], args.timeout, args.token),
            range(args.requests),
        ))
    durations = [duration for _, duration in results]
    successes = sum(ok for ok, _ in results)
    report = {
        'urls': urls, 'requests': len(results), 'concurrency': args.concurrency, 'successes': successes,
        'failures': len(results) - successes,
        'p50Ms': round(percentile(durations, .50), 2),
        'p95Ms': round(percentile(durations, .95), 2),
        'p99Ms': round(percentile(durations, .99), 2),
    }
    print(json.dumps(report))
    if successes / len(results) < args.min_success_rate or report['p95Ms'] > args.max_p95_ms:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
