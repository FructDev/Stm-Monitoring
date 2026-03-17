const db = require('better-sqlite3')('data/pv_14ps_live.db');

const UMBRAL_SEGUNDOS = 36000000;
const rawData = db.prepare(`SELECT * FROM lecturas_live`).all();

const now = new Date().getTime();

let total_amps = 0;
let total_voltage_sum = 0;
let voltage_count = 0;

let total_scbs = 0;
let online_scbs = 0;
let offline_scbs = 0;
let alert_scbs = 0;
let total_dead_strings = 0;

const stringKeys = Array.from({ length: 18 }, (_, i) => `s${String(i + 1).padStart(2, "0")}`);

for (const row of rawData) {
    const rowDate = new Date(row.ts);
    const diffSeconds = (now - rowDate.getTime()) / 1000;
    const isZombie = diffSeconds > UMBRAL_SEGUNDOS;

    total_scbs++;

    if (isZombie || row.estado === "OFFLINE" || row.estado === "READ_FAIL" || row.estado === "FAIL") {
        offline_scbs++;
    } else {
        online_scbs++;
        const amps = (row.i_total || 0) / 100;
        total_amps += amps;

        if ((row.vdc || 0) > 0) {
            total_voltage_sum += row.vdc;
            voltage_count++;
        }

        if (row.estado !== "OK" && row.estado !== "BAJA_TENSION") {
            alert_scbs++;
        }

        if (amps > 2) {
            let deadInBox = 0;
            for (const key of stringKeys) {
                const val = (row[key] ?? 0) / 100;
                if (val >= 0 && val < 0.5) {
                    deadInBox++;
                }
            }
            total_dead_strings += deadInBox;
        }
    }
}

const avg_voltage = voltage_count > 0 ? total_voltage_sum / voltage_count : 0;

console.log({
    total_amps,
    avg_voltage,
    total_scbs,
    online_scbs,
    offline_scbs,
    alert_scbs,
    total_dead_strings
});
