const db = require('better-sqlite3')('data/pv_14ps_live.db');

const UMBRAL_SEGUNDOS = 36000000;
const rawData = db.prepare(`SELECT * FROM lecturas_live ORDER BY length(power_station), power_station, inversor, scb`).all();

const now = new Date().getTime();
let globalSumAmps = 0;
let activeCount = 0;

const cells = rawData.map((row) => {
    const rowTime = new Date(row.ts).getTime();
    const diffSeconds = (now - rowTime) / 1000;
    const isZombie = diffSeconds > UMBRAL_SEGUNDOS;

    if (isZombie) {
        return { ...row, estado: "OFFLINE", i_total: 0, performance: 0 };
    }

    if (row.estado === "OK" && row.i_total > 0) {
        // Fix: Scale to Amps
        globalSumAmps += (row.i_total / 100);
        activeCount++;
    }
    return row;
});

const globalAvg = activeCount > 0 ? globalSumAmps / activeCount : 0;

const finalData = cells.map((cell) => {
    let performance = 0;
    const cellAmps = (cell.i_total ?? 0) / 100;

    if (cell.estado !== "OFFLINE" && globalAvg > 0) {
        performance = (cellAmps / globalAvg) * 100;
    }

    return {
        id: `${cell.power_station}-${cell.inversor}-${cell.scb}`,
        amps: cellAmps,
        perf: performance,
        avg: globalAvg
    };
});

console.log("Global Avg:", globalAvg);
console.log("Sample Cell:", finalData.find(c => c.amps > 0));
