let socket = null;

document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    initSocket();
    loadDashboard();
    setInterval(loadDashboard, 3000);
});

async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        
        if (!data.authenticated) {
            window.location.href = '/login';
        } else {
            document.querySelector('.user-welcome').textContent = `Welcome, ${data.admin.name}`;
        }
    } catch (error) {
        console.error('Auth error:', error);
    }
}

function initSocket() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('Connected to server');
    });
    
    socket.on('queue_updated', function() {
        loadDashboard();
    });
}

async function loadDashboard() {
    try {
        const [queueData, statsData] = await Promise.all([
            fetch('/api/queue/current').then(res => res.json()),
            fetch('/api/stats').then(res => res.json())
        ]);
        
        updateDashboard(queueData, statsData);
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

function updateDashboard(queueData, statsData) {
    // Update current serving
    const currentServingEl = document.getElementById('currentServing');
    const currentTransactionEl = document.getElementById('currentTransaction');
    const completeBtn = document.getElementById('completeBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    
    if (queueData.currentStudent) {
        currentServingEl.textContent = queueData.currentStudent.number.toString().padStart(3, '0');
        currentTransactionEl.textContent = `${queueData.currentStudent.purposeText} (${queueData.currentStudent.studentName})`;
        completeBtn.disabled = false;
        cancelBtn.disabled = false;
    } else {
        currentServingEl.textContent = '---';
        currentTransactionEl.textContent = 'No active transaction';
        completeBtn.disabled = true;
        cancelBtn.disabled = true;
    }
    
    // Update queue list
    const queueListEl = document.getElementById('queueList');
    const queueCountEl = document.getElementById('queueCount');
    const callNextBtn = document.getElementById('callNextBtn');
    
    if (queueData.queue && queueData.queue.length > 0) {
        queueListEl.innerHTML = '';
        queueData.queue.forEach((student, index) => {
            const waitTime = (index + 1) * 5;
            
            const queueItem = document.createElement('div');
            queueItem.className = 'queue-item';
            queueItem.innerHTML = `
                <div class="queue-info">
                    <div class="queue-badge">#${student.number}</div>
                    <div>
                        <div><strong>${student.purposeText}</strong></div>
                        <div>${student.studentName}</div>
                    </div>
                </div>
                <div class="waiting-time">
                    ${index === 0 ? 'Next' : `~${waitTime} min`}
                </div>
            `;
            queueListEl.appendChild(queueItem);
        });
        
        queueCountEl.textContent = `${queueData.queue.length} waiting`;
        callNextBtn.disabled = false;
    } else {
        queueListEl.innerHTML = '<div class="queue-item">No students in queue</div>';
        queueCountEl.textContent = '0 waiting';
        callNextBtn.disabled = true;
    }
    
    // Update stats
    document.getElementById('servedToday').textContent = statsData.servedToday || 0;
    document.getElementById('avgWaitTime').textContent = statsData.avgWaitTime || 0;
    document.getElementById('waitingStudents').textContent = statsData.waitingStudents || 0;
    document.getElementById('totalTransactions').textContent = statsData.totalTransactions || 0;
    document.getElementById('avgRating').textContent = statsData.avgRating || '0.0';
    document.getElementById('feedbackCount').textContent = statsData.feedbackCount || 0;
}

async function callNextStudent() {
    try {
        const response = await fetch('/api/queue/call-next', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Called #${data.student.number}`, 'success');
        } else {
            showNotification(data.error || 'No students', 'warning');
        }
    } catch (error) {
        showNotification('Error', 'danger');
    }
}

async function completeCurrent() {
    const current = document.getElementById('currentServing').textContent;
    if (current === '---') {
        showNotification('No active transaction', 'warning');
        return;
    }
    
    try {
        const response = await fetch('/api/queue/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queueNumber: parseInt(current) })
        });
        
        if (response.ok) {
            showNotification('Completed', 'success');
        }
    } catch (error) {
        showNotification('Error', 'danger');
    }
}

async function cancelCurrent() {
    const current = document.getElementById('currentServing').textContent;
    if (current === '---') {
        showNotification('No active transaction', 'warning');
        return;
    }
    
    if (!confirm('Cancel this transaction?')) return;
    
    try {
        const response = await fetch('/api/queue/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queueNumber: parseInt(current) })
        });
        
        if (response.ok) {
            showNotification('Cancelled', 'danger');
        }
    } catch (error) {
        showNotification('Error', 'danger');
    }
}

async function showSystemLog() {
    document.getElementById('systemLogPanel').style.display = 'block';
    document.getElementById('feedbackPanel').classList.remove('show');
    
    try {
        const response = await fetch('/api/transactions');
        const transactions = await response.json();
        
        const tbody = document.getElementById('logTableBody');
        tbody.innerHTML = '';
        
        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6">No logs</td></tr>';
            return;
        }
        
        transactions.forEach(t => {
            tbody.innerHTML += `
                <tr>
                    <td>${t.date}</td>
                    <td>#${t.queueNumber}</td>
                    <td>${t.studentName}</td>
                    <td>${t.transactionType}</td>
                    <td>${t.waitingTime || 0}</td>
                    <td class="${t.status === 'Completed' ? 'status-completed' : 'status-cancelled'}">${t.status}</td>
                </tr>
            `;
        });
    } catch (error) {
        console.error(error);
    }
}

async function showFeedbackPanel() {
    document.getElementById('feedbackPanel').classList.add('show');
    document.getElementById('systemLogPanel').style.display = 'none';
    
    try {
        const response = await fetch('/api/feedback/all');
        const feedbacks = await response.json();
        
        const content = document.querySelector('.feedback-summary');
        const noFeedback = document.getElementById('noFeedbackMessage');
        
        if (feedbacks.length === 0) {
            content.innerHTML = '';
            noFeedback.style.display = 'block';
            return;
        }
        
        noFeedback.style.display = 'none';
        content.innerHTML = '';
        
        feedbacks.forEach(f => {
            content.innerHTML += `
                <div class="feedback-card">
                    <div><strong>#${f.queueNumber}</strong> <small>${new Date(f.submittedAt).toLocaleDateString()}</small></div>
                    <div>${'★'.repeat(f.rating)}${'☆'.repeat(5-f.rating)} ${f.rating}/5</div>
                    ${f.comments ? `<div>"${f.comments}"</div>` : ''}
                </div>
            `;
        });
    } catch (error) {
        console.error(error);
    }
}

async function resetSystemLog() {
    if (confirm('Reset all transaction history?')) {
        await fetch('/api/stats/reset', { method: 'POST' });
        showNotification('Log reset', 'info');
        if (document.getElementById('systemLogPanel').style.display === 'block') {
            showSystemLog();
        }
    }
}

async function downloadExcel() {
    try {
        const response = await fetch('/api/transactions');
        const transactions = await response.json();
        
        if (transactions.length === 0) {
            showNotification('No data', 'warning');
            return;
        }
        
        let csv = "Date,Queue,Student,Transaction,Wait,Status\n";
        transactions.forEach(t => {
            csv += `${t.date},${t.queueNumber},"${t.studentName}","${t.transactionType}",${t.waitingTime || 0},${t.status}\n`;
        });
        
        const link = document.createElement('a');
        link.href = encodeURI('data:text/csv;charset=utf-8,' + csv);
        link.download = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        
        showNotification('Downloaded', 'success');
    } catch (error) {
        showNotification('Error', 'danger');
    }
}

function closeFeedbackPanel() {
    document.getElementById('feedbackPanel').classList.remove('show');
}

function closeLogPanel() {
    document.getElementById('systemLogPanel').style.display = 'none';
}

function refreshDashboard() {
    loadDashboard();
    showNotification('Refreshed', 'info');
}

function viewStudentPage() {
    window.open('/student', '_blank');
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
}

function showNotification(message, type) {
    const el = document.getElementById('notification');
    el.textContent = message;
    el.className = `notification ${type} show`;
    setTimeout(() => el.classList.remove('show'), 3000);
}
