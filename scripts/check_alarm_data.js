import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'pv_14ps_live.db');

function checkData() {
    const db = new Database(DB_PATH, { readonly: true });
    const row = db.prepare("SELECT COUNT(*) as count FROM alarm_state").get();
    console.log(`Rows in alarm_state: ${row.count}`);
    db.close();
}

checkData();
