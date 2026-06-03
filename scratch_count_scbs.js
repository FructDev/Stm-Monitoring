const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.cwd(), 'data', 'pv_14ps_live.db');
const db = new Database(dbPath, { readonly: true });

const rows = db.prepare("SELECT power_station, inversor, COUNT(*) as count FROM lecturas_live GROUP BY power_station, inversor ORDER BY power_station, inversor").all();
console.table(rows);
