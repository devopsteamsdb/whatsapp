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
            console.log('Client already initialized');
            return;
        }

        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './.wwebjs_auth'
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
        console.log('WhatsApp client initialization started...');
    }

    setupEventHandlers() {
        this.client.on('qr', async (qr) => {
            console.log('QR Code received');
            this.qrCode = await qrcode.toDataURL(qr);
            this.isAuthenticated = false;
        });

        this.client.on('authenticated', () => {
            console.log('Client authenticated');
            this.isAuthenticated = true;
            this.qrCode = null;
        });

        this.client.on('ready', async () => {
            console.log('Client is ready!');
            this.isReady = true;
            this.isAuthenticated = true;

            // Get session info
            const info = this.client.info;
            this.sessionInfo = {
                phoneNumber: info.wid.user,
                platform: info.platform,
                pushname: info.pushname
            };
            console.log('Session info:', this.sessionInfo);
        });

        this.client.on('disconnected', (reason) => {
            console.log('Client disconnected:', reason);
            this.isReady = false;
            this.isAuthenticated = false;
            this.qrCode = null;
            this.sessionInfo = null;
        });

        this.client.on('auth_failure', (msg) => {
            console.error('Authentication failure:', msg);
            this.isAuthenticated = false;
        });

        this.client.on('message', async (message) => {
            console.log(`[Event] Message received from ${message.from} (fromMe: ${message.fromMe})`);

            // Don't respond to own messages
            if (message.fromMe) return;

            // Extract sender and group information
            const contact = await message.getContact();
            const chat = await message.getChat();

            const senderName = contact.pushname || contact.name || message._data?.notifyName || message.from.split('@')[0];
            const isGroup = chat.isGroup;
            const groupName = isGroup ? chat.name : null;

            console.log(`Message from ${senderName} in ${isGroup ? 'group ' + groupName : 'private chat'}`);

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

                // Index the message in the database
                await dbService.saveMessage({
                    id: message.id.id,
                    timestamp: message.timestamp,
                    phone: message.from,
                    sender_name: senderName,
                    group_name: groupName,
                    body: message.body,
                    has_media: message.hasMedia,
                    media_description: mediaDescription,
                    is_group: isGroup
                });

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
        if (!this.isReady) {
            throw new Error('Client is not ready');
        }
        const chats = await this.client.getChats();
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

    async getChatHistory(chatIdOrNumber, limit = 50) {
        if (!this.isReady) {
            throw new Error('Client is not ready');
        }

        try {
            let chatId = chatIdOrNumber;
            // Only format if it doesn't look like a valid ID
            if (!chatId.includes('@')) {
                chatId = chatId.replace(/[^\d]/g, '') + '@c.us';
            }

            console.log(`Fetching chat history for: ${chatId} (limit: ${limit})`);

            const chat = await this.client.getChatById(chatId);
            if (!chat) {
                console.error(`Chat not found for ID: ${chatId}`);
                throw new Error(`Chat not found for ${chatId}`);
            }

            console.log(`Chat found. Fetching messages...`);
            const messages = await chat.fetchMessages({ limit: limit });
            console.log(`Fetched ${messages.length} messages for ${chatId}`);

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
            console.error('Error fetching chat history:', error);
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
