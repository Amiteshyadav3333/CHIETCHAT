import os

# Set testing environment variables before any test modules or app configurations are imported
os.environ['DATABASE_URL'] = 'sqlite:///:memory:'
os.environ['TESTING'] = '1'
os.environ['APP_ENV'] = 'testing'
