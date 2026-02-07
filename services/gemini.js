const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
    constructor() {
        this.updateConfig(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL);
    }

    updateConfig(apiKey, modelName) {
        this.apiKey = apiKey || this.apiKey;
        this.modelName = modelName || this.modelName || 'gemini-1.5-flash';

        if (this.apiKey) {
            const redacted = this.apiKey.substring(0, 8) + '...' + this.apiKey.substring(this.apiKey.length - 4);
            console.log(`[Gemini] Configuring with API Key: ${redacted}`);
            this.genAI = new GoogleGenerativeAI(this.apiKey);
            this.model = this.genAI.getGenerativeModel({ model: this.modelName });
            console.log(`[Gemini] AI service configured with model: ${this.modelName}`);
        } else {
            console.warn('[Gemini] CRITICAL: Gemini API key NOT FOUND in environment (process.env.GEMINI_API_KEY)');
            console.log('[Gemini] AI operations will be limited. Static responses only.');
            this.genAI = null;
            this.model = null;
        }
    }

    isAvailable() {
        return this.model !== null;
    }

    // Generate response with conversation history context and optional media
    async generateResponse(message, conversationHistory = '', systemInstruction = null, media = null) {
        if (!this.isAvailable()) {
            throw new Error('Gemini API is not configured. Please set GEMINI_API_KEY environment variable.');
        }

        try {
            // Build a context-aware prompt with conversation history
            let textPrompt = '';

            // System instruction for the bot
            const defaultSystemPrompt = `You are a helpful, friendly WhatsApp assistant. Keep your responses concise and conversational (1-3 sentences when possible). Be natural and engaging. If asked about previous messages, refer to the conversation history provided.`;

            const finalSystemPrompt = systemInstruction || defaultSystemPrompt;

            if (conversationHistory) {
                textPrompt = `${finalSystemPrompt}\n\n${conversationHistory}Current message from user: ${message || '[Audio Message]'}\n\nProvide a helpful and contextual response based on the conversation so far:`;
            } else {
                textPrompt = `${finalSystemPrompt}\n\nUser message: ${message || '[Audio Message]'}\n\nProvide a helpful and friendly response:`;
            }

            // Prepare content parts
            const parts = [{ text: textPrompt }];

            // Add media if present (for multimodal)
            if (media && media.mimetype && media.data) {
                console.log(`Received media. MimeType: ${media.mimetype}, Data Length: ${media.data.length}`);
                parts.push({
                    inlineData: {
                        mimeType: media.mimetype,
                        data: media.data
                    }
                });
                // Add instruction specific to media
                if (media.mimetype.startsWith('audio/')) {
                    parts.push({ text: "\n[System Note: The user has sent an audio message. First, TRANSCRIBE the audio exactly as heard in its original language. Then, RESPOND to that transcription. If the audio is unintelligible, say 'I could not understand the audio'.]" });
                } else {
                    parts.push({ text: "\n[System Note: The user has sent a visual message (image/video). Describe its content and respond accordingly.]" });
                }

                console.log('Sending media to Gemini. MimeType:', media.mimetype);
            }

            console.log('Gemini Prompt Parts:', JSON.stringify(parts, (key, value) => {
                if (key === 'data') return '[BASE64_DATA_TRUNCATED]';
                return value;
            }, 2));

            const result = await this.model.generateContent(parts);
            const response = await result.response;
            const text = response.text();

            return text;
        } catch (error) {
            console.error('Error generating Gemini response:', error);
            throw error;
        }
    }

    // Generate a description for media (image, video, audio)
    async describeMedia(media) {
        if (!this.isAvailable() || !media || !media.data) {
            return null;
        }

        try {
            const parts = [];

            if (media.mimetype.startsWith('image/')) {
                parts.push({ text: "Describe this image in detail. Focus on the main subjects, any text visible, and the overall context." });
            } else if (media.mimetype.startsWith('video/')) {
                parts.push({ text: "Describe this video content. What is happening? Mention key visual elements and any spoken words if possible." });
            } else if (media.mimetype.startsWith('audio/')) {
                parts.push({ text: "Transcribe and describe this audio message. What is being said? What is the tone?" });
            } else {
                parts.push({ text: "Describe this attachment." });
            }

            parts.push({
                inlineData: {
                    mimeType: media.mimetype,
                    data: media.data
                }
            });

            const result = await this.model.generateContent(parts);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Error describing media:', error);
            return "[Error describing media]";
        }
    }

    // Generate a conversation summary for long chats
    async summarizeConversation(messages, customPrompt = null) {
        if (!this.isAvailable()) {
            return null;
        }

        try {
            const conversationText = messages.map(m =>
                `${m.sender_name || (m.is_group ? 'Member' : 'User')}: ${m.body || (m.media_description ? '[Media: ' + m.media_description + ']' : '[Attachment]')}`
            ).join('\n');

            const defaultPrompt = `Summarize this conversation briefly, highlighting key topics and any important information the user shared:\n\n${conversationText}\n\nSummary:`;
            const prompt = customPrompt ? `${customPrompt}\n\nConversation:\n${conversationText}` : defaultPrompt;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error(`Error summarizing conversation with model ${this.modelName}:`, error);
            // Re-throw to allow route to handle/log specific API error
            throw error;
        }
    }

    async listAvailableModels() {
        if (!this.apiKey) return [];

        try {
            // Use fetch to call the REST API directly as the SDK might not expose this easily
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
            const data = await response.json();

            if (data.error) {
                console.error('Error listing models from API:', data.error);
                return [];
            }

            return (data.models || [])
                .filter(m => m.supportedGenerationMethods.includes('generateContent'))
                .map(m => ({
                    name: m.name.replace('models/', ''),
                    displayName: m.displayName,
                    description: m.description
                }));
        } catch (error) {
            console.error('Failed to list models:', error);
            return [];
        }
    }
}

// Singleton instance
const geminiService = new GeminiService();

module.exports = geminiService;
