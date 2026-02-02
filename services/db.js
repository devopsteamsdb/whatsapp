const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'whatsapp.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

class DatabaseService {
    constructor() {
        console.log(`[DB] Attempting to open database at: ${DB_PATH}`);
        this.db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('[DB] CRITICAL: Error opening database:', err);
            } else {
                console.log('[DB] Connected to SQLite database successfully');
                this.initSchema();
            }
        });
    }

    initSchema() {
        console.log('[DB] Initializing database schema...');
        const schema = `
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                timestamp INTEGER,
                phone TEXT,
                sender_name TEXT,
                group_name TEXT,
                body TEXT,
                has_media BOOLEAN,
                media_description TEXT,
                is_group BOOLEAN
            );
        `;

        this.db.run(schema, (err) => {
            if (err) {
                console.error('[DB] Error initializing schema:', err);
            } else {
                console.log('[DB] Database schema initialized successfully');
            }
        });
    }

    async saveMessage(msg) {
        console.log(`[DB] Saving message: ${msg.id} from ${msg.phone}`);
        return new Promise((resolve, reject) => {
            const query = `
                INSERT OR REPLACE INTO messages 
                (id, timestamp, phone, sender_name, group_name, body, has_media, media_description, is_group) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const params = [
                msg.id,
                msg.timestamp,
                msg.phone,
                msg.sender_name,
                msg.group_name || null,
                msg.body,
                msg.has_media ? 1 : 0,
                msg.media_description || null,
                msg.is_group ? 1 : 0
            ];

            this.db.run(query, params, function (err) {
                if (err) {
                    console.error('[DB] Error saving message:', err);
                    reject(err);
                } else {
                    console.log(`[DB] Message ${msg.id} saved successfully`);
                    resolve(this.lastID);
                }
            });
        });
    }

    async getMessagesForDay(date) {
        // date is YYYY-MM-DD
        console.log(`[DB] Fetching messages for day: ${date}`);
        const start = Math.floor(new Date(date + 'T00:00:00').getTime() / 1000);
        const end = Math.floor(new Date(date + 'T23:59:59').getTime() / 1000);

        return new Promise((resolve, reject) => {
            const query = `SELECT * FROM messages WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC`;
            this.db.all(query, [start, end], (err, rows) => {
                if (err) {
                    console.error('[DB] Error fetching messages:', err);
                    reject(err);
                } else {
                    console.log(`[DB] Fetched ${rows.length} messages for ${date}`);
                    resolve(rows);
                }
            });
        });
    }

    async query(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('[DB] Custom query error:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    close() {
        this.db.close();
    }
}

const dbService = new DatabaseService();
module.exports = dbService;
