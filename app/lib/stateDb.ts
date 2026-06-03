import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'dashboard_state.db');

let stateDb: Database.Database;

try {
    stateDb = new Database(dbPath);
    stateDb.pragma('journal_mode = WAL');
    
    // Initialize Tables
    stateDb.exec(`
        CREATE TABLE IF NOT EXISTS scb_manual_reviews (
            power_station TEXT,
            inversor INTEGER,
            scb INTEGER,
            card_id INTEGER,
            last_review_ts DATETIME,
            status TEXT,
            PRIMARY KEY(power_station, inversor, scb, card_id)
        );
    `);
} catch (error) {
    console.error("❌ Error conectando a la BD de estado (dashboard_state.db).");
    console.error(error);
    stateDb = new Database(':memory:');
}

export default stateDb;
