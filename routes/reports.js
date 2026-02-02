const express = require('express');
const router = express.Router();
const dbService = require('../services/db');
const geminiService = require('../services/gemini');
const fs = require('fs');
const path = require('path');
const whatsappService = require('../services/whatsapp');

const ENV_FILE = path.join(__dirname, '..', '.env');

// Get daily report for a specific date
router.get('/daily', async (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    try {
        console.log(`Generating daily report for ${date}...`);

        let messages = [];
        let source = 'database';

        const isToday = date === new Date().toISOString().split('T')[0];

        if (isToday) {
            console.log(`[Reports] Generating REAL-TIME report for today (${date})...`);
            source = 'real-time';

            if (!whatsappService.isReady) {
                return res.status(503).json({
                    success: false,
                    error: 'WhatsApp client is not ready. Please wait for the "ready" state to generate real-time reports.'
                });
            }

            try {
                // Fetch today's messages directly from chats
                const startOfDay = new Date(date);
                startOfDay.setHours(0, 0, 0, 0);
                const startTs = Math.floor(startOfDay.getTime() / 1000);

                const chats = await whatsappService.client.getChats();
                const allMessages = [];

                for (const chat of chats) {
                    // Only check chats with recent activity
                    if (chat.timestamp < startTs) continue;

                    const msgs = await chat.fetchMessages({ limit: 50 });
                    for (const msg of msgs) {
                        if (msg.timestamp >= startTs) {
                            const contact = await msg.getContact();
                            allMessages.push({
                                id: msg.id.id,
                                timestamp: msg.timestamp,
                                sender_name: contact.pushname || contact.name || (msg.fromMe ? 'Me' : msg.from.split('@')[0]),
                                body: msg.body,
                                is_group: chat.isGroup,
                                group_name: chat.isGroup ? chat.name : null
                            });
                        }
                    }
                }
                messages = allMessages;
                console.log(`[Reports] Fetched ${messages.length} real-time messages for today.`);
            } catch (syncError) {
                console.error('[Reports] Real-time fetch failed, falling back to DB:', syncError);
                messages = await dbService.getMessagesForDay(date);
                source = 'database (fallback)';
            }
        } else {
            // Historical report from DB
            messages = await dbService.getMessagesForDay(date);
            if (messages.length === 0) {
                console.log(`[Reports] No messages found in DB for ${date}. Attempting sync...`);
                await whatsappService.syncMessagesForDay(date);
                messages = await dbService.getMessagesForDay(date);
            }
        }

        if (messages.length === 0) {
            return res.json({
                success: true,
                date: date,
                source: source,
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

        // 3. Send to Gemini for summary (if available)
        let summary = null;
        if (geminiService.isAvailable()) {
            summary = await geminiService.summarizeConversation(messages, customPrompt);
        }

        // 4. Fallback if Gemini is not available or failed
        if (!summary) {
            console.log('[Reports] Gemini summary unavailable or failed, generating basic summary...');
            // Basic fallback summary
            const senderCounts = {};
            messages.forEach(m => {
                const name = m.sender_name || 'Unknown';
                senderCounts[name] = (senderCounts[name] || 0) + 1;
            });

            const summaryLines = [
                '🤖 **AI Reporting (Gemini) is not active or encountered an error.**',
                '',
                '📊 **Basic Activity Summary:**',
                `- Total Messages: ${messages.length}`,
                '',
                '👥 **Top Contributors:**'
            ];

            Object.entries(senderCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .forEach(([name, count]) => {
                    summaryLines.push(`- ${name}: ${count} messages`);
                });

            summaryLines.push('', '💡 *Note: If you configured an API key, check the server logs for specific Gemini errors.*');
            summary = summaryLines.join('\n');
        }

        res.json({
            success: true,
            date: date,
            source: source,
            summary: summary,
            count: messages.length,
            messages: messages
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
