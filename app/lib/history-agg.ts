// app/lib/history-agg.ts
// Agregación de datos históricos por nivel jerárquico (PS / Inversor / SCB / String).
// Pura y testeable: recibe las filas crudas del /history del driver y devuelve una serie temporal.

import { getLogicalScb } from './scb-config';

export type HistLevel = 'PS' | 'INV' | 'SCB' | 'STRING';
export type HistVariable = 'corriente' | 'voltaje' | 'potencia' | 'temperatura' | 'irradiancia';

export interface SeriesSpec {
    id: string;
    level: HistLevel;
    ps: string;            // "PS3"
    inversor?: number;     // 1 | 2
    scb?: number;          // 1..18
    stringId?: number;     // 1..18
    color?: string;
    label?: string;
}

// Fila cruda que entrega el endpoint /history del driver Rust.
export interface RawHistRow {
    ts: string;
    gateway: string;
    mid: number;
    inversor: number;
    scb: number;
    v_avg: number;
    i_total_avg: number;
    power_kw_avg: number;
    temp_avg: number;
    currents?: number[];
    irradiance_avg?: number | null;
}

export interface SeriesPoint { ts: string; value: number }

// Etiqueta legible por defecto para una serie.
export function defaultLabel(spec: SeriesSpec): string {
    switch (spec.level) {
        case 'PS': return spec.ps;
        case 'INV': return `${spec.ps} · Inv ${spec.inversor}`;
        case 'SCB': return `${spec.ps} · Inv ${spec.inversor} · SCB ${spec.scb}`;
        case 'STRING': return `${spec.ps} · Inv ${spec.inversor} · SCB ${spec.scb} · String ${spec.stringId}`;
    }
}

// ¿La caja (inv, scb) pertenece a la entidad descrita por el spec?
function rowMatches(spec: SeriesSpec, inv: number, scb: number): boolean {
    switch (spec.level) {
        case 'PS': return true;
        case 'INV': return inv === spec.inversor;
        case 'SCB':
        case 'STRING': return inv === spec.inversor && scb === spec.scb;
    }
}

interface Acc {
    sumI: number;   // corriente sumada (A reales)
    sumP: number;   // potencia sumada (kW reales)
    sumV: number;   // voltaje (para promedio)
    sumT: number;   // temperatura (para promedio)
    count: number;  // nº de cajas en este ts
    sumIrr: number; // irradiancia (para promedio)
    countIrr: number; // nº de filas con irradiancia válida
    stringAmp: number | null; // corriente del string seleccionado (A reales)
    vRef: number;   // voltaje de la caja (para potencia de string)
}

/**
 * Agrega las filas crudas de una PS en una serie temporal según el nivel y la variable.
 * - corriente / potencia => SUMA de las cajas del nivel (total real).
 * - voltaje / temperatura => PROMEDIO.
 * - STRING => corriente del string; potencia = A * V / 1000.
 * Escala: corriente y potencia vienen en centésimas (se dividen /100); voltaje y temperatura no.
 */
export function aggregateSeries(spec: SeriesSpec, variable: HistVariable, rows: RawHistRow[]): SeriesPoint[] {
    const byTs = new Map<string, Acc>();

    for (const row of rows) {
        // Recalculamos el mapeo lógico desde el MID físico (robusto, incluye el caso especial de PS1).
        const { inversor: inv, scb } = getLogicalScb(spec.ps, row.mid);
        if (!rowMatches(spec, inv, scb)) continue;

        let acc = byTs.get(row.ts);
        if (!acc) {
            acc = { sumI: 0, sumP: 0, sumV: 0, sumT: 0, count: 0, sumIrr: 0, countIrr: 0, stringAmp: null, vRef: row.v_avg || 0 };
            byTs.set(row.ts, acc);
        }

        // Irradiancia: viene por fila (es de la PS, igual en todas sus cajas). Promediamos las válidas.
        if (typeof row.irradiance_avg === 'number') {
            acc.sumIrr += row.irradiance_avg;
            acc.countIrr += 1;
        }

        if (spec.level === 'STRING') {
            const idx = (spec.stringId ?? 1) - 1;
            const raw = Array.isArray(row.currents) ? row.currents[idx] : undefined;
            if (typeof raw === 'number') acc.stringAmp = raw / 100;
            acc.vRef = row.v_avg || 0;
            acc.sumT += row.temp_avg || 0; // temperatura de la caja que contiene el string
            acc.count += 1;
        } else {
            acc.sumI += (row.i_total_avg || 0) / 100;
            acc.sumP += (row.power_kw_avg || 0) / 100;
            acc.sumV += row.v_avg || 0;
            acc.sumT += row.temp_avg || 0;
            acc.count += 1;
        }
    }

    const points: SeriesPoint[] = [];
    for (const [ts, a] of byTs) {
        let value = 0;
        if (variable === 'irradiancia') {
            value = a.countIrr ? a.sumIrr / a.countIrr : 0;
        } else if (spec.level === 'STRING') {
            const amp = a.stringAmp ?? 0;
            if (variable === 'corriente') value = amp;
            else if (variable === 'potencia') value = (amp * a.vRef) / 1000;
            else if (variable === 'voltaje') value = a.vRef;
            else if (variable === 'temperatura') value = a.count ? a.sumT / a.count : 0;
        } else {
            if (variable === 'corriente') value = a.sumI;
            else if (variable === 'potencia') value = a.sumP;
            else if (variable === 'voltaje') value = a.count ? a.sumV / a.count : 0;
            else if (variable === 'temperatura') value = a.count ? a.sumT / a.count : 0;
        }
        points.push({ ts, value });
    }
    points.sort((p, q) => new Date(p.ts).getTime() - new Date(q.ts).getTime());
    return points;
}
