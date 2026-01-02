const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');

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

module.exports = router;
