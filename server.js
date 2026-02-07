console.log(`[Server] Current directory: ${process.cwd()}`);
console.log(`[Server] __dirname: ${__dirname}`);
const fs = require('fs');
const path = require('path');
const dotenvPath = path.join(process.cwd(), '.env');
if (fs.existsSync(dotenvPath)) {
    console.log(`[Server] Found .env file at: ${dotenvPath}`);
} else {
    console.warn(`[Server] .env file NOT FOUND at: ${dotenvPath}`);
}
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const reportsRoutes = require('./routes/reports');
const whatsappService = require('./services/whatsapp');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', apiRoutes);
app.use('/api/reports', reportsRoutes);

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`WhatsappAPI server running on http://localhost:${PORT}`);
    console.log('Ready to accept connections...');

    // Auto-initialize WhatsApp session on startup
    console.log('Auto-initializing WhatsApp session...');
    whatsappService.initialize();
});

// Graceful shutdown handling
const handleShutdown = async (signal) => {
    console.log(`\n[Server] ${signal} received. Starting graceful shutdown...`);

    try {
        // 1. Stop accepting new requests
        server.close();

        // 2. Logout/Destroy WhatsApp client
        if (whatsappService.client) {
            console.log('[Server] Closing WhatsApp client...');
            await whatsappService.logout();
        }

        // 3. Close database connection
        const dbService = require('./services/db');
        console.log('[Server] Closing database connection...');
        dbService.close();

        console.log('[Server] Shutdown complete. Goodbye!');
        process.exit(0);
    } catch (err) {
        console.error('[Server] Error during shutdown:', err);
        process.exit(1);
    }
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
