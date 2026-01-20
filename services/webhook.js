const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'webhook-config.json');

class WebhookService {
    constructor() {
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const data = fs.readFileSync(CONFIG_FILE, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading webhook config:', error);
        }

        return {
            enabled: false,
            url: ''
        };
    }

    saveConfig() {
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
            console.log('Webhook config saved');
        } catch (error) {
            console.error('Error saving webhook config:', error);
        }
    }

    getConfig() {
        return this.config;
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.saveConfig();
        return this.config;
    }

    async sendWebhook(data) {
        if (!this.config.enabled || !this.config.url) {
            return;
        }

        try {
            console.log(`Sending webhook to ${this.config.url}...`);
            const response = await fetch(this.config.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                console.error(`Webhook failed with status: ${response.status}`);
            } else {
                console.log('Webhook sent successfully');
            }
        } catch (error) {
            console.error('Error sending webhook:', error);
        }
    }
}

const webhookService = new WebhookService();
module.exports = webhookService;
