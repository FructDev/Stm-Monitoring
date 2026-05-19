const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'pv_14ps_live.db');
const db = new Database(dbPath, { readonly: true });

function is15StringScb(ps, inversor, scb) {
    const FIFTEEN_STRING_SCBS = new Set([
        'PS1-2-8', 'PS1-2-9',
        'PS2-2-1', 'PS2-2-4',
        'PS3-2-15', 'PS3-2-18',
        'PS4-2-17', 'PS4-2-18',
        'PS5-1-14', 'PS5-2-1',
        'PS6-1-9', 'PS6-2-1',
        'PS7-1-9', 'PS7-2-1',
        'PS8-1-12', 'PS8-2-1', 'PS8-2-2', 'PS8-2-12',
        'PS9-1-6', 'PS9-2-1', 'PS9-2-17', 'PS9-2-18',
        'PS10-1-1', 'PS10-1-2', 'PS10-1-3', 'PS10-2-9',
        'PS11-1-1', 'PS11-2-1', 'PS11-2-11', 'PS11-2-12',
        'PS12-1-11', 'PS12-2-1', 'PS12-2-4', 'PS12-2-5',
        'PS13-1-13', 'PS13-2-1', 'PS13-2-13', 'PS13-2-14',
        'PS14-1-13', 'PS14-1-14', 'PS14-1-15', 'PS14-1-18', 'PS14-2-12', 'PS14-2-18'
    ]);
    const normPs = ps.replace(/\s+/g, '').toUpperCase();
    let detectInv = Number(inversor);
    let detectScb = Number(scb);
    const key = `${normPs}-${detectInv}-${detectScb}`;
    return FIFTEEN_STRING_SCBS.has(key);
}

function getScbCapacity(ps, inversor, scb) {
    return is15StringScb(ps, inversor, scb) ? 15 : 18;
}

const rawData = db.prepare(`SELECT * FROM lecturas_live WHERE power_station = 'PS2' AND inversor = 1`).all();
let totalDead = 0;

console.log("Analyzing PS2...");
for (const row of rawData) {
    const amps = (row.i_total || 0) / 100;
    if (amps <= 5) continue;

    const capacity = getScbCapacity(row.power_station, row.inversor, row.scb);
    let validStringsCount = 0;
    let sumValidAmps = 0;
    const stringValues = [];

    for (let i = 0; i < capacity; i++) {
        const key = `s${String(i + 1).padStart(2, "0")}`;
        const rawVal = row[key];
        if (rawVal === null || rawVal === undefined) continue;
        const val = rawVal / 100;
        stringValues.push(val);
        if (val >= 0.5) {
            sumValidAmps += val;
            validStringsCount++;
        }
    }

    if (validStringsCount > 0) {
        const avgHealthyCurrent = sumValidAmps / validStringsCount;
        const failureThreshold = avgHealthyCurrent * 0.20;

        let deadInBox = 0;
        let deadIndices = [];
        for (let i = 0; i < stringValues.length; i++) {
            if (stringValues[i] < failureThreshold) {
                deadInBox++;
                deadIndices.push(i + 1);
            }
        }
        
        if (deadInBox > 0) {
            console.log(`SCB ${row.scb} has ${deadInBox} dead strings. Capacity: ${capacity}. Indices: ${deadIndices.join(', ')}`);
            console.log(`Raw values: ${stringValues.join(', ')}`);
            console.log(`Threshold: ${failureThreshold.toFixed(2)}A, Avg Healthy: ${avgHealthyCurrent.toFixed(2)}A`);
        }
        totalDead += deadInBox;
    }
}

console.log("Total Dead in DB for PS2:", totalDead);
