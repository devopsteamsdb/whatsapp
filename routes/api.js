const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');
const webhookService = require('../services/webhook');
const conversationMemory = require('../services/conversationMemory');
const fs = require('fs');
const path = require('path');
const ENV_FILE = path.join(__dirname, '..', '.env');

// Start session and initialize WhatsApp client
router.post('/session/start', (req, res) => {
    try {
        whatsappService.initialize();
        res.json({
            success: true,
            message: 'Session initialization started. Please scan QR code.'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get QR code
router.get('/session/qr', (req, res) => {
    const qrCode = whatsappService.getQRCode();

    if (qrCode) {
        res.json({
            success: true,
            qrCode: qrCode
        });
    } else {
        res.json({
            success: false,
            message: 'No QR code available. Session may be authenticated or not started.'
        });
    }
});

// Get session status
router.get('/session/status', (req, res) => {
    const status = whatsappService.getStatus();
    res.json({
        success: true,
        status: status
    });
});

// Get session info
router.get('/session/info', (req, res) => {
    const info = whatsappService.getSessionInfo();

    if (info) {
        res.json({
            success: true,
            info: info
        });
    } else {
        res.json({
            success: false,
            message: 'No session information available. Please authenticate first.'
        });
    }
});

// Logout and destroy session
router.post('/session/logout', async (req, res) => {
    try {
        await whatsappService.logout();
        res.json({
            success: true,
            message: 'Session logged out successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Send message
router.post('/messages/send', async (req, res) => {
    const { number, message } = req.body;

    if (!number || !message) {
        return res.status(400).json({
            success: false,
            error: 'Number and message are required'
        });
    }

    try {
        const result = await whatsappService.sendMessage(number, message);
        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Send media (image or video)
router.post('/messages/send-media', async (req, res) => {
    const { number, media, caption } = req.body;

    if (!number || !media) {
        return res.status(400).json({
            success: false,
            error: 'Number and media are required'
        });
    }

    // media should be: { mimetype: 'image/png' or 'video/mp4', data: 'base64string', filename: 'file.ext' }
    if (!media.mimetype || !media.data) {
        return res.status(400).json({
            success: false,
            error: 'Media must include mimetype and data (base64)'
        });
    }

    // Validate mimetype
    if (!media.mimetype.startsWith('image/') && !media.mimetype.startsWith('video/')) {
        return res.status(400).json({
            success: false,
            error: 'Only image and video mime types are supported'
        });
    }

    try {
        const result = await whatsappService.sendMedia(number, media, caption || '');
        res.json({
            success: true,
            result: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Bot configuration endpoints

// Get bot configuration
router.get('/bot/config', (req, res) => {
    const config = whatsappService.getBotConfig();
    res.json({
        success: true,
        config: config
    });
});

// Update bot configuration
router.post('/bot/config', (req, res) => {
    try {
        const { enabled, useAI, systemInstruction } = req.body;
        whatsappService.updateBotConfig({ enabled, useAI, systemInstruction });
        res.json({
            success: true,
            message: 'Bot configuration updated'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Add reply pattern
router.post('/bot/patterns', (req, res) => {
    try {
        const { trigger, response } = req.body;
        if (!trigger || !response) {
            return res.status(400).json({
                success: false,
                error: 'Trigger and response are required'
            });
        }
        whatsappService.addPattern(trigger, response);
        res.json({
            success: true,
            message: 'Pattern added successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Delete reply pattern
router.delete('/bot/patterns/:trigger', (req, res) => {
    try {
        const { trigger } = req.params;
        whatsappService.removePattern(trigger);
        res.json({
            success: true,
            message: 'Pattern removed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Webhook configuration
router.get('/webhook', (req, res) => {
    const config = webhookService.getConfig();
    res.json({
        success: true,
        config: config
    });
});

router.put('/webhook', (req, res) => {
    const { url, enabled } = req.body;

    // Validate that URL is provided if enabled is true
    if (enabled && !url) {
        return res.status(400).json({
            success: false,
            error: 'URL is required when enabling webhook'
        });
    }

    try {
        const config = webhookService.updateConfig({ url, enabled });
        res.json({
            success: true,
            config: config
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all chats
router.get('/chats', async (req, res) => {
    try {
        const chats = await whatsappService.getChats();
        res.json({
            success: true,
            count: chats.length,
            chats: chats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get message history for a specific phone number
router.get('/messages/:phone', async (req, res) => {
    const { phone } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;

    try {
        // Pass the phone/id directly to the service without stripping formatting
        // The service now handles ID validation
        const history = await whatsappService.getChatHistory(phone, limit);

        res.json({
            success: true,
            count: history.length,
            messages: history
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Settings API
router.get('/settings', (req, res) => {
    try {
        // Read directly from .env file to get persistent config
        let envContent = '';
        if (fs.existsSync(ENV_FILE)) {
            envContent = fs.readFileSync(ENV_FILE, 'utf8');
        }

        // Parse .env manualy or assume structure
        // Simple parsing for key=value
        const settings = {};
        envContent.split('\n').forEach(line => {
            const [key, ...parts] = line.split('=');
            if (key) {
                settings[key.trim()] = parts.join('=').trim();
            }
        });

        // Ensure we handle current process.env as fallback if not in file
        if (!settings.PORT) settings.PORT = process.env.PORT || 3001;
        if (!settings.SESSION_PATH) settings.SESSION_PATH = process.env.SESSION_PATH || './.wwebjs_auth';
        if (!settings.EXTERNAL_API_URL) settings.EXTERNAL_API_URL = process.env.EXTERNAL_API_URL || '';

        res.json({
            success: true,
            settings: {
                PORT: settings.PORT,
                SESSION_PATH: settings.SESSION_PATH,
                GEMINI_API_KEY: settings.GEMINI_API_KEY || '',
                EXTERNAL_API_URL: settings.EXTERNAL_API_URL
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    try {
        const status = whatsappService.getStatus();
        const response = {
            status: status.isReady && status.isAuthenticated,
            session: status.sessionInfo,
            whatsappState: status.isReady ? 'CONNECTED' : (status.isAuthenticated ? 'AUTHENTICATED' : 'DISCONNECTED'),
            timestamp: new Date().toISOString()
        };
        res.json(response);
    } catch (error) {
        res.status(500).json({
            status: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

router.post('/settings', (req, res) => {
    try {
        const { PORT, SESSION_PATH, GEMINI_API_KEY, EXTERNAL_API_URL } = req.body;

        let envContent = '';
        if (fs.existsSync(ENV_FILE)) {
            envContent = fs.readFileSync(ENV_FILE, 'utf8');
        }

        const newSettings = {
            PORT: PORT,
            SESSION_PATH: SESSION_PATH,
            GEMINI_API_KEY: GEMINI_API_KEY,
            EXTERNAL_API_URL: EXTERNAL_API_URL
        };

        // Update or append
        let lines = envContent.split('\n');
        Object.keys(newSettings).forEach(key => {
            if (newSettings[key] !== undefined) {
                const index = lines.findIndex(line => line.startsWith(`${key}=`));
                if (index !== -1) {
                    lines[index] = `${key}=${newSettings[key]}`;
                } else {
                    lines.push(`${key}=${newSettings[key]}`);
                }
            }
        });

        // Remove empty lines and joins
        const newEnvContent = lines.filter(line => line.trim() !== '').join('\n');
        fs.writeFileSync(ENV_FILE, newEnvContent);

        // Update runtime env for immediate effect where possible (PORT requires restart)
        if (EXTERNAL_API_URL !== undefined) process.env.EXTERNAL_API_URL = EXTERNAL_API_URL;

        res.json({
            success: true,
            message: 'Settings saved. Note: PORT and SESSION_PATH changes require a server restart.',
            settings: newSettings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
