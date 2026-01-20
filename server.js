require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./routes/api');
const whatsappService = require('./services/whatsapp');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check Endpoint (Monitoring)
app.get('/health-api.html', (req, res) => {
    const status = whatsappService.getStatus();
    res.json({
        status: status.isReady && status.isAuthenticated,
        session: status.sessionInfo,
        whatsappState: status.isReady ? 'CONNECTED' : (status.isAuthenticated ? 'AUTHENTICATED' : 'DISCONNECTED'),
        timestamp: new Date().toISOString()
    });
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', apiRoutes);

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`WhatsappAPI server running on http://localhost:${PORT}`);
    console.log('Ready to accept connections...');

    // Auto-initialize WhatsApp session on startup
    console.log('Auto-initializing WhatsApp session...');
    whatsappService.initialize();
});
