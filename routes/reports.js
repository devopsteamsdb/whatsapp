const express = require('express');
const router = express.Router();
const dbService = require('../services/db');
const geminiService = require('../services/gemini');
const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');

// Get daily report for a specific date
router.get('/daily', async (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    try {
        console.log(`Generating daily report for ${date}...`);

        // 1. Fetch messages for the day
        const messages = await dbService.getMessagesForDay(date);

        if (messages.length === 0) {
            return res.json({
                success: true,
                date: date,
                summary: 'No messages found for this day.',
                count: 0
            });
        }

        // 2. Get custom prompt from .env
        let customPrompt = process.env.DAILY_REPORT_PROMPT;
        if (!customPrompt && fs.existsSync(ENV_FILE)) {
            const envContent = fs.readFileSync(ENV_FILE, 'utf8');
            const match = envContent.match(/DAILY_REPORT_PROMPT=(.*)/);
            if (match) customPrompt = match[1].trim();
        }

        // 3. Send to Gemini for summary
        if (!geminiService.isAvailable()) {
            return res.status(500).json({
                success: false,
                error: 'Gemini AI is not configured.'
            });
        }

        const summary = await geminiService.summarizeConversation(messages, customPrompt);

        res.json({
            success: true,
            date: date,
            summary: summary,
            count: messages.length,
            messages: messages // Optional: include messages for inspection
        });
    } catch (error) {
        console.error('Error generating daily report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
