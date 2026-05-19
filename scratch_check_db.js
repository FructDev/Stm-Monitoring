const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'pv_14ps_live.db');
const db = new Database(dbPath, { readonly: true });

const inv2 = db.prepare(`SELECT power_station, inversor, scb FROM lecturas_live WHERE inversor = 2`).all();
console.log("Inversor 2 boxes:", inv2.length);
console.log(inv2);
