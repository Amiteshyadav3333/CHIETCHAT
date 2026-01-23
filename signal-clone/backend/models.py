from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False) # Display name
    phone = db.Column(db.String(20), unique=True, nullable=False) # New Auth ID
    password_hash = db.Column(db.String(255), nullable=False)
    public_key = db.Column(db.Text, nullable=True) 
    avatar = db.Column(db.String(200), default="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Chat(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    is_group = db.Column(db.Boolean, default=False)
    name = db.Column(db.String(100), nullable=True) 
    group_admin_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    messages = db.relationship('Message', backref='chat', lazy=True)
    participants = db.relationship('ChatParticipant', backref='chat', lazy=True)

class ChatParticipant(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    user = db.relationship('User')

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.Integer, db.ForeignKey('chat.id'), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.Text, nullable=False) 
    type = db.Column(db.String(20), default='text') 
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    ttl = db.Column(db.Integer, default=0) 
    
    sender = db.relationship('User')

class Story(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    content = db.Column(db.String(500), nullable=False) 
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    user = db.relationship('User')
