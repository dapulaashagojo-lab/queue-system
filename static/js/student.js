let socket = null;
let studentQueueNumber = null;
let selectedPurpose = null;
let checkInterval = null;
let autoReload = null;
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

// Feedback Modal
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
    
    checkInterval = setInterval(() => {
        if (studentQueueNumber) updateStudentDisplay();
        loadCurrentServing();
    }, 3000);
});

// Enable sound on click
document.addEventListener('click', () => soundEnabled = true);

function initSocket() {
    socket = io();
    
    socket.on('student_called', function(data) {
        if (studentQueueNumber === data.queueNumber) {
            playSound();
            studentStatusEl.innerHTML = `<div><strong>Called!</strong> Please proceed.</div>`;
            waitingTimeEl.innerHTML = '👉 PROCEED NOW';
            cancelSection.style.display = 'none';
            showNotification('Called!', 'warning');
        }
    });
    
    socket.on('transaction_completed', function(data) {
        if (studentQueueNumber === data.queueNumber) {
            showFeedbackModal();
        }
    });
    
    socket.on('queue_updated', function() {
        if (studentQueueNumber) updateStudentDisplay();
    });
}

// Sound function
function playSound() {
    if (!soundEnabled) return;
    
    try {
        const audio = new Audio('/static/notification.mp3');
        audio.volume = 0.8;
        audio.play();
    } catch (e) {
        // Fallback beep
        try {
            const ctx = new AudioContext();
            for (let i = 0; i < 3; i++) {
                setTimeout(() => {
                    const osc = ctx.createOscillator();
                    osc.frequency.value = 800;
                    osc.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.1);
                }, i * 300);
            }
        } catch (e2) {}
    }
}

async function checkForExistingQueue() {
    const saved = localStorage.getItem('studentQueueNumber');
    if (saved) {
        studentQueueNumber = parseInt(saved);
        studentQueueNumberEl.textContent = saved.padStart(3, '0');
        joinQueueBtn.disabled = true;
        joinQueueBtn.innerHTML = '⏳ Waiting';
        purposeButtons.forEach(btn => btn.style.pointerEvents = 'none');
        await updateStudentDisplay();
    }
}

async function loadCurrentServing() {
    try {
        const res = await fetch('/api/queue/current');
        const data = await res.json();
        if (data.currentStudent) {
            currentServingNumberEl.textContent = data.currentStudent.number.toString().padStart(3, '0');
            currentTransactionTypeEl.textContent = data.currentStudent.purposeText;
        }
    } catch (e) {}
}

// Purpose selection
purposeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        purposeButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedPurpose = btn.dataset.purpose;
        joinQueueBtn.disabled = false;
        joinQueueBtn.innerHTML = `Join Queue for ${btn.textContent.trim()}`;
        waitingTimeEl.innerHTML = `✅ Ready`;
    });
});

// Join queue
joinQueueBtn.addEventListener('click', async () => {
    if (!selectedPurpose) return;
    
    try {
        const res = await fetch('/api/queue/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                purpose: selectedPurpose,
                purposeText: document.querySelector('.purpose-btn.selected').textContent.trim()
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            studentQueueNumber = data.queueNumber;
            localStorage.setItem('studentQueueNumber', data.queueNumber);
            studentQueueNumberEl.textContent = data.queueNumber.toString().padStart(3, '0');
            joinQueueBtn.disabled = true;
            joinQueueBtn.innerHTML = '⏳ Waiting';
            purposeButtons.forEach(btn => btn.style.pointerEvents = 'none');
            showNotification(`#${data.queueNumber}`, 'success');
            await updateStudentDisplay();
        }
    } catch (e) {
        showNotification('Error', 'danger');
    }
});

// Cancel
cancelTransactionBtn.addEventListener('click', async () => {
    if (!studentQueueNumber || !confirm('Cancel?')) return;
    
    try {
        await fetch('/api/queue/cancel-student', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queueNumber: studentQueueNumber })
        });
        resetStudentData();
        showNotification('Cancelled', 'success');
    } catch (e) {}
});

async function updateStudentDisplay() {
    if (!studentQueueNumber) return;
    
    try {
        const res = await fetch(`/api/student/status/${studentQueueNumber}`);
        const data = await res.json();
        
        if (data.status === 'waiting') {
            studentsAheadEl.textContent = data.position - 1;
            estimatedWaitDetailEl.textContent = `${data.waitTime} min`;
            yourPositionEl.textContent = `#${data.position}`;
            cancelSection.style.display = 'block';
        } else if (data.status === 'completed') {
            startAgainBtn.classList.add('show');
            localStorage.removeItem('studentQueueNumber');
            showFeedbackModal();
        }
    } catch (e) {}
}

function resetStudentData() {
    studentQueueNumber = null;
    studentQueueNumberEl.textContent = '---';
    waitingTimeEl.innerHTML = 'Select a transaction';
    studentsAheadEl.textContent = '0';
    estimatedWaitDetailEl.textContent = '-- min';
    yourPositionEl.textContent = '--';
    purposeButtons.forEach(btn => {
        btn.classList.remove('selected');
        btn.style.pointerEvents = 'auto';
    });
    joinQueueBtn.disabled = true;
    joinQueueBtn.innerHTML = 'Get Queue Number';
    localStorage.removeItem('studentQueueNumber');
    cancelSection.style.display = 'none';
}

// Feedback functions
function showFeedbackModal() {
    feedbackModal.classList.add('show');
}

function hideFeedbackModal() {
    feedbackModal.classList.remove('show');
}

skipFeedbackBtn.addEventListener('click', () => {
    hideFeedbackModal();
    startCountdown();
});

submitFeedbackBtn.addEventListener('click', async () => {
    let rating = 0;
    starInputs.forEach(i => { if (i.checked) rating = parseInt(i.value); });
    if (rating === 0) return showNotification('Select rating', 'warning');
    
    await fetch('/api/feedback/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            queueNumber: studentQueueNumber,
            rating,
            comments: feedbackComments.value
        })
    });
    
    feedbackForm.style.display = 'none';
    thankYouMessage.style.display = 'block';
    document.getElementById('submittedRating').textContent = rating;
    feedbackSubmittedCard.classList.add('show');
    startCountdown();
});

function startCountdown() {
    let count = 5;
    if (autoReload) clearInterval(autoReload);
    autoReload = setInterval(() => {
        count--;
        countdownEl.textContent = count;
        if (count <= 0) {
            clearInterval(autoReload);
            startNewTransaction();
        }
    }, 1000);
}

function startNewTransaction() {
    localStorage.removeItem('studentQueueNumber');
    hideFeedbackModal();
    location.reload();
}

function scrollToTransactionSection() {
    transactionSectionEl.scrollIntoView({ behavior: 'smooth' });
}

function showNotification(msg, type) {
    notificationEl.textContent = msg;
    notificationEl.className = `notification ${type} show`;
    setTimeout(() => notificationEl.classList.remove('show'), 3000);
}

// Cleanup
window.addEventListener('beforeunload', () => {
    if (checkInterval) clearInterval(checkInterval);
    if (autoReload) clearInterval(autoReload);
});
