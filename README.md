# WhatsappAPI

A modern WhatsApp HTTP API web application built with Node.js and whatsapp-web.js. Send WhatsApp messages programmatically through a beautiful web interface and RESTful API.

![WhatsApp API](https://img.shields.io/badge/WhatsApp-API-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)

## Features

✨ **Modern Web Interface** - Beautiful dark mode UI with glassmorphism effects  
🔐 **QR Code Authentication** - Easy WhatsApp Web login via QR code scanning  
📨 **Send Messages** - Send WhatsApp messages through web UI or API  
🔄 **Session Management** - Persistent sessions with automatic reconnection  
🚀 **RESTful API** - Complete HTTP API for integration  
📱 **Responsive Design** - Works perfectly on desktop and mobile  

## Quick Start

### Prerequisites

- Node.js v18 or higher
- npm or yarn
- A WhatsApp account

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd molten-interstellar
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
npm start
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## Usage

### Web Interface

1. **Start Session**: Click "Start Session" button to initialize WhatsApp connection
2. **Scan QR Code**: Use your WhatsApp mobile app to scan the displayed QR code
3. **Send Messages**: Once connected, use the message form to send WhatsApp messages

### API Endpoints

#### Start Session
```bash
POST /api/session/start
```
Initialize a new WhatsApp session.

#### Get QR Code
```bash
GET /api/session/qr
```
Retrieve the current QR code for scanning.

**Response:**
```json
{
  "success": true,
  "qrCode": "data:image/png;base64,..."
}
```

#### Check Session Status
```bash
GET /api/session/status
```
Get the current session status.

**Response:**
```json
{
  "success": true,
  "status": {
    "isReady": true,
    "isAuthenticated": true,
    "hasQRCode": false
  }
}
```

#### Get Session Info
```bash
GET /api/session/info
```
Get information about the authenticated session.

**Response:**
```json
{
  "success": true,
  "info": {
    "phoneNumber": "972501234567",
    "pushname": "John Doe",
    "platform": "android"
  }
}
```

#### Send Message
```bash
POST /api/messages/send
Content-Type: application/json

{
  "number": "972501234567",
  "message": "Hello from WhatsappAPI!"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "messageId": "...",
    "timestamp": 1234567890
  }
}
```

#### Logout
```bash
POST /api/session/logout
```
Logout and destroy the current session.

## Configuration

Create a `.env` file in the root directory:

```env
PORT=3000
SESSION_PATH=./.wwebjs_auth
```

## Technology Stack

- **Backend**: Node.js, Express
- **WhatsApp Integration**: whatsapp-web.js
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **QR Code**: qrcode library
- **Authentication**: LocalAuth strategy with persistent sessions

## Project Structure

```
molten-interstellar/
├── public/
│   ├── css/
│   │   └── style.css          # Premium dark mode styles
│   ├── js/
│   │   └── app.js             # Frontend application logic
│   └── index.html             # Main web interface
├── routes/
│   └── api.js                 # API route handlers
├── services/
│   └── whatsapp.js            # WhatsApp service layer
├── .env                       # Environment configuration
├── .gitignore                 # Git ignore rules
├── package.json               # Project dependencies
├── server.js                  # Express server setup
└── README.md                  # This file
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
