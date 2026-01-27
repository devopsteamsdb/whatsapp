# WhatsappAPI

A modern WhatsApp HTTP API web application built with Node.js and whatsapp-web.js. Send WhatsApp messages programmatically through a beautiful web interface and RESTful API.

![WhatsApp API](https://img.shields.io/badge/WhatsApp-API-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)

## Features

✨ **Daily Status Reports** - AI-generated summaries of your chat history using Google Gemini
✨ **AI Media Description** - Automatically describe images, videos, and audio attachments using AI
✨ **Message Indexing** - All messages are stored in a local SQLite database for analytics and reporting
✨ **Modern Web Interface** - Beautiful dark mode UI with glassmorphism effects
✨ **WhatsApp Web Replica** - Full-featured web interface to view chats and messages
✨ **Settings Dashboard** - Configure server port, session path, and AI integrations

## Daily Status Reports

The application now supports **Daily Status Reports**. Every message sent or received is indexed in a local SQLite database. Using Google Gemini AI, the system can:
- **Index Messages**: Store sender, group name, timestamp, and body.
- **AI Media Processing**: Generate text descriptions for images, videos, and audio.
- **Daily Summaries**: Generate a comprehensive report for any specific day using a customizable AI prompt.

### Database Strategy

We use **SQLite3** for lightweight, persistent storage without requiring a separate database server.
- **Persistence**: Messages are saved in `data/whatsapp.db`. For **Docker** users, map this directory to a persistent volume.
- **Indexing**: Incoming messages are indexed in real-time.
- **Customization**: The "Daily Report Prompt" can be edited in the Settings page to tailor the AI summary.

---

## Quick Start

### Prerequisites

- Node.js v18 or higher
- npm or yarn
- A WhatsApp account
- **Optional**: [Google Gemini API Key](https://aistudio.google.com/) for AI features

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd whatsapp
```

2. Install dependencies:
```bash
npm install
```

3. Configure your environment (see [Configuration](#configuration))

4. Start the server:
```bash
npm start
```

---

## Usage

### Web Interface

1. **Daily Reports**:
   - Click the **Document** icon in the left navigation bar.
   - Select a date and click "Generate" to receive an AI summary of that day's activity.

2. **Settings**:
   - **Daily Report Prompt**: Define how Gemini should summarize your day. Supports Hebrew and English.

### API Endpoints

#### Daily Report
```bash
GET /api/reports/daily?date=YYYY-MM-DD
```
Generate an AI summary for the specified date.

**Response:**
```json
{
  "success": true,
  "date": "2024-01-27",
  "summary": "Today's conversations mainly focused on...",
  "count": 42
}
```

---

## Configuration

Create a `.env` file in the root directory:

```env
PORT=3000
SESSION_PATH=./.wwebjs_auth
GEMINI_API_KEY=your_gemini_api_key_here
DAILY_REPORT_PROMPT=Summarize the day's conversations, highlighting important tasks.
```

## Technology Stack

- **Backend**: Node.js, Express
- **Database**: SQLite3
- **AI Integration**: Google Gemini AI (Multimodal)
- **WhatsApp Integration**: whatsapp-web.js
- **Frontend**: Vanilla JavaScript, HTML5, CSS3

## Project Structure

```
whatsapp/
├── public/
│   ├── js/
│   │   ├── app.js             # Main app logic
│   │   ├── chats.js           # WhatsApp Web Replica logic
│   │   ├── reports.js         # Daily Reports logic
│   │   └── settings.js        # Settings logic
│   ├── index.html             # Status/QR page
│   ├── reports.html           # Daily Reports UI
│   └── ...
├── routes/
│   ├── api.js                 # General API routes
│   └── reports.js             # Reports specific routes
├── services/
│   ├── db.js                  # SQLite database service
│   ├── gemini.js              # Gemini AI service
│   └── whatsapp.js            # WhatsApp core service
├── data/
│   └── whatsapp.db            # SQLite database (auto-generated)
├── .env                       # Environment configuration
├── server.js                  # Express server entry point
└── README.md                  # Documentation
```


## Screenshots

### Main Interface
The application features a modern dark mode interface with:
- Real-time session status indicator
- QR code display for authentication
- Message sending form
- API documentation

### Session Management
- Easy session initialization
- Automatic QR code refresh
- Session persistence across restarts
- One-click logout

## Troubleshooting

### QR Code Not Displaying
- Make sure the server is running
- Click "Start Session" to initialize the connection
- Wait a few seconds for the QR code to generate

### Message Not Sending
- Ensure you're authenticated (session status shows "Connected")
- Include country code in phone number (e.g., 972501234567)
- Check that the number is registered on WhatsApp

### Session Not Persisting
- Check that `.wwebjs_auth` directory has write permissions
- Ensure the session wasn't manually deleted

## Security Notes

⚠️ **Important**: This application is for educational and personal use only.

- WhatsApp does not officially support third-party clients
- Use at your own risk - your account may be banned
- Do not use for spam or unsolicited messages
- Keep your session data secure

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Disclaimer

This project is not affiliated with, associated with, authorized by, endorsed by, or in any way officially connected with WhatsApp or Meta Platforms, Inc.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and questions, please open an issue on GitHub.

---

**Built with ❤️ using whatsapp-web.js**
