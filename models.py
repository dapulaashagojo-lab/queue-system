from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Admin(db.Model):
    __tablename__ = 'admins'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Student(db.Model):
    __tablename__ = 'students'
    id = db.Column(db.Integer, primary_key=True)
    queue_number = db.Column(db.Integer, unique=True)
    student_name = db.Column(db.String(100))
    purpose = db.Column(db.String(50))
    purpose_text = db.Column(db.String(100))
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    status = db.Column(db.String(20), default='waiting')
    is_current = db.Column(db.Boolean, default=False)

class Transaction(db.Model):
    __tablename__ = 'transactions'
    id = db.Column(db.Integer, primary_key=True)
    queue_number = db.Column(db.Integer)
    student_name = db.Column(db.String(100))
    transaction_type = db.Column(db.String(100))
    joined_at = db.Column(db.DateTime)
    completed_at = db.Column(db.DateTime, default=datetime.utcnow)
    waiting_time = db.Column(db.Integer)
    status = db.Column(db.String(20))
    served_by = db.Column(db.String(50))

class Feedback(db.Model):
    __tablename__ = 'feedbacks'
    id = db.Column(db.Integer, primary_key=True)
    queue_number = db.Column(db.Integer)
    rating = db.Column(db.Integer)
    comments = db.Column(db.Text)
    status = db.Column(db.String(20))
    transaction_type = db.Column(db.String(100))
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)

class SystemStats(db.Model):
    __tablename__ = 'system_stats'
    id = db.Column(db.Integer, primary_key=True)
    queue_counter = db.Column(db.Integer, default=100)
    last_reset = db.Column(db.DateTime, default=datetime.utcnow)
    total_transactions = db.Column(db.Integer, default=0)
    avg_wait_time = db.Column(db.Float, default=0)
    avg_rating = db.Column(db.Float, default=0)