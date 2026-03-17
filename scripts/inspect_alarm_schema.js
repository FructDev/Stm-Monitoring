import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'pv_14ps_live.db');

function inspectSchema() {
    const db = new Database(DB_PATH, { readonly: true });

    const tables = ['alarm_state', 'alarm_events'];

    for (const table of tables) {
        console.log(`\n--- Schema for ${table} ---`);
        const cols = db.pragma(`table_info(${table})`);
        cols.forEach(c => console.log(`${c.name} (${c.type})`));
    }

    db.close();
}

inspectSchema();
