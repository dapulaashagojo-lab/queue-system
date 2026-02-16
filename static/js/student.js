let socket = null;
let studentQueueNumber = null;
let selectedPurpose = null;
let checkForUpdatesInterval = null;
let autoReloadCountdown = null;
let isCurrentlyBeingCalled = false;
let soundEnabled = false;

// DOM Elements
const studentQueueNumberEl = document.getElementById('studentQueueNumber');
const waitingTimeEl = document.getElementById('waitingTime');
const studentStatusEl = document.getElementById('studentStatus');
const joinQueueBtn = document.getElementById('joinQueueBtn');
const purposeButtons = document.querySelectorAll('.purpose-btn');
const currentServingNumberEl = document.getElementById('currentServingNumber');
const currentTransactionTypeEl = document.getElementById('currentTransactionType');
const studentsAheadEl = document.getElementById('studentsAhead');
const estimatedWaitDetailEl = document.getElementById('estimatedWaitDetail');
const yourPositionEl = document.getElementById('yourPosition');
const notificationEl = document.getElementById('notification');
const transactionSectionEl = document.getElementById('transactionSection');
const cancelSection = document.getElementById('cancelSection');
const cancelTransactionBtn = document.getElementById('cancelTransactionBtn');
const feedbackSubmittedCard = document.getElementById('feedbackSubmittedCard');
const startAgainBtn = document.getElementById('startAgainBtn');

// Feedback Modal Elements
const feedbackModal = document.getElementById('feedbackModal');
const feedbackForm = document.getElementById('feedbackForm');
const thankYouMessage = document.getElementById('thankYouMessage');
const skipFeedbackBtn = document.getElementById('skipFeedbackBtn');
const submitFeedbackBtn = document.getElementById('submitFeedbackBtn');
const feedbackComments = document.getElementById('feedbackComments');
const charCount = document.getElementById('charCount');
const starInputs = document.querySelectorAll('input[name="rating"]');
const countdownEl = document.getElementById('countdown');

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initSocket();
    checkForExistingQueue();
    loadCurrentServing();
    
    checkForUpdatesInterval = setInterval(() => {
        checkForUpdates();
    }, 3000);
});

// Enable sound on first click
document.addEventListener('click', function() {
    if (!soundEnabled) {
        soundEnabled = true;
    }
});

function initSocket() {
    socket = io();
    
    socket.on('connect', function() {
        console.log('Connected to server');
    });
    
    socket.on('student_called', function(data) {
        if (studentQueueNumber === data.queueNumber) {
            playCallSound();
            studentStatusEl.innerHTML = `
                <i class="fas fa-bullhorn fa-2x" style="color: var(--success-green);"></i>
                <div>
                    <strong>Status:</strong> Your number <strong>${data.queueNumber}</strong> has been called!
                    <br>Please proceed to the Registrar's Office immediately.
                </div>
            `;
            waitingTimeEl.innerHTML = '<i class="fas fa-bullhorn"></i> PLEASE PROCEED NOW';
            cancelSection.style.display = 'none';
            showNotification('Your number has been called!', 'warning');
            isCurrentlyBeingCalled = true;
        }
    });
    
    socket.on('transaction_completed', function(data) {
        if (studentQueueNumber === data.queueNumber) {
            showFeedbackModal();
        }
    });
    
    socket.on('transaction_cancelled', function(data) {
        if (studentQueueNumber === data.queueNumber) {
            showNotification('Your transaction was cancelled', 'warning');
            resetStudentData();
        }
    });
    
    socket.on('queue_updated', function() {
        if (studentQueueNumber) {
            updateStudentDisplay();
        }
    });
}

// FIXED: Play your notification.mp3 file
function playCallSound() {
    if (!soundEnabled) return;
    
    try {
        // Try to play your uploaded MP3 file
        const audio = new Audio('/static/notification.mp3');
        audio.volume = 0.8;
        audio.play().catch(e => {
            console.log('MP3 failed to load, using fallback sound', e);
            playFallbackSound();
        });
        console.log('Playing notification.mp3');
    } catch (e) {
        console.log('Audio error:', e);
        playFallbackSound();
    }
}

// Fallback sound if MP3 doesn't load
function playFallbackSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create 3 beeps
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.value = 800;
                oscillator.type = 'sine';
                
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.2);
            }, i * 300);
        }
    } catch (e) {
        console.log('Fallback audio failed');
    }
}

async function checkForExistingQueue() {
    const saved = localStorage.getItem('studentQueueNumber');
    if (saved) {
        studentQueueNumber = parseInt(saved);
        studentQueueNumberEl.textContent = saved.padStart(3, '0');
        
        joinQueueBtn.disabled = true;
        joinQueueBtn.innerHTML = '<i class="fas fa-clock"></i> Waiting in Queue';
        purposeButtons.forEach(btn => {
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.6';
        });
        
        await updateStudentDisplay();
    }
}

async function loadCurrentServing() {
    try {
        const response = await fetch('/api/queue/current');
        const data = await response.json();
        
        if (data.currentStudent) {
            currentServingNumberEl.textContent = data.currentStudent.number.toString().padStart(3, '0');
            currentTransactionTypeEl.textContent = data.currentStudent.purposeText;
        }
    } catch (error) {
        console.error('Error loading current serving:', error);
    }
}

purposeButtons.forEach(button => {
    button.addEventListener('click', () => {
        purposeButtons.forEach(btn => btn.classList.remove('selected'));
        button.classList.add('selected');
        selectedPurpose = button.getAttribute('data-purpose');
        
        joinQueueBtn.disabled = false;
        joinQueueBtn.innerHTML = `<i class="fas fa-plus-circle"></i> Join Queue for ${button.textContent.trim()}`;
        
        studentStatusEl.innerHTML = `
            <i class="fas fa-check-circle fa-2x" style="color: var(--success-green);"></i>
            <div>
                <strong>Status:</strong> Ready to join queue for <strong>${button.textContent.trim()}</strong>
            </div>
        `;
        
        waitingTimeEl.innerHTML = `<i class="fas fa-check-circle"></i> Ready for ${button.textContent.trim()}`;
        waitingTimeEl.classList.remove('clickable');
        waitingTimeEl.onclick = null;
    });
});

joinQueueBtn.addEventListener('click', async () => {
    if (!selectedPurpose) return;
    
    const purposeText = document.querySelector('.purpose-btn.selected').textContent.trim();
    
    try {
        const response = await fetch('/api/queue/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                purpose: selectedPurpose,
                purposeText: purposeText,
                studentName: `Student_${Date.now()}`
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            studentQueueNumber = data.queueNumber;
            localStorage.setItem('studentQueueNumber', data.queueNumber);
            studentQueueNumberEl.textContent = data.queueNumber.toString().padStart(3, '0');
            
            joinQueueBtn.disabled = true;
            joinQueueBtn.innerHTML = '<i class="fas fa-clock"></i> Waiting in Queue';
            purposeButtons.forEach(btn => {
                btn.style.pointerEvents = 'none';
                btn.style.opacity = '0.6';
            });
            
            waitingTimeEl.innerHTML = `<i class="fas fa-clock"></i> Estimated Wait: ${data.position * 5} minutes`;
            showNotification(`Queue number ${data.queueNumber} generated!`, 'success');
            await updateStudentDisplay();
        }
    } catch (error) {
        showNotification('Error joining queue', 'danger');
    }
});

cancelTransactionBtn.addEventListener('click', async function() {
    if (!studentQueueNumber) return;
    if (!confirm('Cancel your transaction?')) return;
    
    try {
        const response = await fetch('/api/queue/cancel-student', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queueNumber: studentQueueNumber })
        });
        
        if (response.ok) {
            studentStatusEl.innerHTML = `
                <i class="fas fa-times-circle fa-2x" style="color: var(--danger-red);"></i>
                <div>
                    <strong>Status:</strong> You have cancelled your transaction.
                </div>
            `;
            resetStudentData();
            showNotification('Transaction cancelled', 'success');
        }
    } catch (error) {
        showNotification('Error cancelling transaction', 'danger');
    }
});

async function updateStudentDisplay() {
    if (!studentQueueNumber) return;
    
    try {
        const response = await fetch(`/api/student/status/${studentQueueNumber}`);
        const data = await response.json();
        
        if (data.status === 'waiting') {
            studentsAheadEl.textContent = data.position - 1;
            estimatedWaitDetailEl.textContent = `${data.waitTime} minutes`;
            yourPositionEl.textContent = `#${data.position}`;
            waitingTimeEl.innerHTML = `<i class="fas fa-clock"></i> Estimated Wait: ${data.waitTime} minutes`;
            cancelSection.style.display = 'block';
            
            if (data.position === 1) {
                studentStatusEl.innerHTML = `
                    <i class="fas fa-hourglass-half fa-2x" style="color: var(--warning-orange);"></i>
                    <div>
                        <strong>Status:</strong> You are <strong>next in line</strong>.
                    </div>
                `;
            }
        } else if (data.status === 'called') {
            // Will be handled by socket
        } else if (data.status === 'completed') {
            studentStatusEl.innerHTML = `
                <i class="fas fa-check-circle fa-2x" style="color: var(--success-green);"></i>
                <div>
                    <strong>Status:</strong> Your transaction has been completed.
                </div>
            `;
            startAgainBtn.classList.add('show');
            localStorage.removeItem('studentQueueNumber');
            showFeedbackModal();
        } else if (data.status === 'cancelled') {
            studentStatusEl.innerHTML = `
                <i class="fas fa-times-circle fa-2x" style="color: var(--danger-red);"></i>
                <div>
                    <strong>Status:</strong> Your transaction was cancelled.
                </div>
            `;
            startAgainBtn.classList.add('show');
            localStorage.removeItem('studentQueueNumber');
        }
    } catch (error) {
        console.error('Error updating status:', error);
    }
}

function showFeedbackModal() {
    feedbackModal.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function hideFeedbackModal() {
    feedbackModal.classList.remove('show');
    document.body.style.overflow = 'auto';
}

function resetFeedbackForm() {
    starInputs.forEach(input => input.checked = false);
    feedbackComments.value = '';
    charCount.textContent = '0';
    feedbackForm.style.display = 'block';
    thankYouMessage.style.display = 'none';
}

feedbackComments.addEventListener('input', function() {
    charCount.textContent = this.value.length;
});

skipFeedbackBtn.addEventListener('click', async function() {
    await fetch('/api/feedback/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            queueNumber: studentQueueNumber,
            transactionType: selectedPurpose
        })
    });
    
    hideFeedbackModal();
    resetFeedbackForm();
    startAutoReloadCountdown();
});

submitFeedbackBtn.addEventListener('click', async function() {
    let rating = 0;
    starInputs.forEach(input => {
        if (input.checked) rating = parseInt(input.value);
    });
    
    if (rating === 0) {
        showNotification('Please select a rating', 'warning');
        return;
    }
    
    await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            queueNumber: studentQueueNumber,
            rating: rating,
            comments: feedbackComments.value.trim(),
            transactionType: selectedPurpose
        })
    });
    
    feedbackForm.style.display = 'none';
    thankYouMessage.style.display = 'block';
    
    document.getElementById('submittedRating').textContent = rating;
    feedbackSubmittedCard.classList.add('show');
    localStorage.setItem(`feedback_${studentQueueNumber}`, rating);
    
    startAutoReloadCountdown();
});

function startAutoReloadCountdown() {
    let countdown = 5;
    countdownEl.textContent = countdown;
    
    if (autoReloadCountdown) clearInterval(autoReloadCountdown);
    
    autoReloadCountdown = setInterval(function() {
        countdown--;
        countdownEl.textContent = countdown;
        if (countdown <= 0) {
            clearInterval(autoReloadCountdown);
            startNewTransaction();
        }
    }, 1000);
}

function startNewTransaction() {
    localStorage.removeItem('studentQueueNumber');
    hideFeedbackModal();
    location.reload();
}

function resetStudentData() {
    studentQueueNumber = null;
    studentQueueNumberEl.textContent = '---';
    waitingTimeEl.innerHTML = '<i class="fas fa-arrow-down"></i> Select a transaction to begin';
    studentsAheadEl.textContent = '0';
    estimatedWaitDetailEl.textContent = '-- minutes';
    yourPositionEl.textContent = '--';
    
    purposeButtons.forEach(btn => {
        btn.classList.remove('selected');
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
    });
    
    joinQueueBtn.disabled = true;
    joinQueueBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Get Queue Number';
    selectedPurpose = null;
    
    waitingTimeEl.classList.add('clickable');
    waitingTimeEl.onclick = scrollToTransactionSection;
    
    localStorage.removeItem('studentQueueNumber');
    cancelSection.style.display = 'none';
}

function scrollToTransactionSection() {
    if (!studentQueueNumber) {
        transactionSectionEl.scrollIntoView({ behavior: 'smooth' });
        showNotification('Select a transaction type', 'info');
    }
}

function showNotification(message, type) {
    notificationEl.textContent = message;
    notificationEl.className = `notification ${type} show`;
    setTimeout(() => notificationEl.classList.remove('show'), 3000);
}

async function checkForUpdates() {
    if (studentQueueNumber) {
        await updateStudentDisplay();
    }
    await loadCurrentServing();
}

window.addEventListener('beforeunload', function() {
    if (checkForUpdatesInterval) clearInterval(checkForUpdatesInterval);
    if (autoReloadCountdown) clearInterval(autoReloadCountdown);
});
