#!/usr/bin/env python3
"""Verify backup checksum and ask pg_restore to parse its table of contents."""

import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('backup')
    args = parser.parse_args()
    backup = Path(args.backup).resolve()
    signing_key = os.environ.get('BACKUP_SIGNING_KEY', '')
    if len(signing_key) < 32:
        raise SystemExit('BACKUP_SIGNING_KEY must contain at least 32 characters')
    manifest_path = backup.with_suffix('.json')
    manifest = json.loads(manifest_path.read_text())
    supplied_signature = str(manifest.pop('signature', ''))
    canonical = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
    expected_signature = hmac.new(signing_key.encode(), canonical, hashlib.sha256).hexdigest()
    if not supplied_signature or not hmac.compare_digest(supplied_signature, expected_signature):
        raise SystemExit('Backup manifest signature is invalid')
    if manifest.get('file') != backup.name or manifest.get('format') != 'postgresql-custom':
        raise SystemExit('Backup manifest does not describe this file')
    checksum = hashlib.sha256()
    with backup.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            checksum.update(chunk)
    digest = checksum.hexdigest()
    if digest != manifest.get('sha256') or backup.stat().st_size != manifest.get('bytes'):
        raise SystemExit('Backup checksum does not match manifest')
    subprocess.run(['pg_restore', '--list', str(backup)], check=True, stdout=subprocess.DEVNULL)
    print(json.dumps({'ok': True, 'file': backup.name, 'sha256': digest}))


if __name__ == '__main__':
    main()
