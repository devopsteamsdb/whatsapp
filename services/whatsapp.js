const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const geminiService = require('./gemini');
const conversationMemory = require('./conversationMemory');

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
            if (!this.botConfig.enabled) return;

            // Don't respond to own messages or group messages (optional)
            if (message.fromMe) return;

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

                // Check for media (voice notes/audio)
                if (message.hasMedia) {
                    try {
                        const media = await message.downloadMedia();
                        // Check if it's audio/voice message
                        if (media && media.mimetype.startsWith('audio/')) {
                            mediaData = {
                                mimetype: media.mimetype,
                                data: media.data
                            };
                            console.log(`Received audio message. MimeType: ${media.mimetype}, Data Length: ${media.data.length}`);
                        } else {
                            console.log(`Received media but ignored (not audio/): ${media ? media.mimetype : 'null'}`);
                        }
                    } catch (mediaError) {
                        console.error('Error downloading media:', mediaError);
                    }
                }

                // Store the user's message in conversation memory (with a note for audio)
                const storedContent = mediaData ? '[Audio Message]' : message.body;
                conversationMemory.addMessage(message.from, 'user', storedContent);

                const response = await this.generateBotResponse(message.body, message.from, mediaData);
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

            const result = await this.client.sendMessage(formattedNumber, message);
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
                sendMediaAsDocument: mediaData.mimetype.startsWith('video/') // Send videos as documents to avoid "Evaluation failed"
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
