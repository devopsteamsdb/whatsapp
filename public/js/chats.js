let currentChatId = null;
let chatsCache = [];
let pollingInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    fetchChats();
    setupEventListeners();

    // Poll for changes every 5 seconds
    setInterval(fetchChats, 5000);
});

function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        filterChats(e.target.value);
    });

    // Message input (Enter to send)
    const messageInput = document.getElementById('messageInput');
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    const sendBtnIcon = document.getElementById('sendBtnIcon');
    messageInput.addEventListener('input', (e) => {
        if (e.target.value.trim().length > 0) {
            sendBtnIcon.classList.remove('fa-microphone');
            sendBtnIcon.classList.add('fa-paper-plane');
        } else {
            sendBtnIcon.classList.remove('fa-paper-plane');
            sendBtnIcon.classList.add('fa-microphone');
        }
    });

    // Modal click outside to close
    window.onclick = function (event) {
        const modal = document.getElementById('newChatModal');
        if (event.target == modal) {
            modal.classList.add('hidden');
        }
    }
}

async function fetchChats() {
    try {
        const response = await fetch('/api/chats');
        const data = await response.json();

        if (data.success) {
            chatsCache = data.chats;
            renderChatList(chatsCache);

            // If we have an open chat, refresh its messages too (optional optimization)
            if (currentChatId) {
                // In a real app we'd fetch just updates, but here we can just ensure the list reflects latest
                // The actual message area refresh logic is handled separately if needed
            }
        }
    } catch (error) {
        console.error('Error fetching chats:', error);
    }
}

function renderChatList(chats) {
    const chatList = document.getElementById('chatList');
    // Save scroll position
    const scrollTop = chatList.scrollTop;

    // Don't fully rebuild if not needed to avoid jitter, but for now simple rebuild
    // Filter based on search
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filteredChats = chats.filter(chat =>
        chat.name.toLowerCase().includes(searchTerm) ||
        chat.id.replace('@c.us', '').includes(searchTerm)
    );

    let html = '';

    if (filteredChats.length === 0) {
        html = '<div style="text-align: center; padding: 20px; color: var(--wa-text-secondary);">No chats found</div>';
    } else {
        filteredChats.forEach(chat => {
            const time = formatTime(chat.timestamp);
            const activeClass = currentChatId === chat.id ? 'active' : '';
            const unreadBadge = chat.unreadCount > 0 ? `<div class="unread-badge">${chat.unreadCount}</div>` : '';

            // Last message preview
            let lastMsg = '';
            if (chat.lastMessage) {
                const prefix = chat.lastMessage.fromMe ? '<i class="fas fa-check-double" style="font-size: 10px; margin-right: 3px; color: #53bdeb;"></i> ' : '';
                lastMsg = prefix + (chat.lastMessage.body || (chat.lastMessage.type === 'image' ? '📷 Photo' : 'Msg'));
            }

            html += `
                <div class="chat-item ${activeClass}" onclick="loadChat('${chat.id}', '${chat.name.replace(/'/g, "\\'")}')">
                    <div class="chat-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="chat-info">
                        <div class="chat-title-row">
                            <div class="chat-name">${chat.name}</div>
                            <div class="chat-time">${time}</div>
                        </div>
                        <div class="chat-last-msg-row">
                            <div class="chat-last-msg">${lastMsg}</div>
                            ${unreadBadge}
                        </div>
                    </div>
                </div>
            `;
        });
    }

    chatList.innerHTML = html;
    chatList.scrollTop = scrollTop;
}

function filterChats(searchTerm) {
    renderChatList(chatsCache);
}

async function loadChat(chatId, chatName) {
    currentChatId = chatId;

    // Update UI active state
    renderChatList(chatsCache);

    // Show Chat Area
    document.getElementById('placeholderView').classList.add('hidden');
    document.getElementById('activeChatView').classList.remove('hidden');

    // Update Header
    document.getElementById('headerName').innerText = chatName;
    document.getElementById('headerAvatar').innerHTML = '<i class="fas fa-user"></i>';
    document.getElementById('headerStatus').innerText = 'online'; // Mock status

    // Load Messages
    await fetchMessages(chatId);

    // Scroll to bottom
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

async function fetchMessages(chatId) {
    try {
        const response = await fetch(`/api/messages/${chatId}?limit=50`);
        const data = await response.json();

        if (data.success) {
            renderMessages(data.messages);
        }
    } catch (error) {
        console.error('Error fetching messages:', error);
    }
}

function renderMessages(messages) {
    const container = document.getElementById('messagesContainer');
    let html = '';

    messages.forEach(msg => {
        // API returns { fromMe: boolean, body: string, ... }
        const isOutgoing = msg.fromMe;
        const bubbleClass = isOutgoing ? 'outgoing' : 'incoming';

        html += `
            <div class="message-bubble ${bubbleClass}">
                <div class="message-text">${formatMessageContent(msg.body || '')}</div>
                <div class="message-meta">
                    ${formatTime(msg.timestamp || Date.now() / 1000)}
                    ${bubbleClass === 'outgoing' ? '<i class="fas fa-check-double message-status blue"></i>' : ''}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function formatMessageContent(content) {
    // Basic link formatting could go here
    return content.replace(/\n/g, '<br>');
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
        return date.toLocaleDateString([], { weekday: 'short' });
    } else {
        return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: '2-digit' });
    }
}

async function sendMessage() {
    if (!currentChatId) return;

    const input = document.getElementById('messageInput');
    const message = input.value.trim();

    if (!message) return;

    // Optimistic UI update
    const container = document.getElementById('messagesContainer');
    const tempHtml = `
        <div class="message-bubble outgoing opacity-50">
            <div class="message-text">${formatMessageContent(message)}</div>
            <div class="message-meta"><i class="far fa-clock"></i></div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', tempHtml);
    container.scrollTop = container.scrollHeight;
    input.value = '';

    try {
        const response = await fetch('/api/messages/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                number: currentChatId,
                message: message
            })
        });

        const data = await response.json();

        if (data.success) {
            // Reload messages to get the real state
            await fetchMessages(currentChatId);
        } else {
            alert('Error sending message: ' + data.error);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
    }
}

function startNewChat() {
    document.getElementById('newChatModal').classList.remove('hidden');
    document.getElementById('newChatNumber').focus();
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function openNewChat() {
    const number = document.getElementById('newChatNumber').value.replace(/[^\d]/g, '');
    if (number) {
        const chatId = number + '@c.us';
        closeModal('newChatModal');
        loadChat(chatId, number);
        // Force refresh chats to see if it exists
        fetchChats();
    }
}

function triggerFileUpload() {
    document.getElementById('mediaInput').click();
}

async function handleFileUpload(input) {
    if (!currentChatId || !input.files || !input.files[0]) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async function (e) {
        const base64Data = e.target.result.split(',')[1];
        const mimetype = file.type;
        const filename = file.name;

        // Optimistic UI for image
        if (mimetype.startsWith('image/')) {
            const container = document.getElementById('messagesContainer');
            const tempHtml = `
                <div class="message-bubble outgoing opacity-50">
                    <div class="message-text">
                        <img src="${e.target.result}" style="max-width: 200px; border-radius: 8px;">
                    </div>
                     <div class="message-meta"><i class="far fa-clock"></i></div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', tempHtml);
            container.scrollTop = container.scrollHeight;
        }

        try {
            const response = await fetch('/api/messages/send-media', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    number: currentChatId,
                    media: {
                        mimetype: mimetype,
                        data: base64Data,
                        filename: filename
                    },
                    caption: ''
                })
            });

            const data = await response.json();
            if (data.success) {
                await fetchMessages(currentChatId);
            } else {
                alert('Error sending media: ' + data.error);
            }
        } catch (error) {
            console.error('Error sending media:', error);
            alert('Failed to send media');
        }
    };

    reader.readAsDataURL(file);
    input.value = ''; // Reset
}
