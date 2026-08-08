import os
import subprocess
import sys
import unittest


class ProductionConfigTests(unittest.TestCase):
    def production_environment(self):
        env = os.environ.copy()
        env.update({
            'APP_ENV': 'production',
            'SECRET_KEY': 's' * 32,
            'JWT_SECRET_KEY': 'j' * 32,
            'DATABASE_URL': 'postgresql://user:password@db.example/app',
            'SUPABASE_URL': 'https://project.supabase.co',
            'SUPABASE_ANON_KEY': 'public-anon-key',
            'REDIS_URL': 'redis://redis.example/0',
            'FRONTEND_URL': 'https://chat.example.com',
            'BACKEND_URL': 'https://api.example.com',
            'CLOUDINARY_CLOUD_NAME': 'cloud',
            'CLOUDINARY_API_KEY': 'key',
            'CLOUDINARY_API_SECRET': 'secret',
            'VAPID_PUBLIC_KEY': 'public',
            'VAPID_PRIVATE_KEY': 'private',
            'VAPID_SUBJECT': 'mailto:security@example.com',
            'TURN_URLS': 'turns:turn.example.com:5349',
            'TURN_SECRET': 't' * 32,
            'DATA_RETENTION_PEPPER': 'p' * 32,
            'PAYMENT_RETENTION_DAYS': '2555',
            'CALL_RECORD_RETENTION_DAYS': '90',
            'AI_MEMORY_RETENTION_DAYS': '30',
            'AI_MEMORY_MAX_ROWS': '100',
        })
        env.pop('RENDER', None)
        return env

    def import_config(self, env):
        return subprocess.run(
            [sys.executable, '-c', 'from config import Config; print(Config.IS_PRODUCTION)'],
            cwd=os.path.dirname(os.path.dirname(__file__)), env=env,
            capture_output=True, text=True, check=False,
        )

    def test_complete_production_environment_is_accepted(self):
        result = self.import_config(self.production_environment())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'True')

    def test_production_rejects_missing_turn_secret(self):
        env = self.production_environment()
        env.pop('TURN_SECRET')
        result = self.import_config(env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('TURN_SECRET', result.stderr)

    def test_production_accepts_managed_turn_credentials(self):
        env = self.production_environment()
        env.pop('TURN_SECRET')
        env['TURN_USERNAME'] = 'metered-user'
        env['TURN_CREDENTIAL'] = 'metered-password'
        result = self.import_config(env)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_production_rejects_partial_managed_turn_credentials(self):
        env = self.production_environment()
        env.pop('TURN_SECRET')
        env['TURN_USERNAME'] = 'metered-user'
        result = self.import_config(env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('TURN_USERNAME and TURN_CREDENTIAL', result.stderr)

    def test_production_rejects_non_https_public_url(self):
        env = self.production_environment()
        env['BACKEND_URL'] = 'http://api.example.com'
        result = self.import_config(env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('BACKEND_URL', result.stderr)


if __name__ == '__main__':
    unittest.main()
