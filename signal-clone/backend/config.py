import os
from datetime import timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'super-secret-signal-key-change-this'
    # Production DB (PostgreSQL) or Local DB (SQLite)
    # Render provides 'postgres://' but SQLAlchemy needs 'postgresql://'
    database_url = os.environ.get('DATABASE_URL')
    if database_url and database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)

    SQLALCHEMY_DATABASE_URI = database_url or 'sqlite:///db.sqlite'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'jwt-secret-key-change-this'
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    MAX_UPLOAD_BYTES = int(os.environ.get('MAX_UPLOAD_BYTES', 100 * 1024 * 1024))
    MAX_CONTENT_LENGTH = MAX_UPLOAD_BYTES
