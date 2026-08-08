import hashlib
import hmac
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from scripts import backup_database, restore_database, verify_backup
from observability import sanitize_sentry_event, sanitize_sentry_transaction


class OperationsTests(unittest.TestCase):
    signing_key = 'backup-signing-key-with-more-than-32-characters'

    def create_signed_backup(self, directory, content=b'postgres-custom-backup'):
        backup = Path(directory) / 'cheetchat-test.dump'
        backup.write_bytes(content)
        manifest = {
            'createdAt': '2026-08-02T00:00:00+00:00',
            'file': backup.name,
            'bytes': len(content),
            'sha256': hashlib.sha256(content).hexdigest(),
            'format': 'postgresql-custom',
        }
        canonical = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
        manifest['signature'] = hmac.new(self.signing_key.encode(), canonical, hashlib.sha256).hexdigest()
        backup.with_suffix('.json').write_text(json.dumps(manifest))
        return backup

    def test_backup_verifier_checks_signature_checksum_and_pg_restore_format(self):
        with tempfile.TemporaryDirectory() as directory:
            backup = self.create_signed_backup(directory)
            with patch.dict(os.environ, {'BACKUP_SIGNING_KEY': self.signing_key}), \
                    patch.object(sys, 'argv', ['verify_backup.py', str(backup)]), \
                    patch('scripts.verify_backup.subprocess.run') as run:
                verify_backup.main()
            run.assert_called_once()
            self.assertEqual(run.call_args.args[0][:2], ['pg_restore', '--list'])

            backup.write_bytes(b'tampered')
            with patch.dict(os.environ, {'BACKUP_SIGNING_KEY': self.signing_key}), \
                    patch.object(sys, 'argv', ['verify_backup.py', str(backup)]), \
                    self.assertRaises(SystemExit):
                verify_backup.main()

    def test_backup_hides_database_url_and_writes_signed_atomic_manifest(self):
        database_url = 'postgresql://backup:database-secret@db.example/production'
        with tempfile.TemporaryDirectory() as directory, \
                patch.dict(os.environ, {
                    'DATABASE_URL': database_url, 'BACKUP_SIGNING_KEY': self.signing_key,
                }), patch.object(sys, 'argv', [
                    'backup_database.py', '--output-dir', directory,
                ]), patch('scripts.backup_database.subprocess.run') as run:
            backup_database.main()

            command = run.call_args.args[0]
            self.assertNotIn(database_url, command)
            self.assertEqual(run.call_args.kwargs['env']['PGDATABASE'], database_url)
            backups = list(Path(directory).glob('cheetchat-*.dump'))
            manifests = list(Path(directory).glob('cheetchat-*.json'))
            self.assertEqual(len(backups), 1)
            self.assertEqual(len(manifests), 1)
            manifest = json.loads(manifests[0].read_text())
            supplied = manifest.pop('signature')
            canonical = json.dumps(manifest, sort_keys=True, separators=(',', ':')).encode()
            expected = hmac.new(self.signing_key.encode(), canonical, hashlib.sha256).hexdigest()
            self.assertTrue(hmac.compare_digest(supplied, expected))
            self.assertEqual(list(Path(directory).glob('.backup-*')), [])
            self.assertEqual(list(Path(directory).glob('.manifest-*')), [])

    def test_restore_refuses_production_and_keeps_target_secret_out_of_arguments(self):
        with tempfile.TemporaryDirectory() as directory:
            backup = self.create_signed_backup(directory)
            production = 'postgresql://user:secret@db.example/prod'
            with patch.dict(os.environ, {'DATABASE_URL': production}), \
                    patch.object(sys, 'argv', [
                        'restore_database.py', str(backup), '--target-url', production,
                        '--confirm-disposable-target',
                    ]), self.assertRaises(SystemExit):
                restore_database.main()

            target = 'postgresql://restore:restore-secret@db.example/disposable'
            with patch.dict(os.environ, {'DATABASE_URL': production}), \
                    patch.object(sys, 'argv', [
                        'restore_database.py', str(backup), '--target-url', target,
                        '--confirm-disposable-target',
                    ]), patch('scripts.restore_database.subprocess.run') as run:
                restore_database.main()
            commands = [call.args[0] for call in run.call_args_list]
            self.assertFalse(any(target in argument for command in commands for argument in command))
            self.assertEqual(run.call_args_list[-1].kwargs['env']['PGDATABASE'], target)

    def test_sentry_sanitizer_drops_request_content_headers_user_and_stack_locals(self):
        marker = 'never-export-private-message-or-password'
        event = {
            'event_id': 'event-1', 'level': 'error', 'transaction': '/api/chats?token=' + marker,
            'request': {
                'method': 'POST', 'url': 'https://api.example/api/chats?secret=' + marker,
                'headers': {'Authorization': 'Bearer ' + marker, 'Cookie': marker},
                'cookies': {'session': marker}, 'data': {'content': marker},
            },
            'user': {'email': marker}, 'extra': {'message': marker},
            'breadcrumbs': {'values': [{'message': marker, 'data': {'password': marker}}]},
            'exception': {'values': [{
                'type': 'RuntimeError', 'value': marker,
                'stacktrace': {'frames': [{
                    'filename': 'safe.py', 'function': 'safe_function', 'lineno': 12,
                    'vars': {'password': marker}, 'pre_context': [marker],
                }]},
            }]},
        }
        safe = sanitize_sentry_event(event)
        serialized = json.dumps(safe)
        self.assertNotIn(marker, serialized)
        self.assertEqual(safe['request']['url'], 'https://api.example/api/chats')
        self.assertEqual(safe['exception']['values'][0]['type'], 'RuntimeError')
        self.assertNotIn('vars', safe['exception']['values'][0]['stacktrace']['frames'][0])

        transaction = {**event, 'type': 'transaction', 'spans': [{
            'span_id': 'span', 'trace_id': 'trace', 'op': 'http.client',
            'description': 'https://provider.example/pay?key=' + marker,
            'data': {'request.body': marker},
        }]}
        safe_transaction = sanitize_sentry_transaction(transaction)
        self.assertNotIn(marker, json.dumps(safe_transaction))


if __name__ == '__main__':
    unittest.main()
