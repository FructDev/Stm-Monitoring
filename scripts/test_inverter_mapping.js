const db = require('better-sqlite3')('data/pv_14ps_live.db');

const rawData = db.prepare(`SELECT * FROM lecturas_live WHERE scb > 18 LIMIT 5`).all();

const finalData = rawData.map((cell) => {
    let finalInversor = cell.inversor;
    let finalScb = cell.scb;

    if (cell.scb > 18) {
        finalInversor = 2;
        finalScb = cell.scb - 18;
    }

    return {
        original_scb: cell.scb,
        final_inversor: finalInversor,
        final_scb: finalScb
    };
});

console.log(finalData);
