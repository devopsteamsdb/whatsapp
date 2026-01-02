// API Base URL
const API_BASE = '/api';

// DOM Elements
const startSessionBtn = document.getElementById('startSessionBtn');
const sessionCard = document.getElementById('sessionCard');
const qrPlaceholder = document.getElementById('qrPlaceholder');
const qrImage = document.getElementById('qrImage');
const statusBadge = document.getElementById('statusBadge');
const statusDropdown = document.getElementById('statusDropdown');
const headerLogoutBtn = document.getElementById('headerLogoutBtn');
const messageForm = document.getElementById('messageForm');
const messageResult = document.getElementById('messageResult');
const botEnabledToggle = document.getElementById('botEnabledToggle');
const botAIToggle = document.getElementById('botAIToggle');
const systemInstructionInput = document.getElementById('systemInstructionInput');
const patternsList = document.getElementById('patternsList');
const addPatternBtn = document.getElementById('addPatternBtn');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const imageFileName = document.getElementById('imageFileName');
const clearImageBtn = document.getElementById('clearImageBtn');
const imageUploadLabel = document.querySelector('.image-upload-label');

// State
let selectedMedia = null;
let statusCheckInterval = null;
let qrCheckInterval = null;
let isConnected = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Show loading state immediately
    updateStatusBadge('connecting', 'Initializing...');

    checkSessionStatus();
    loadBotConfig();
    setupEventListeners();

    // Start polling for status updates
    startStatusPolling();
    startQRPolling();
});

// Event Listeners
function setupEventListeners() {
    startSessionBtn.addEventListener('click', startSession);
    headerLogoutBtn.addEventListener('click', logout);
    messageForm.addEventListener('submit', sendMessage);
    botEnabledToggle.addEventListener('change', updateBotConfig);
    botAIToggle.addEventListener('change', updateBotConfig);
    if (systemInstructionInput) {
        systemInstructionInput.addEventListener('change', updateBotConfig);
    }
    addPatternBtn.addEventListener('click', addPattern);

    // Image handling
    if (imageInput) {
        imageInput.addEventListener('change', handleImageSelect);
        clearImageBtn.addEventListener('click', clearImage);
    }

    // Toggle dropdown on status badge click
    statusBadge.addEventListener('click', () => {
        if (isConnected) {
            const isVisible = statusDropdown.style.display === 'block';
            statusDropdown.style.display = isVisible ? 'none' : 'block';
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!statusBadge.contains(e.target)) {
            statusDropdown.style.display = 'none';
        }
    });
}

// Start Session
async function startSession() {
    try {
        startSessionBtn.disabled = true;
        startSessionBtn.textContent = 'Starting...';

        const response = await fetch(`${API_BASE}/session/start`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            updateStatusBadge('connecting', 'Connecting...');
            startQRPolling();
            startStatusPolling();
        } else {
            showError('Failed to start session');
        }
    } catch (error) {
        console.error('Error starting session:', error);
        showError('Failed to start session');
    } finally {
        startSessionBtn.disabled = false;
        startSessionBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10 8 16 12 10 16 10 8"/>
            </svg>
            Start Session
        `;
    }
}

// Check Session Status
async function checkSessionStatus() {
    try {
        const response = await fetch(`${API_BASE}/session/status`);
        const data = await response.json();

        if (data.success && data.status) {
            updateUI(data.status);

            if (data.status.isReady) {
                fetchSessionInfo();
            }
        }
    } catch (error) {
        console.error('Error checking status:', error);
    }
}

// Fetch Session Info
async function fetchSessionInfo() {
    try {
        const response = await fetch(`${API_BASE}/session/info`);
        const data = await response.json();

        if (data.success && data.info) {
            displaySessionInfo(data.info);
        }
    } catch (error) {
        console.error('Error fetching session info:', error);
    }
}

// Start QR Polling
function startQRPolling() {
    if (qrCheckInterval) {
        clearInterval(qrCheckInterval);
    }

    qrCheckInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/session/qr`);
            const data = await response.json();

            if (data.success && data.qrCode) {
                displayQRCode(data.qrCode);
            } else {
                checkSessionStatus();
            }
        } catch (error) {
            console.error('Error fetching QR code:', error);
        }
    }, 2000);
}

// Start Status Polling
function startStatusPolling() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }

    statusCheckInterval = setInterval(checkSessionStatus, 3000);
}

// Stop Polling
function stopPolling() {
    if (qrCheckInterval) {
        clearInterval(qrCheckInterval);
        qrCheckInterval = null;
    }
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
    }
}

// Display QR Code
function displayQRCode(qrDataUrl) {
    qrPlaceholder.style.display = 'none';
    qrImage.src = qrDataUrl;
    qrImage.style.display = 'block';
}

// Hide QR Code
function hideQRCode() {
    qrPlaceholder.style.display = 'flex';
    qrImage.style.display = 'none';
}

// Display Session Info in Header
function displaySessionInfo(info) {
    document.getElementById('headerPhone').textContent = info.phoneNumber || '-';
    document.getElementById('headerName').textContent = info.pushname || '-';
    document.getElementById('headerPlatform').textContent = info.platform || '-';
}

// Update UI based on status
function updateUI(status) {
    if (status.isReady) {
        isConnected = true;
        updateStatusBadge('connected', 'Connected');
        hideQRCode();
        sessionCard.style.display = 'none'; // Hide session card when connected
        stopPolling();
    } else if (status.hasQRCode) {
        isConnected = false;
        updateStatusBadge('connecting', 'Scan QR Code');
        sessionCard.style.display = 'block'; // Show session card when not connected
    } else {
        isConnected = false;
        updateStatusBadge('disconnected', 'Not Connected');
        hideQRCode();
        sessionCard.style.display = 'block'; // Show session card when not connected
    }
}

// Update Status Badge
function updateStatusBadge(status, text) {
    statusBadge.className = `status-badge ${status}`;
    statusBadge.querySelector('.status-text').textContent = text;
}

// Logout
async function logout() {
    try {
        headerLogoutBtn.disabled = true;

        const response = await fetch(`${API_BASE}/session/logout`, {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            isConnected = false;
            updateStatusBadge('disconnected', 'Not Connected');
            hideQRCode();
            sessionCard.style.display = 'block';
            statusDropdown.style.display = 'none';
            stopPolling();
        }
    } catch (error) {
        console.error('Error logging out:', error);
        showError('Failed to logout');
    } finally {
        headerLogoutBtn.disabled = false;
    }
}

// Send Message
async function sendMessage(e) {
    e.preventDefault();

    const phoneInput = document.getElementById('phoneInput');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendMessageBtn');

    const number = phoneInput.value.trim();
    const message = messageInput.value.trim();

    if (!number) {
        showMessageResult('Please enter a phone number', 'error');
        return;
    }

    if (!message && !selectedMedia) {
        showMessageResult('Please enter a message or select media', 'error');
        return;
    }

    try {
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';

        let response;

        if (selectedMedia) {
            // Send media with optional caption
            response = await fetch(`${API_BASE}/messages/send-media`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    number,
                    media: selectedMedia,
                    caption: message
                })
            });
        } else {
            // Send text message
            response = await fetch(`${API_BASE}/messages/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ number, message })
            });
        }

        const data = await response.json();

        if (data.success) {
            const successMsg = selectedMedia ? 'Media sent successfully!' : 'Message sent successfully!';
            showMessageResult(successMsg, 'success');
            messageInput.value = '';
            clearImage();
        } else {
            showMessageResult(data.error || 'Failed to send', 'error');
        }
    } catch (error) {
        console.error('Error sending:', error);
        showMessageResult('Failed to send', 'error');
    } finally {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Send Message
        `;
    }
}

// Handle Image Selection
function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    console.log('File selected:', file.name, file.type, file.size);

    // Validate file type
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        showMessageResult('Please select an image or video file', 'error');
        return;
    }

    // Video file size limit (10MB) - sharing same limit as API can handle
    if (file.size > 10 * 1024 * 1024) {
        showMessageResult('Media must be less than 10MB', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        const base64 = event.target.result.split(',')[1];
        selectedMedia = {
            mimetype: file.type,
            data: base64,
            filename: file.name
        };

        // Update UI
        imageFileName.textContent = file.name;
        imageUploadLabel.classList.add('has-file');
        clearImageBtn.style.display = 'block';

        const mediaPreviewContainer = document.getElementById('mediaPreviewContainer');
        const imagePreview = document.getElementById('imagePreview');
        const videoPreview = document.getElementById('videoPreview');

        mediaPreviewContainer.style.display = 'block';

        if (file.type.startsWith('image/')) {
            imagePreview.src = event.target.result;
            imagePreview.style.display = 'block';
            videoPreview.style.display = 'none';
        } else if (file.type.startsWith('video/')) {
            videoPreview.src = event.target.result;
            videoPreview.style.display = 'block';
            imagePreview.style.display = 'none';
        }
    };
    reader.readAsDataURL(file);
}

// Clear Image/Media
function clearImage() {
    selectedMedia = null;
    if (imageInput) imageInput.value = '';
    if (imageFileName) imageFileName.textContent = 'Choose media...';
    if (imageUploadLabel) imageUploadLabel.classList.remove('has-file');
    if (clearImageBtn) clearImageBtn.style.display = 'none';

    const mediaPreviewContainer = document.getElementById('mediaPreviewContainer');
    const imagePreview = document.getElementById('imagePreview');
    const videoPreview = document.getElementById('videoPreview');

    if (mediaPreviewContainer) mediaPreviewContainer.style.display = 'none';
    if (imagePreview) {
        imagePreview.src = '';
        imagePreview.style.display = 'none';
    }
    if (videoPreview) {
        videoPreview.src = '';
        videoPreview.style.display = 'none';
    }
}

// Load Bot Configuration
async function loadBotConfig() {
    try {
        const response = await fetch(`${API_BASE}/bot/config`);
        const data = await response.json();

        if (data.success && data.config) {
            botEnabledToggle.checked = data.config.enabled;
            botAIToggle.checked = data.config.useAI;
            if (systemInstructionInput) {
                systemInstructionInput.value = data.config.systemInstruction || '';
            }
            displayPatterns(data.config.patterns);
        }
    } catch (error) {
        console.error('Error loading bot config:', error);
    }
}

// Update Bot Configuration
async function updateBotConfig() {
    try {
        const response = await fetch(`${API_BASE}/bot/config`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                enabled: botEnabledToggle.checked,
                useAI: botAIToggle.checked,
                systemInstruction: systemInstructionInput ? systemInstructionInput.value : ''
            })
        });

        const data = await response.json();
        console.log('Bot config updated:', data);
    } catch (error) {
        console.error('Error updating bot config:', error);
    }
}

// Display Patterns
function displayPatterns(patterns) {
    patternsList.innerHTML = '';

    patterns.forEach(pattern => {
        const item = document.createElement('div');
        item.className = 'pattern-item';
        item.innerHTML = `
            <div class="pattern-content">
                <div class="pattern-trigger">${pattern.trigger}</div>
                <div class="pattern-response">${pattern.response}</div>
            </div>
            <button class="pattern-delete" onclick="deletePattern('${pattern.trigger}')">Delete</button>
        `;
        patternsList.appendChild(item);
    });
}

// Add Pattern
async function addPattern() {
    const triggerInput = document.getElementById('patternTrigger');
    const responseInput = document.getElementById('patternResponse');

    const trigger = triggerInput.value.trim();
    const response = responseInput.value.trim();

    if (!trigger || !response) {
        alert('Please fill in both trigger and response');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/bot/patterns`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ trigger, response })
        });

        const data = await res.json();

        if (data.success) {
            triggerInput.value = '';
            responseInput.value = '';
            loadBotConfig(); // Reload patterns
        }
    } catch (error) {
        console.error('Error adding pattern:', error);
    }
}

// Delete Pattern
async function deletePattern(trigger) {
    try {
        const response = await fetch(`${API_BASE}/bot/patterns/${encodeURIComponent(trigger)}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            loadBotConfig(); // Reload patterns
        }
    } catch (error) {
        console.error('Error deleting pattern:', error);
    }
}

// Show Message Result
function showMessageResult(message, type) {
    messageResult.textContent = message;
    messageResult.className = `message-result ${type}`;
    messageResult.style.display = 'block';

    setTimeout(() => {
        messageResult.style.display = 'none';
    }, 5000);
}

// Show Error
function showError(message) {
    console.error(message);
    alert(message);
}
