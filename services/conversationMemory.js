const fs = require('fs');
const path = require('path');

const CONVERSATIONS_FILE = path.join(__dirname, '..', 'conversations.json');
const MAX_MESSAGES_PER_SESSION = 50; // Keep last 50 messages per user
const SESSION_TIMEOUT_HOURS = 24; // Sessions expire after 24 hours of inactivity

class ConversationMemory {
    constructor() {
        this.conversations = this.loadConversations();
        console.log('Conversation memory initialized');
    }

    loadConversations() {
        try {
            if (fs.existsSync(CONVERSATIONS_FILE)) {
                const data = fs.readFileSync(CONVERSATIONS_FILE, 'utf8');
                const parsed = JSON.parse(data);
                console.log(`Loaded ${Object.keys(parsed).length} conversation sessions`);
                return parsed;
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
        }
        return {};
    }

    saveConversations() {
        try {
            fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(this.conversations, null, 2));
        } catch (error) {
            console.error('Error saving conversations:', error);
        }
    }

    // Get session ID from WhatsApp chat ID (phone number)
    getSessionId(chatId) {
        // Extract phone number from WhatsApp chat ID (e.g., "972501234567@c.us" -> "972501234567")
        return chatId.replace('@c.us', '').replace('@g.us', '');
    }

    // Get or create a conversation session
    getSession(chatId) {
        const sessionId = this.getSessionId(chatId);

        if (!this.conversations[sessionId]) {
            this.conversations[sessionId] = {
                sessionId,
                chatId,
                messages: [],
                createdAt: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                metadata: {}
            };
        }

        return this.conversations[sessionId];
    }

    // Add a message to the conversation
    addMessage(chatId, role, content) {
        const session = this.getSession(chatId);

        session.messages.push({
            role, // 'user' or 'assistant'
            content,
            timestamp: new Date().toISOString()
        });

        // Keep only the last N messages
        if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
            session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
        }

        session.lastActivity = new Date().toISOString();
        this.saveConversations();
    }

    // Get conversation history for context
    getConversationHistory(chatId, maxMessages = 10) {
        const session = this.getSession(chatId);
        const recentMessages = session.messages.slice(-maxMessages);

        return recentMessages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    }

    // Format conversation history for AI prompt
    formatHistoryForPrompt(chatId, maxMessages = 10) {
        const history = this.getConversationHistory(chatId, maxMessages);

        if (history.length === 0) {
            return '';
        }

        const formatted = history.map(msg => {
            const prefix = msg.role === 'user' ? 'User' : 'Assistant';
            return `${prefix}: ${msg.content}`;
        }).join('\n');

        return `Previous conversation:\n${formatted}\n\n`;
    }

    // Get session metadata (for personalization)
    getMetadata(chatId) {
        const session = this.getSession(chatId);
        return session.metadata || {};
    }

    // Update session metadata
    updateMetadata(chatId, metadata) {
        const session = this.getSession(chatId);
        session.metadata = { ...session.metadata, ...metadata };
        this.saveConversations();
    }

    // Clear a specific session
    clearSession(chatId) {
        const sessionId = this.getSessionId(chatId);
        delete this.conversations[sessionId];
        this.saveConversations();
    }

    // Clear all expired sessions
    cleanupExpiredSessions() {
        const now = new Date();
        const timeoutMs = SESSION_TIMEOUT_HOURS * 60 * 60 * 1000;
        let cleaned = 0;

        for (const sessionId of Object.keys(this.conversations)) {
            const session = this.conversations[sessionId];
            const lastActivity = new Date(session.lastActivity);

            if (now - lastActivity > timeoutMs) {
                delete this.conversations[sessionId];
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} expired conversation sessions`);
            this.saveConversations();
        }
    }

    // Get statistics
    getStats() {
        const sessions = Object.values(this.conversations);
        return {
            totalSessions: sessions.length,
            totalMessages: sessions.reduce((sum, s) => sum + s.messages.length, 0),
            oldestSession: sessions.length > 0 ?
                sessions.reduce((oldest, s) => s.createdAt < oldest ? s.createdAt : oldest, sessions[0].createdAt) : null,
            newestSession: sessions.length > 0 ?
                sessions.reduce((newest, s) => s.createdAt > newest ? s.createdAt : newest, sessions[0].createdAt) : null
        };
    }
}

// Singleton instance
const conversationMemory = new ConversationMemory();

// Cleanup expired sessions every hour
setInterval(() => {
    conversationMemory.cleanupExpiredSessions();
}, 60 * 60 * 1000);

module.exports = conversationMemory;
