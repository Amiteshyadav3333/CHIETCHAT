#!/usr/bin/env python3
"""Verify and restore a CHEETCHAT backup into an explicitly confirmed disposable database."""

import argparse
import os
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('backup')
    parser.add_argument('--target-url', default=os.environ.get('RESTORE_DATABASE_URL', ''))
    parser.add_argument('--confirm-disposable-target', action='store_true')
    args = parser.parse_args()

    target_url = args.target_url.strip()
    production_url = os.environ.get('DATABASE_URL', '').strip()
    if not args.confirm_disposable_target:
        raise SystemExit('--confirm-disposable-target is required')
    if not target_url.startswith(('postgres://', 'postgresql://')):
        raise SystemExit('RESTORE_DATABASE_URL/--target-url must point to PostgreSQL')
    if production_url and target_url == production_url:
        raise SystemExit('Refusing to restore over DATABASE_URL')

    backup = Path(args.backup).resolve()
    verifier = Path(__file__).with_name('verify_backup.py')
    subprocess.run([sys.executable, str(verifier), str(backup)], check=True)
    pg_environment = os.environ.copy()
    pg_environment['PGDATABASE'] = target_url
    subprocess.run([
        'pg_restore', '--clean', '--if-exists', '--no-owner', '--no-acl',
        '--exit-on-error', '--dbname=', str(backup),
    ], check=True, env=pg_environment)
    print(f'Restored and verified {backup.name} into the confirmed disposable target.')


if __name__ == '__main__':
    main()
