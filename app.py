from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from models import db, Admin, Student, Transaction, Feedback, SystemStats
from datetime import datetime, timedelta
from functools import wraps
import os
import eventlet
eventlet.monkey_patch()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-change-this'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///queue.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')
CORS(app)

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_id' not in session:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function

# Create tables
with app.app_context():
    db.create_all()
    if not Admin.query.filter_by(username='admin').first():
        admin = Admin(username='admin', password='admin123', name='Administrator')
        db.session.add(admin)
        db.session.commit()
    if not SystemStats.query.first():
        db.session.add(SystemStats())
        db.session.commit()

@app.route('/')
def index():
    return redirect(url_for('student_page'))

@app.route('/student')
def student_page():
    return render_template('student.html')

@app.route('/admin')
def admin_page():
    if 'admin_id' not in session:
        return redirect(url_for('login_page'))
    return render_template('admin.html')

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    admin = Admin.query.filter_by(username=data.get('username'), password=data.get('password')).first()
    if admin:
        session['admin_id'] = admin.id
        session['admin_username'] = admin.username
        return jsonify({'success': True, 'admin': {'name': admin.name}})
    return jsonify({'success': False, 'error': 'Invalid credentials'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@app.route('/api/check-auth', methods=['GET'])
def check_auth():
    if 'admin_id' in session:
        admin = Admin.query.get(session['admin_id'])
        return jsonify({'authenticated': True, 'admin': {'name': admin.name}})
    return jsonify({'authenticated': False})

@app.route('/api/queue/current', methods=['GET'])
def get_current_queue():
    current = Student.query.filter_by(is_current=True, status='called').first()
    waiting = Student.query.filter_by(status='waiting').order_by(Student.joined_at).all()
    stats = SystemStats.query.first()
    return jsonify({
        'currentStudent': {
            'number': current.queue_number,
            'purposeText': current.purpose_text,
            'studentName': current.student_name
        } if current else None,
        'queue': [{
            'number': s.queue_number,
            'purposeText': s.purpose_text,
            'studentName': s.student_name
        } for s in waiting],
        'queueCounter': stats.queue_counter if stats else 100
    })

@app.route('/api/queue/join', methods=['POST'])
def join_queue():
    data = request.json
    stats = SystemStats.query.first()
    queue_number = stats.queue_counter
    stats.queue_counter += 1
    
    student = Student(
        queue_number=queue_number,
        purpose=data.get('purpose'),
        purpose_text=data.get('purposeText'),
        student_name=data.get('studentName', f"Student_{queue_number}"),
        status='waiting'
    )
    db.session.add(student)
    db.session.commit()
    
    position = Student.query.filter_by(status='waiting').filter(
        Student.joined_at <= student.joined_at
    ).count()
    
    socketio.emit('queue_updated', {})
    return jsonify({'success': True, 'queueNumber': queue_number, 'position': position})

@app.route('/api/queue/call-next', methods=['POST'])
@login_required
def call_next():
    current = Student.query.filter_by(is_current=True).first()
    if current:
        current.is_current = False
    
    next_student = Student.query.filter_by(status='waiting').order_by(Student.joined_at).first()
    if next_student:
        next_student.status = 'called'
        next_student.is_current = True
        db.session.commit()
        socketio.emit('student_called', {
            'queueNumber': next_student.queue_number,
            'purposeText': next_student.purpose_text
        })
        socketio.emit('queue_updated', {})
        return jsonify({'success': True, 'student': {
            'number': next_student.queue_number,
            'purposeText': next_student.purpose_text,
            'studentName': next_student.student_name
        }})
    return jsonify({'success': False, 'error': 'No students in queue'})

@app.route('/api/queue/complete', methods=['POST'])
@login_required
def complete_transaction():
    data = request.json
    student = Student.query.filter_by(queue_number=data.get('queueNumber')).first()
    if not student:
        return jsonify({'error': 'Student not found'}), 404
    
    wait_time = int((datetime.utcnow() - student.joined_at).total_seconds() / 60)
    
    transaction = Transaction(
        queue_number=student.queue_number,
        student_name=student.student_name,
        transaction_type=student.purpose_text,
        joined_at=student.joined_at,
        completed_at=datetime.utcnow(),
        waiting_time=wait_time,
        status='Completed',
        served_by=session.get('admin_username', 'Admin')
    )
    db.session.add(transaction)
    
    student.status = 'completed'
    student.is_current = False
    
    stats = SystemStats.query.first()
    stats.total_transactions += 1
    
    completed = Transaction.query.filter_by(status='Completed').all()
    if completed:
        stats.avg_wait_time = round(sum(t.waiting_time for t in completed) / len(completed), 1)
    
    db.session.commit()
    socketio.emit('transaction_completed', {'queueNumber': student.queue_number})
    socketio.emit('queue_updated', {})
    return jsonify({'success': True})

@app.route('/api/queue/cancel', methods=['POST'])
@login_required
def cancel_transaction():
    data = request.json
    student = Student.query.filter_by(queue_number=data.get('queueNumber')).first()
    if not student:
        return jsonify({'error': 'Student not found'}), 404
    
    wait_time = int((datetime.utcnow() - student.joined_at).total_seconds() / 60)
    
    transaction = Transaction(
        queue_number=student.queue_number,
        student_name=student.student_name,
        transaction_type=student.purpose_text,
        joined_at=student.joined_at,
        completed_at=datetime.utcnow(),
        waiting_time=wait_time,
        status='Cancelled',
        served_by=session.get('admin_username', 'Admin')
    )
    db.session.add(transaction)
    student.status = 'cancelled'
    student.is_current = False
    db.session.commit()
    socketio.emit('transaction_cancelled', {'queueNumber': student.queue_number})
    socketio.emit('queue_updated', {})
    return jsonify({'success': True})

@app.route('/api/student/status/<int:queue_number>', methods=['GET'])
def get_student_status(queue_number):
    student = Student.query.filter_by(queue_number=queue_number).first()
    if not student:
        transaction = Transaction.query.filter_by(queue_number=queue_number).first()
        if transaction:
            return jsonify({'status': transaction.status.lower()})
        return jsonify({'status': 'not_found'})
    
    position = Student.query.filter_by(status='waiting').filter(
        Student.joined_at <= student.joined_at
    ).count()
    
    return jsonify({
        'status': student.status,
        'position': position,
        'waitTime': position * 5,
        'isCurrent': student.is_current
    })

@app.route('/api/feedback/submit', methods=['POST'])
def submit_feedback():
    data = request.json
    feedback = Feedback(
        queue_number=data.get('queueNumber'),
        rating=data.get('rating'),
        comments=data.get('comments', ''),
        status='submitted',
        transaction_type=data.get('transactionType')
    )
    db.session.add(feedback)
    
    stats = SystemStats.query.first()
    all_feedback = Feedback.query.filter_by(status='submitted').all()
    if all_feedback:
        stats.avg_rating = round(sum(f.rating for f in all_feedback) / len(all_feedback), 1)
    
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/feedback/skip', methods=['POST'])
def skip_feedback():
    data = request.json
    feedback = Feedback(
        queue_number=data.get('queueNumber'),
        rating=0,
        comments='',
        status='skipped',
        transaction_type=data.get('transactionType')
    )
    db.session.add(feedback)
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/feedback/all', methods=['GET'])
@login_required
def get_all_feedback():
    feedbacks = Feedback.query.filter_by(status='submitted').order_by(Feedback.submitted_at.desc()).all()
    return jsonify([{
        'queueNumber': f.queue_number,
        'rating': f.rating,
        'comments': f.comments,
        'transactionType': f.transaction_type,
        'submittedAt': f.submitted_at.isoformat()
    } for f in feedbacks])

@app.route('/api/transactions', methods=['GET'])
@login_required
def get_transactions():
    transactions = Transaction.query.order_by(Transaction.completed_at.desc()).all()
    return jsonify([{
        'date': t.completed_at.strftime('%Y-%m-%d'),
        'queueNumber': t.queue_number,
        'studentName': t.student_name,
        'transactionType': t.transaction_type,
        'waitingTime': t.waiting_time,
        'status': t.status
    } for t in transactions])

@app.route('/api/stats', methods=['GET'])
def get_statistics():
    waiting_count = Student.query.filter_by(status='waiting').count()
    total_transactions = Transaction.query.count()
    stats = SystemStats.query.first()
    
    today = datetime.utcnow().date()
    tomorrow = today + timedelta(days=1)
    served_today = Transaction.query.filter(
        Transaction.completed_at >= today,
        Transaction.completed_at < tomorrow,
        Transaction.status == 'Completed'
    ).count()
    
    feedback_count = Feedback.query.filter_by(status='submitted').count()
    
    return jsonify({
        'servedToday': served_today,
        'avgWaitTime': stats.avg_wait_time if stats else 0,
        'waitingStudents': waiting_count,
        'totalTransactions': total_transactions,
        'avgRating': stats.avg_rating if stats else 0,
        'feedbackCount': feedback_count
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    socketio.run(app, host='0.0.0.0', port=port)
