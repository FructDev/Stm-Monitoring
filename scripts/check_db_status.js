import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'pv_14ps_live.db');

function checkDb() {
    console.log(`Checking database at: ${DB_PATH}`);
    let db;
    try {
        db = new Database(DB_PATH, { fileMustExist: true });
    } catch (err) {
        console.error("Database not found.", err);
        return;
    }

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log("Tables found:", tables.map(t => t.name));
    db.close();
}

checkDb();
