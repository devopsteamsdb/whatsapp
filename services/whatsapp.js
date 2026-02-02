const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const geminiService = require('./gemini');
const conversationMemory = require('./conversationMemory');
const webhookService = require('./webhook');
const dbService = require('./db');

const CONFIG_FILE = path.join(__dirname, '..', 'bot-config.json');

class WhatsAppService {
    constructor() {
        this.client = null;
        this.qrCode = null;
        this.isReady = false;
        this.isAuthenticated = false;
        this.sessionInfo = null;

        // Load bot configuration from file or use defaults
        this.botConfig = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const data = fs.readFileSync(CONFIG_FILE, 'utf8');
                const config = JSON.parse(data);
                console.log('Bot config loaded from file:', config);
                return config;
            }
        } catch (error) {
            console.error('Error loading bot config:', error);
        }

        // Return default config if file doesn't exist or error
        return {
            enabled: false,
            useAI: false,
            patterns: [
                { trigger: 'hello', response: 'Hi there! How can I help you?' },
                { trigger: 'hi', response: 'Hello! 👋' },
                { trigger: 'help', response: 'I\'m a WhatsApp bot. You can chat with me!' }
            ],
            systemInstruction: `You are a helpful, friendly WhatsApp assistant. Keep your responses concise and conversational (1-3 sentences when possible). Be natural and engaging. If asked about previous messages, refer to the conversation history provided.`
        };
    }

    saveConfig() {
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.botConfig, null, 2));
            console.log('Bot config saved to file');
        } catch (error) {
            console.error('Error saving bot config:', error);
        }
    }

    initialize() {
        if (this.client) {
            console.log('[WhatsApp] Client already initialized');
            return;
        }

        console.log('[WhatsApp] Creating new client instance...');
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: path.join(__dirname, '..', '.wwebjs_auth')
            }),
            puppeteer: {
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ]
            }
        });

        this.setupEventHandlers();
        this.client.initialize();
        console.log('[WhatsApp] WhatsApp client initialization started...');
    }

    setupEventHandlers() {
        this.client.on('qr', async (qr) => {
            console.log('QR Code received');
            this.qrCode = await qrcode.toDataURL(qr);
            this.isAuthenticated = false;
        });

        this.client.on('authenticated', () => {
            console.log('[WhatsApp] Client authenticated (Session saved)');
            this.isAuthenticated = true;
            this.qrCode = null;
        });

        this.client.on('ready', async () => {
            console.log('[WhatsApp] Client is ready!');
            this.isReady = true;
            this.isAuthenticated = true;

            // Get session info
            const info = this.client.info;
            this.sessionInfo = {
                phoneNumber: info.wid.user,
                platform: info.platform,
                pushname: info.pushname
            };
            console.log('[WhatsApp] Session info:', this.sessionInfo);
        });

        this.client.on('change_state', state => {
            console.log('[WhatsApp] State changed:', state);
        });

        this.client.on('loading_screen', (percent, message) => {
            console.log('[WhatsApp] Loading screen:', percent, message);
        });

        this.client.on('disconnected', (reason) => {
            console.log('[WhatsApp] ERROR: Client disconnected:', reason);
            this.isReady = false;
            this.isAuthenticated = false;
            this.qrCode = null;
            this.sessionInfo = null;
        });

        this.client.on('auth_failure', (msg) => {
            console.error('[WhatsApp] CRITICAL: Authentication failure:', msg);
            this.isAuthenticated = false;
        });

        this.client.on('message_create', async (message) => {
            console.log(`[WhatsApp] Event: Message created ${message.fromMe ? '(by me)' : '(incoming)'} (ID: ${message.id.id})`);

            // Extract sender and group information
            const contact = await message.getContact();
            const chat = await message.getChat();

            const senderName = contact.pushname || contact.name || message._data?.notifyName || (message.fromMe ? 'Me' : message.from.split('@')[0]);
            const isGroup = chat.isGroup;
            const groupName = isGroup ? chat.name : null;

            console.log(`[WhatsApp] Message ${message.fromMe ? 'from me' : 'from: ' + senderName} | Group: ${isGroup ? groupName : 'N/A'} | Body: ${message.body}`);

            // Index the message in the database (ALL messages)
            try {
                await dbService.saveMessage({
                    id: message.id.id,
                    timestamp: message.timestamp,
                    phone: message.from,
                    sender_name: senderName,
                    group_name: groupName,
                    body: message.body,
                    has_media: message.hasMedia,
                    media_description: null, // Basic indexing, media desc handled in bot logic if needed
                    is_group: isGroup
                });
            } catch (dbError) {
                console.error('[WhatsApp] Failed to index message:', dbError);
            }

            // Don't respond to own messages or if bot disabled
            if (message.fromMe) {
                return;
            }

            // Forward message to external API if configured
            console.log('Calling handleMessageForwarding...');
            this.handleMessageForwarding(message);

            if (!this.botConfig.enabled) {
                console.log('Bot is disabled, skipping auto-response bits (but still indexing).');
            }

            // Check for special commands
            if (message.body.toLowerCase() === '/clear') {
                conversationMemory.clearSession(message.from);
                await message.reply('🗑️ Conversation history cleared! Let\'s start fresh.');
                return;
            }

            if (message.body.toLowerCase() === '/history') {
                const history = conversationMemory.getConversationHistory(message.from, 5);
                if (history.length === 0) {
                    await message.reply('No conversation history yet.');
                } else {
                    const formatted = history.map(m =>
                        `${m.role === 'user' ? '👤' : '🤖'} ${m.content}`
                    ).join('\n\n');
                    await message.reply(`📜 Recent messages:\n\n${formatted}`);
                }
                return;
            }

            try {
                let mediaData = null;
                let mediaDescription = null;

                // Check for media
                if (message.hasMedia) {
                    try {
                        const media = await message.downloadMedia();
                        if (media) {
                            mediaData = {
                                mimetype: media.mimetype,
                                data: media.data,
                                filename: media.filename
                            };
                            console.log(`Received media. MimeType: ${media.mimetype}`);

                            // Process media description
                            if (geminiService.isAvailable()) {
                                console.log('Generating media description...');
                                mediaDescription = await geminiService.describeMedia(mediaData);
                                console.log('Media description:', mediaDescription);
                            }
                        }
                    } catch (mediaError) {
                        console.error('Error downloading media:', mediaError);
                    }
                }

                // Indexing already happened above

                // Send to Webhook (if enabled)
                webhookService.sendWebhook({
                    from: message.from,
                    body: message.body,
                    hasMedia: message.hasMedia,
                    media: mediaData,
                    timestamp: message.timestamp,
                    pushname: senderName,
                    isGroup: isGroup,
                    groupName: groupName
                });

                if (!this.botConfig.enabled) return;

                // Store the user's message in conversation memory (with a note for audio/media)
                const storedContent = mediaDescription ? `[Media: ${mediaDescription}] ${message.body}` : (message.hasMedia ? `[Media] ${message.body}` : message.body);
                conversationMemory.addMessage(message.from, 'user', storedContent);

                const response = await this.generateBotResponse(message.body, message.from, (mediaData && mediaData.mimetype.startsWith('audio/')) ? mediaData : null);
                if (response) {
                    // Store the bot's response in conversation memory
                    conversationMemory.addMessage(message.from, 'assistant', response);

                    await message.reply(response);
                    console.log(`Bot replied to: ${message.from}`);
                }
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });
    }

    getQRCode() {
        return this.qrCode;
    }

    getStatus() {
        return {
            isReady: this.isReady,
            isAuthenticated: this.isAuthenticated,
            hasQRCode: this.qrCode !== null,
            sessionInfo: this.sessionInfo
        };
    }

    async sendMessage(number, message) {
        if (!this.isReady) {
            throw new Error('Client is not ready. Please authenticate first.');
        }

        try {
            // Format number to WhatsApp format (remove special characters)
            let formattedNumber = number.replace(/[^\d]/g, '');

            // Add country code if not present (assuming international format)
            if (!formattedNumber.includes('@c.us')) {
                formattedNumber = `${formattedNumber}@c.us`;
            }

            // Get the valid WhatsApp ID for this number
            // This verification helps ensure we're sending to a valid user
            const numberId = await this.client.getNumberId(formattedNumber);
            if (!numberId) {
                throw new Error('This number is not registered on WhatsApp');
            }

            // Get the chat object explicitly - this helps avoid "markedUnread" errors
            // by ensuring the chat is fully loaded before we try to send to it
            const chat = await this.client.getChatById(numberId._serialized);
            if (!chat) {
                throw new Error('Could not establish chat with this number');
            }

            const result = await chat.sendMessage(message, { sendSeen: false });
            return {
                success: true,
                messageId: result.id.id,
                timestamp: result.timestamp
            };
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    }

    async getChats() {
        console.log(`[WhatsApp] Fetching chats from client... (isReady: ${this.isReady}, isAuthenticated: ${this.isAuthenticated})`);
        if (!this.isReady) {
            console.error('[WhatsApp] getChats failed: Client is not ready');
            throw new Error('Client is not ready. Please wait for the "ready" state.');
        }
        const chats = await this.client.getChats();
        console.log(`[WhatsApp] Successfully fetched ${chats.length} chats from client`);
        return chats.map(chat => ({
            id: chat.id._serialized,
            name: chat.name || chat.id.user,
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp,
            isGroup: chat.isGroup,
            lastMessage: chat.lastMessage ? {
                body: chat.lastMessage.body,
                timestamp: chat.lastMessage.timestamp,
                fromMe: chat.lastMessage.fromMe,
                type: chat.lastMessage.type
            } : null
        }));
    }

    async syncMessagesForDay(dateStr) {
        console.log(`[WhatsApp] Syncing messages for day: ${dateStr}`);
        if (!this.isReady) {
            console.error('[WhatsApp] Sync failed: Client is not ready');
            return 0;
        }

        try {
            const startOfDay = new Date(dateStr);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(dateStr);
            endOfDay.setHours(23, 59, 59, 999);

            const startTs = Math.floor(startOfDay.getTime() / 1000);
            const endTs = Math.floor(endOfDay.getTime() / 1000);

            const chats = await this.client.getChats();
            let totalSynced = 0;

            for (const chat of chats) {
                // Focus on chats with activity today
                if (chat.timestamp < startTs) continue;

                console.log(`[WhatsApp] Syncing history for chat: ${chat.name || chat.id.user}`);
                const messages = await chat.fetchMessages({ limit: 100 });

                for (const msg of messages) {
                    if (msg.timestamp >= startTs && msg.timestamp <= endTs) {
                        const contact = await msg.getContact();
                        const senderName = contact.pushname || contact.name || msg._data?.notifyName || (msg.fromMe ? 'Me' : msg.from.split('@')[0]);

                        await dbService.saveMessage({
                            id: msg.id.id,
                            timestamp: msg.timestamp,
                            phone: msg.from,
                            sender_name: senderName,
                            group_name: chat.isGroup ? chat.name : null,
                            body: msg.body,
                            has_media: msg.hasMedia,
                            media_description: null,
                            is_group: chat.isGroup
                        });
                        totalSynced++;
                    }
                }
            }

            console.log(`[WhatsApp] Sync complete. Total messages indexed: ${totalSynced}`);
            return totalSynced;
        } catch (error) {
            console.error('[WhatsApp] Sync error:', error);
            return 0;
        }
    }

    async getChatHistory(chatIdOrNumber, limit = 50) {
        if (!this.isReady) {
            console.error(`[WhatsApp] getChatHistory failed for ${chatIdOrNumber}: Client is not ready`);
            throw new Error('Client is not ready');
        }

        try {
            let chatId = chatIdOrNumber;
            // Only format if it doesn't look like a valid ID
            if (!chatId.includes('@')) {
                chatId = chatId.replace(/[^\d]/g, '') + '@c.us';
            }

            console.log(`[WhatsApp] Fetching chat history for: ${chatId} (limit: ${limit})`);

            const chat = await this.client.getChatById(chatId);
            if (!chat) {
                console.error(`[WhatsApp] Chat not found for ID: ${chatId}`);
                throw new Error(`Chat not found for ${chatId}`);
            }

            console.log(`[WhatsApp] Chat object retrieved for ${chatId}. Fetching messages...`);
            const messages = await chat.fetchMessages({ limit: limit });
            console.log(`[WhatsApp] Fetched ${messages.length} messages for ${chatId}`);

            return messages.map(msg => ({
                id: msg.id.id,
                body: msg.body,
                type: msg.type,
                timestamp: msg.timestamp,
                fromMe: msg.fromMe,
                author: msg.author,
                hasMedia: msg.hasMedia
            }));
        } catch (error) {
            console.error(`[WhatsApp] Error fetching chat history for ${chatIdOrNumber}:`, error);
            throw error;
        }
    }

    async sendMedia(number, mediaData, caption = '') {
        if (!this.isReady) {
            throw new Error('Client is not ready. Please authenticate first.');
        }

        try {
            // Format number to WhatsApp format
            let formattedNumber = number.replace(/[^\d]/g, '');

            // Get the valid WhatsApp ID for this number
            const numberId = await this.client.getNumberId(formattedNumber);
            if (!numberId) {
                throw new Error('This number is not registered on WhatsApp');
            }

            // WORKAROUND for "No LID for user" error:
            // Get or create the chat first - this forces WhatsApp to establish the LID
            const chat = await this.client.getChatById(numberId._serialized);
            if (!chat) {
                throw new Error('Could not establish chat with this number');
            }

            // Create MessageMedia from base64 data
            const media = new MessageMedia(mediaData.mimetype, mediaData.data, mediaData.filename);

            // Send via the chat object instead of client.sendMessage
            const result = await chat.sendMessage(media, {
                caption: caption,
                sendMediaAsDocument: mediaData.mimetype.startsWith('video/'), // Send videos as documents to avoid "Evaluation failed"
                sendSeen: false
            });

            return {
                success: true,
                messageId: result.id.id,
                timestamp: result.timestamp
            };
        } catch (error) {
            console.error('Error sending media:', error);
            throw error;
        }
    }

    async logout() {
        if (this.client) {
            await this.client.logout();
            await this.client.destroy();
            this.client = null;
            this.qrCode = null;
            this.isReady = false;
            this.isAuthenticated = false;
            this.sessionInfo = null;
            console.log('Client logged out and destroyed');
        }
    }

    getSessionInfo() {
        return this.sessionInfo;
    }

    // Bot configuration methods
    getBotConfig() {
        return this.botConfig;
    }

    updateBotConfig(config) {
        this.botConfig = { ...this.botConfig, ...config };
        this.saveConfig(); // Save to file
        console.log('Bot config updated:', this.botConfig);
    }

    async handleMessageForwarding(message) {
        console.log('Checking message forwarding...');
        const apiUrl = process.env.EXTERNAL_API_URL;
        console.log('Current EXTERNAL_API_URL:', apiUrl);

        if (!apiUrl) {
            console.log('No external API URL configured. Skipping forwarding.');
            return;
        }

        try {
            const payload = {
                from: message.from,
                body: message.body,
                timestamp: message.timestamp,
                senderName: message._data?.notifyName || message.from.split('@')[0],
                isGroup: message.from.includes('@g.us')
            };

            console.log(`Forwarding message to ${apiUrl}...`);
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            console.log(`Forwarded message response status: ${response.status}`);
        } catch (error) {
            console.error('Error forwarding message:', error);
        }
    }

    addPattern(trigger, response) {
        this.botConfig.patterns.push({ trigger, response });
        this.saveConfig(); // Save to file
    }

    removePattern(trigger) {
        this.botConfig.patterns = this.botConfig.patterns.filter(p => p.trigger !== trigger);
        this.saveConfig(); // Save to file
    }



    async generateBotResponse(messageText, chatId, media = null) {
        const lowerMessage = messageText.toLowerCase().trim();

        // Check static patterns first
        for (const pattern of this.botConfig.patterns) {
            if (lowerMessage.includes(pattern.trigger.toLowerCase())) {
                return pattern.response;
            }
        }

        // Use AI if enabled and no pattern matched
        if (this.botConfig.useAI && geminiService.isAvailable()) {
            try {
                // Get conversation history for context
                const conversationHistory = conversationMemory.formatHistoryForPrompt(chatId, 10);

                // Use global system instruction
                const systemInstruction = this.botConfig.systemInstruction;

                const aiResponse = await geminiService.generateResponse(messageText, conversationHistory, systemInstruction, media);
                return aiResponse;
            } catch (error) {
                console.error('AI response failed:', error);
                return null; // Don't respond if AI fails
            }
        }

        return null; // No response
    }

    // Get conversation memory stats
    getConversationStats() {
        return conversationMemory.getStats();
    }
}

// Singleton instance
const whatsappService = new WhatsAppService();

module.exports = whatsappService;
