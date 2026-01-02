const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.genAI = null;
        this.model = null;

        if (this.apiKey) {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
            console.log('Gemini AI service initialized');
        } else {
            console.log('Gemini API key not found. AI responses will be disabled.');
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
                // Add instruction specific to audio
                parts.push({ text: "\n[System Note: The user has sent an audio message. First, TRANSCRIBE the audio exactly as heard in its original language. Then, RESPOND to that transcription. If the audio is unintelligible, say 'I could not understand the audio'.]" });

                console.log('Sending audio to Gemini. MimeType:', media.mimetype);
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

    // Generate a conversation summary for long chats
    async summarizeConversation(messages) {
        if (!this.isAvailable()) {
            return null;
        }

        try {
            const conversationText = messages.map(m =>
                `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
            ).join('\n');

            const prompt = `Summarize this conversation briefly, highlighting key topics and any important information the user shared:\n\n${conversationText}\n\nSummary:`;

            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Error summarizing conversation:', error);
            return null;
        }
    }
}

// Singleton instance
const geminiService = new GeminiService();

module.exports = geminiService;
