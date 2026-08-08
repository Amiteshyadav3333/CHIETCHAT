#!/usr/bin/env python3
"""Create an atomic PostgreSQL custom-format backup with a SHA-256 manifest."""

import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import subprocess
import tempfile
from datetime import datetime, timezone


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default=os.environ.get('BACKUP_DIR', './backups'))
    args = parser.parse_args()
    database_url = os.environ.get('DATABASE_URL', '')
    signing_key = os.environ.get('BACKUP_SIGNING_KEY', '')
    if not database_url.startswith(('postgres://', 'postgresql://')):
        raise SystemExit('DATABASE_URL must point to PostgreSQL')
    if len(signing_key) < 32:
        raise SystemExit('BACKUP_SIGNING_KEY must contain at least 32 characters')

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    final_path = output_dir / f'cheetchat-{stamp}.dump'
    with tempfile.NamedTemporaryFile(dir=output_dir, prefix='.backup-', delete=False) as temp:
        temp_path = Path(temp.name)
    try:
        pg_environment = os.environ.copy()
        pg_environment['PGDATABASE'] = database_url
        subprocess.run(
            ['pg_dump', '--format=custom', '--no-owner', '--no-acl', '--file', str(temp_path)],
            check=True, env=pg_environment,
        )
        temp_path.replace(final_path)
        manifest = {
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'file': final_path.name,
            'bytes': final_path.stat().st_size,
            'sha256': sha256(final_path),
            'format': 'postgresql-custom',
        }
        canonical = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
        manifest['signature'] = hmac.new(signing_key.encode(), canonical, hashlib.sha256).hexdigest()
        manifest_path = final_path.with_suffix('.json')
        with tempfile.NamedTemporaryFile(
            mode='w', dir=output_dir, prefix='.manifest-', delete=False, encoding='utf-8'
        ) as manifest_temp:
            json.dump(manifest, manifest_temp, indent=2)
            manifest_temp.write('\n')
            manifest_temp_path = Path(manifest_temp.name)
        manifest_temp_path.replace(manifest_path)
        print(json.dumps(manifest))
    finally:
        temp_path.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
