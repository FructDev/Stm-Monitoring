// app/lib/pr-engine.ts
//
// Motor de cálculo de Producción / Performance Ratio (PR).
// Replica el modelo del libro Excel de gerencia ("Calculo PR Corregido.xlsm") pero
// tomando TODO automáticamente del histórico del driver (rollups de 5 min), salvo la
// energía AC medida, que es el único dato manual (no tenemos el medidor fiscal por Modbus).
//
// Convenciones de unidades:
//   - power_kw_avg  : kW por caja (SCB)   -> energía en kWh = kW * h
//   - irradiance_avg: W/m²                -> insolación en kWh/m² = W/m² * h / 1000
//   - Potencias pico y energías del modelo se manejan en MW / MWh (como el Excel).

import histDb from './histDb';
import stateDb from './stateDb';
import { FIFTEEN_STRING_SCB_KEYS, getScbCapacity } from './scb-config';

export interface PrConfig {
    ppicoPlantMW: number;           // Potencia pico DC de la planta (paneles). Excel: B2 = 120
    invertersCount: number;         // 28 (14 PS x 2)
    ppicoInverterMW: number;        // Pico DC por inversor = 120/28 = 4.2857
    inverterNominalAcMW: number;    // Nominal AC del inversor = 3.8 (techo de clipping)
    tempCoefPerC: number;           // Coef. de temperatura. Excel: B6 = -0.0035 (-0.35%/°C)
    tempStcC: number;               // Temperatura STC. Excel: B8 = 25
    degradationRatePerYear: number; // Excel: K3 = 0.005 (0.5%/año)
    yearsInOperation: number;       // Excel: K4 = 5
    plantFactorK: number;           // Factor de planta para la "Energía Estimada" (derate global)
    tzOffsetHours: number;          // Huso local para cortar los días (RD = -4)
}

// Valores por defecto = los que usa el Excel de gerencia.
export const DEFAULT_PR_CONFIG: PrConfig = {
    ppicoPlantMW: 120,
    invertersCount: 28,
    ppicoInverterMW: 120 / 28,
    inverterNominalAcMW: 3.8,
    tempCoefPerC: -0.0035,
    tempStcC: 25,
    degradationRatePerYear: 0.005,
    yearsInOperation: 5,
    plantFactorK: 0.84,
    tzOffsetHours: -4,
};

export interface PrDailyRow {
    fecha: string;                  // YYYY-MM-DD (día local)
    ticks: number;                  // muestras de 5 min presentes (288 = día completo)
    completeness: number;           // 0..1 -> para marcar días con el driver caído
    dtHours: number;                // paso real entre muestras
    spanHours: number;              // cuántas horas del día quedaron efectivamente capturadas
    // true = el driver NO cubrió el día completo. La energía AC medida es de TODO el día, así que
    // compararla contra una insolación parcial dispara el PR (ej. 1485%). En esos días el PR AC
    // y la pérdida NO son válidos; el PR DC sí (energía e insolación salen de la misma ventana).
    partialDay: boolean;

    insolationKwhM2: number;        // H (= horas sol pico). Excel: B3, hoy manual
    tempPanelC: number | null;      // Pt100, promedio PONDERADO POR IRRADIANCIA
    cTemp: number;                  // 1 + (Tpanel - 25) * coefTemp. Excel: H4

    energyDcMwh: number;            // reconstruida de los combiners
    energyAcMwh: number | null;     // manual (medidor fiscal). Excel: B1

    ppicoRawMW: number;             // 120
    ppicoDegMW: number;             // 120 * (1-tasa)^años. Excel: K5
    eTeoRawMwh: number;             // Ppico * H
    eTeoDegMwh: number;             // Ppico_deg * H

    // Las 4 variantes de PR sobre la energía AC medida (null si aún no se cargó)
    prRaw: number | null;           // sin degradación, sin corrección temp
    prRawTemp: number | null;       // sin degradación, CON corrección temp
    prDeg: number | null;           // con degradación, sin corrección temp
    prDegTemp: number | null;       // con degradación, CON corrección temp

    // Las mismas 4 pero sobre la energía DC reconstruida (siempre disponibles)
    prDcRaw: number;
    prDcRawTemp: number;
    prDcDeg: number;
    prDcDegTemp: number;

    // Formato de la tabla del Excel
    energyEstimatedMwh: number;     // Ppico_deg * H * cTemp * k  ("Carga Estimada")
    energyRealMwh: number | null;   // AC medida si existe, si no DC ("Carga Real")
    realIsDcProxy: boolean;         // true = se usó DC porque falta la AC
    lossPct: number | null;         // 1 - Real/Estimada
}

const NOMINAL_DT_HOURS = 300 / 3600; // el historiador vuelca cada 300 s

// ⚠️ CORRECCIÓN DE ESCALA DE POTENCIA (bug del historiador Rust).
// El historiador calcula power_kw = (voltaje_V * i_total) / 1000, pero `i_total` viene en
// CENTI-AMPERIOS (ej. 10984 = 109.84 A), no en amperios. Resultado: `power_kw_avg` queda
// inflado exactamente x100 en TODA la base histórica.
// Verificado con datos reales: v=1207 V, i=10984 (=109.84 A) -> guardado 13257.7,
// real 1207 * 109.84 / 1000 = 132.6 kW por caja (x504 cajas = 66.8 MW, coherente con 120 MWp).
// Compensamos acá para poder usar los meses de historial YA existentes sin migrar la base.
// Si algún día se corrige el historiador, hay que migrar los datos viejos y poner esto en 1.
const POWER_SCALE_FIX = 100;

// Horas mínimas de captura para considerar que el día cubre la franja productiva completa.
// Por debajo de esto, la insolación acumulada es solo un pedazo del día y NO se puede comparar
// contra una energía AC medida de 24 h (el PR se dispararía). Ajustable en calibración.
const MIN_FULL_DAY_SPAN_H = 8;

/** Modificador de SQLite para pasar el ts UTC al día local (ej. '-4 hours'). */
function tzModifier(cfg: PrConfig): string {
    const h = cfg.tzOffsetHours;
    return `${h >= 0 ? '+' : '-'}${Math.abs(h)} hours`;
}

/** Corre una fecha 'YYYY-MM-DD' n días. Se usa para ampliar la ventana UTC de las consultas. */
function shiftDay(iso: string, n: number): string {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/** Paso real entre muestras de un día; cae al nominal si no se puede derivar. */
function deriveDtHours(tsMin: string, tsMax: string, ticks: number): number {
    if (ticks < 2) return NOMINAL_DT_HOURS;
    const span = (new Date(tsMax).getTime() - new Date(tsMin).getTime()) / 3_600_000;
    const dt = span / (ticks - 1);
    // Si el resultado es absurdo (huecos grandes por driver caído), usamos el nominal.
    if (!isFinite(dt) || dt <= 0 || dt > 0.5) return NOMINAL_DT_HOURS;
    return dt;
}

interface ProdRow { dia: string; ticks: number; ts_min: string; ts_max: string; sum_kw: number; sum_card_kw: number }
interface MeteoRow { dia: string; sum_irr: number; wsum: number; wden: number }

interface ConfirmedCardTarget { gateway: string; mid: number; channels: number[] }

function logicalToHistoricalMid(ps: string, inv: number, scb: number): number {
    if (ps === 'PS1' && inv === 2) return scb <= 10 ? scb + 26 : scb + 8;
    return inv === 2 ? scb + 18 : scb;
}

/** Tarjetas confirmadas por el operador: fuente persistente hasta que se normalicen. */
function getConfirmedCardTargets(): ConfirmedCardTarget[] {
    try {
        const rows = stateDb.prepare(`
            SELECT power_station, inversor, scb, card_id
            FROM scb_manual_reviews
        `).all() as { power_station: string; inversor: number; scb: number; card_id: number }[];
        return rows.map((r) => {
            const start = (Number(r.card_id) - 1) * 4;
            const capacity = getScbCapacity(r.power_station, Number(r.inversor), Number(r.scb));
            const length = Math.min(4, Math.max(0, capacity - start));
            return {
                gateway: r.power_station,
                mid: logicalToHistoricalMid(r.power_station, Number(r.inversor), Number(r.scb)),
                channels: Array.from({ length }, (_, i) => start + i + 1),
            };
        }).filter((target) => target.channels.length > 0);
    } catch (e) {
        console.error('[pr-engine] Error consultando tarjetas confirmadas:', e);
        return [];
    }
}

function sqlText(value: string): string { return value.replace(/'/g, "''"); }

function targetCondition(t: ConfirmedCardTarget): string {
    return `(gateway = '${sqlText(t.gateway)}' AND mid = ${t.mid})`;
}

/** Corrección kW: promedio de canales sanos x canales sin medición x V. */
function cardCorrectionKwSql(targets: ConfirmedCardTarget[]): string {
    if (targets.length === 0) return '0';
    const healthySum = Array.from({ length: 18 }, (_, i) => {
        const c = `s${String(i + 1).padStart(2, '0')}`;
        return `(CASE WHEN ${c} >= ${HEALTHY_STRING_CENTI_A} THEN ${c} ELSE 0 END)`;
    }).join(' + ');
    const healthyCount = Array.from({ length: 18 }, (_, i) => {
        const c = `s${String(i + 1).padStart(2, '0')}`;
        return `(CASE WHEN ${c} >= ${HEALTHY_STRING_CENTI_A} THEN 1 ELSE 0 END)`;
    }).join(' + ');
    return targets.map((t) => {
        const missingCount = t.channels.map((channel) => {
            const c = `s${String(channel).padStart(2, '0')}`;
            return `(CASE WHEN ${c} IS NULL OR ${c} < ${DEAD_STRING_CENTI_A} THEN 1 ELSE 0 END)`;
        }).join(' + ');
        return `(
        CASE WHEN ${targetCondition(t)} AND (${healthyCount}) > 0
             THEN (((${healthySum}) * 1.0 / (${healthyCount})) / 100.0) * (${missingCount}) * (v_avg / 1000.0)
             ELSE 0 END
    )`;
    }).join(' + ');
}

/**
 * Métricas diarias entre [from, to). Fechas en 'YYYY-MM-DD' (día local).
 * `acEnergyByDate` mapea fecha -> energía AC medida en kWh (dato manual).
 */
export function getDailyMetrics(
    from: string,
    to: string,
    cfg: PrConfig,
    acEnergyByDate: Record<string, number> = {}
): PrDailyRow[] {
    const tzMod = tzModifier(cfg);
    // Filtramos por UTC pero agrupamos por día LOCAL (tz): la tarde del último día local cae en UTC
    // del día siguiente. Ampliamos la ventana ±1 día en UTC; el HAVING recorta a [from, to] exacto.
    const utcFrom = `${shiftDay(from, -1)}T00:00:00`;
    const utcTo = `${shiftDay(to, 1)}T23:59:59`;

    let prod: ProdRow[] = [];
    let meteo: MeteoRow[] = [];
    const confirmedTargets = getConfirmedCardTargets();
    const cardCorrectionSql = cardCorrectionKwSql(confirmedTargets);
    try {
        prod = histDb.prepare(`
            SELECT date(ts, ?) AS dia,
                   COUNT(DISTINCT ts) AS ticks,
                   MIN(ts) AS ts_min,
                   MAX(ts) AS ts_max,
                   SUM(power_kw_avg) AS sum_kw,
                   SUM(${cardCorrectionSql}) AS sum_card_kw
            FROM historico_5m
            WHERE ts >= ? AND ts <= ?
            GROUP BY dia
            HAVING dia >= ? AND dia <= ?
            ORDER BY dia
        `).all(tzMod, utcFrom, utcTo, from, to) as ProdRow[];

        meteo = histDb.prepare(`
            SELECT dia,
                   SUM(avg_irr) AS sum_irr,
                   SUM(avg_irr * avg_temp) AS wsum,
                   SUM(avg_irr) AS wden
            FROM (
                SELECT date(ts, ?) AS dia, ts,
                       AVG(irradiance_avg) AS avg_irr,
                       AVG(panel_temp_avg) AS avg_temp
                FROM meteo_historico_5m
                WHERE ts >= ? AND ts <= ?
                GROUP BY ts
            )
            GROUP BY dia
        `).all(tzMod, utcFrom, utcTo) as MeteoRow[];
    } catch (e) {
        console.error('[pr-engine] Error consultando el histórico:', e);
        return [];
    }

    const meteoByDay = new Map(meteo.map((m) => [m.dia, m]));

    const ppicoDeg = cfg.ppicoPlantMW * Math.pow(1 - cfg.degradationRatePerYear, cfg.yearsInOperation);

    return prod.map((p) => {
        const dtHours = deriveDtHours(p.ts_min, p.ts_max, p.ticks);
        const m = meteoByDay.get(p.dia);

        // Insolación (kWh/m²) = Σ(irradiancia media entre estaciones) * dt / 1000
        const insolation = m ? (m.sum_irr * dtHours) / 1000 : 0;
        // Temperatura de panel ponderada por irradiancia (de noche no pesa)
        const tempPanel = m && m.wden > 0 ? m.wsum / m.wden : null;
        const cTemp = tempPanel !== null ? 1 + (tempPanel - cfg.tempStcC) * cfg.tempCoefPerC : 1;

        // Energía DC reconstruida de los combiners (con la corrección de escala x100)
        const energyDcMwh = ((p.sum_kw / POWER_SCALE_FIX) + (p.sum_card_kw || 0)) * dtHours / 1000;

        const acKwh = acEnergyByDate[p.dia];
        const energyAcMwh = typeof acKwh === 'number' ? acKwh / 1000 : null;

        const eTeoRaw = cfg.ppicoPlantMW * insolation;
        const eTeoDeg = ppicoDeg * insolation;

        const safe = (num: number, den: number): number | null =>
            den > 0 && isFinite(num / den) ? num / den : null;

        // ¿El driver cubrió el día completo? Si solo capturó un rato, la insolación acumulada es
        // parcial y NO se puede comparar contra una energía AC medida de todo el día.
        const spanHours = Math.max(0, (new Date(p.ts_max).getTime() - new Date(p.ts_min).getTime()) / 3_600_000);
        const partialDay = spanHours < MIN_FULL_DAY_SPAN_H;

        // PR sobre energía AC: solo válido si el día está completo (numerador de 24 h vs
        // denominador de la misma jornada). En día parcial se devuelve null -> la UI muestra "N/D".
        const acUsable = energyAcMwh !== null && !partialDay;
        const prRaw = acUsable ? safe(energyAcMwh!, eTeoRaw) : null;
        const prRawTemp = acUsable ? safe(energyAcMwh!, eTeoRaw * cTemp) : null;
        const prDeg = acUsable ? safe(energyAcMwh!, eTeoDeg) : null;
        const prDegTemp = acUsable ? safe(energyAcMwh!, eTeoDeg * cTemp) : null;

        const energyEstimated = ppicoDeg * insolation * cTemp * cfg.plantFactorK;
        const realIsDcProxy = energyAcMwh === null;
        const energyReal = energyAcMwh !== null ? energyAcMwh : energyDcMwh;
        // La pérdida compara Real vs Estimada: con DC ambos salen de la misma ventana (válido aun
        // en día parcial); con AC (24 h) contra una estimada parcial, no tiene sentido.
        const lossComparable = realIsDcProxy || !partialDay;
        const lossPct = lossComparable && energyEstimated > 0 ? 1 - energyReal / energyEstimated : null;

        return {
            fecha: p.dia,
            ticks: p.ticks,
            completeness: Math.min(1, p.ticks / (24 / NOMINAL_DT_HOURS)),
            dtHours,
            spanHours,
            partialDay,
            insolationKwhM2: insolation,
            tempPanelC: tempPanel,
            cTemp,
            energyDcMwh,
            energyAcMwh,
            ppicoRawMW: cfg.ppicoPlantMW,
            ppicoDegMW: ppicoDeg,
            eTeoRawMwh: eTeoRaw,
            eTeoDegMwh: eTeoDeg,
            prRaw, prRawTemp, prDeg, prDegTemp,
            prDcRaw: safe(energyDcMwh, eTeoRaw) ?? 0,
            prDcRawTemp: safe(energyDcMwh, eTeoRaw * cTemp) ?? 0,
            prDcDeg: safe(energyDcMwh, eTeoDeg) ?? 0,
            prDcDegTemp: safe(energyDcMwh, eTeoDeg * cTemp) ?? 0,
            energyEstimatedMwh: energyEstimated,
            energyRealMwh: energyReal,
            realIsDcProxy,
            lossPct,
        };
    });
}

// ----------------------------------------------------------------------------
// PR POR INVERSOR (los 28) + estimación de CLIPPING
// ----------------------------------------------------------------------------

export interface PrInverterRow {
    ps: string;                 // "PS1"
    inverter: number;           // 1 | 2
    code: string;               // "01.1" (formato del Excel)
    ticks: number;

    energyDcMwh: number;        // energía DC del inversor en el rango
    clipEnergyMwh: number;      // energía estimada perdida por clipping (P_dc > nominal AC)
    insolationKwhM2: number;    // de la meteo de su PS
    tempPanelC: number | null;
    cTemp: number;

    // PR sobre energía DC (no hay medidor AC por inversor), degradado y con/sin temp.
    // null = no hay insolación de su PS en el rango (no se puede calcular) -> UI muestra "N/D".
    prDcDeg: number | null;
    prDcDegTemp: number | null;
    prDcRaw: number | null;
    prDcRawTemp: number | null;
    // PR "recuperando" el clipping (lo que daría el arreglo sin el techo del inversor)
    prNoClipDegTemp: number | null;
    hasInsolation: boolean;
}

interface InvAggRow { ps: string; inv: number; sum_p: number; sum_clip: number; ticks: number }
interface MeteoPsRow { psnum: string; sum_irr: number; wsum: number; wden: number }

/** PR por inversor (28) agregado en el rango [from, to). Todo DC (sin medidor AC por inversor). */
export function getInverterMetrics(from: string, to: string, cfg: PrConfig): PrInverterRow[] {
    const tzMod = tzModifier(cfg);
    // Ventana UTC ±1 día (igual que en la diaria) + filtro por día LOCAL para recortar exacto,
    // ya que acá no agrupamos por día. Sin esto, la tarde del último día local (UTC del día
    // siguiente) quedaría fuera y el inversor mostraría 0.
    const utcFrom = `${shiftDay(from, -1)}T00:00:00`;
    const utcTo = `${shiftDay(to, 1)}T23:59:59`;
    const dt = NOMINAL_DT_HOURS;
    const nominal = cfg.inverterNominalAcMW;
    const confirmedTargets = getConfirmedCardTargets();
    const cardCorrectionSql = cardCorrectionKwSql(confirmedTargets);

    let inv: InvAggRow[] = [];
    let meteo: MeteoPsRow[] = [];
    try {
        inv = histDb.prepare(`
            SELECT ps, inv,
                   SUM(p_mw) AS sum_p,
                   SUM(CASE WHEN p_mw > ? THEN p_mw - ? ELSE 0 END) AS sum_clip,
                   COUNT(*) AS ticks
            FROM (
                SELECT gateway AS ps,
                       CASE WHEN mid <= 18 THEN 1 ELSE 2 END AS inv,
                       ts,
                       (SUM(power_kw_avg) / 100.0 + SUM(${cardCorrectionSql})) / 1000.0 AS p_mw
                FROM historico_5m
                WHERE ts >= ? AND ts <= ? AND date(ts, ?) >= ? AND date(ts, ?) <= ?
                GROUP BY gateway, inv, ts
            )
            GROUP BY ps, inv
        `).all(nominal, nominal, utcFrom, utcTo, tzMod, from, tzMod, to) as InvAggRow[];

        meteo = histDb.prepare(`
            SELECT substr(gateway, 7) AS psnum,
                   SUM(irradiance_avg) AS sum_irr,
                   SUM(irradiance_avg * panel_temp_avg) AS wsum,
                   SUM(irradiance_avg) AS wden
            FROM meteo_historico_5m
            WHERE ts >= ? AND ts <= ? AND date(ts, ?) >= ? AND date(ts, ?) <= ?
            GROUP BY psnum
        `).all(utcFrom, utcTo, tzMod, from, tzMod, to) as MeteoPsRow[];
    } catch (e) {
        console.error('[pr-engine] Error consultando inversores:', e);
        return [];
    }

    const meteoByPs = new Map(meteo.map((m) => [m.psnum, m]));
    const ppRawInv = cfg.ppicoInverterMW;
    const ppDegInv = ppRawInv * Math.pow(1 - cfg.degradationRatePerYear, cfg.yearsInOperation);

    const safe = (n: number, d: number): number | null => (d > 0 && isFinite(n / d) ? n / d : null);

    return inv.map((r) => {
        const psnum = r.ps.replace(/^PS/i, '');
        const m = meteoByPs.get(psnum);
        const insol = m ? (m.sum_irr * dt) / 1000 : 0;
        const tempPanel = m && m.wden > 0 ? m.wsum / m.wden : null;
        const cTemp = tempPanel !== null ? 1 + (tempPanel - cfg.tempStcC) * cfg.tempCoefPerC : 1;

        const energyDc = r.sum_p * dt;
        const clipEnergy = r.sum_clip * dt;

        return {
            ps: r.ps,
            inverter: r.inv,
            code: `${psnum.padStart(2, '0')}.${r.inv}`,
            ticks: r.ticks,
            energyDcMwh: energyDc,
            clipEnergyMwh: clipEnergy,
            insolationKwhM2: insol,
            tempPanelC: tempPanel,
            cTemp,
            prDcDeg: safe(energyDc, ppDegInv * insol),
            prDcDegTemp: safe(energyDc, ppDegInv * insol * cTemp),
            prDcRaw: safe(energyDc, ppRawInv * insol),
            prDcRawTemp: safe(energyDc, ppRawInv * insol * cTemp),
            prNoClipDegTemp: safe(energyDc + clipEnergy, ppDegInv * insol * cTemp),
            hasInsolation: insol > 0,
        };
    }).sort((a, b) => a.code.localeCompare(b.code));
}

// ----------------------------------------------------------------------------
// DESGLOSE DE PÉRDIDAS (¿de quién es la culpa?)
// ----------------------------------------------------------------------------

/** Nº de cajas SCB esperadas en el parque (14 PS x 36). Sirve para estimar equipos fuera. */
const EXPECTED_SCBS = 504;
const DEAD_STRING_CENTI_A = 30;    // < 0.3 A => string caído
const HEALTHY_STRING_CENTI_A = 50; // >= 0.5 A => string sano (para el promedio)

/**
 * Traduce la topología lógica de SCB de 15 strings al gateway/MID físico del histórico.
 * Así los canales s16-s18 inexistentes nunca se contabilizan como strings caídos.
 */
function fifteenStringHistoricalPredicate(): string {
    const clauses = FIFTEEN_STRING_SCB_KEYS.map((key) => {
        const match = /^(PS\d+)-(\d+)-(\d+)$/.exec(key);
        if (!match) throw new Error(`Clave de SCB inválida: ${key}`);
        const [, ps, invRaw, scbRaw] = match;
        const inv = Number(invRaw);
        const scb = Number(scbRaw);

        let mid = scb;
        if (ps === 'PS1' && inv === 2) {
            mid = scb <= 10 ? scb + 26 : scb + 8;
        } else if (inv === 2) {
            mid = scb + 18;
        }
        return `(gateway = '${ps}' AND mid = ${mid})`;
    });
    return `(${clauses.join(' OR ')})`;
}

export interface PrLossBreakdown {
    estimatedMwh: number;      // lo que se debió producir según las condiciones reales
    realMwh: number;           // lo que se produjo
    totalLossMwh: number;      // Estimada - Real
    clippingMwh: number;       // 🟡 por diseño (paneles > inversores)
    offlineMwh: number;        // ⚫ cajas que no reportaron
    deadStringsMwh: number;    // 🔴 strings caídos
    curtailmentMwh: number;    // 🔵 residual = lo que no explica ninguna de las anteriores
    reliable: boolean;         // false si el rango tiene días parciales (no confiar)
}

/**
 * Descompone la pérdida total por causa, POR DESCARTE (el método manual que ya se usa,
 * pero cuantificado). El curtailment es el RESIDUAL: no lo medimos, lo inferimos.
 */
export function getLossBreakdown(
    from: string,
    to: string,
    cfg: PrConfig,
    totals: { estimatedMwh: number; realMwh: number; clippingMwh: number; reliable: boolean }
): PrLossBreakdown {
    const tzMod = tzModifier(cfg);
    const utcFrom = `${shiftDay(from, -1)}T00:00:00`;
    const utcTo = `${shiftDay(to, 1)}T23:59:59`;
    const dt = NOMINAL_DT_HOURS;

    let offlineMwh = 0;
    let deadStringsMwh = 0;
    const confirmedTargets = getConfirmedCardTargets();

    try {
        // --- ⚫ Equipos fuera: por cada muestra, las cajas que faltan respecto de las 504 ---
        const ticks = histDb.prepare(`
            SELECT COUNT(*) AS n, SUM(power_kw_avg) / ${POWER_SCALE_FIX} AS kw
            FROM historico_5m
            WHERE ts >= ? AND ts <= ? AND date(ts, ?) >= ? AND date(ts, ?) <= ?
            GROUP BY ts
        `).all(utcFrom, utcTo, tzMod, from, tzMod, to) as { n: number; kw: number }[];

        for (const t of ticks) {
            if (t.n <= 0 || t.n >= EXPECTED_SCBS) continue;
            const avgPerScbKw = t.kw / t.n;              // lo que rinde una caja en ese momento
            offlineMwh += ((EXPECTED_SCBS - t.n) * avgPerScbKw * dt) / 1000;
        }

        // --- 🔴 Strings caídos: nº de strings en ~0 x lo que rinde un string sano de esa caja ---
        const is15Scb = fifteenStringHistoricalPredicate();
        const sCols = Array.from({ length: 18 }, (_, i) => ({
            column: `s${String(i + 1).padStart(2, '0')}`,
            physicallyPresent: i < 15 ? '1 = 1' : `NOT ${is15Scb}`,
        }));
        const deadExpr = sCols.map(({ column, physicallyPresent }, i) => {
            const channel = i + 1;
            const confirmedHere = confirmedTargets
                .filter((t) => t.channels.includes(channel))
                .map(targetCondition)
                .join(' OR ') || '0';
            return `(CASE WHEN ${physicallyPresent} AND NOT (${confirmedHere}) AND ${column} IS NOT NULL AND ${column} < ${DEAD_STRING_CENTI_A} THEN 1 ELSE 0 END)`;
        }
        ).join(' + ');
        const healthySum = sCols.map(({ column, physicallyPresent }) =>
            `(CASE WHEN ${physicallyPresent} AND ${column} >= ${HEALTHY_STRING_CENTI_A} THEN ${column} ELSE 0 END)`
        ).join(' + ');
        const healthyCnt = sCols.map(({ column, physicallyPresent }) =>
            `(CASE WHEN ${physicallyPresent} AND ${column} >= ${HEALTHY_STRING_CENTI_A} THEN 1 ELSE 0 END)`
        ).join(' + ');

        const dead = histDb.prepare(`
            SELECT SUM(
                CASE WHEN hc > 0
                     THEN dead_n * ((hs * 1.0 / hc) / 100.0) * (v_avg / 1000.0)
                     ELSE 0 END
            ) AS lost_kw
            FROM (
                SELECT v_avg, (${deadExpr}) AS dead_n, (${healthySum}) AS hs, (${healthyCnt}) AS hc
                FROM historico_5m
                WHERE ts >= ? AND ts <= ? AND date(ts, ?) >= ? AND date(ts, ?) <= ?
            )
        `).get(utcFrom, utcTo, tzMod, from, tzMod, to) as { lost_kw: number | null };

        deadStringsMwh = ((dead?.lost_kw ?? 0) * dt) / 1000;
    } catch (e) {
        console.error('[pr-engine] Error en el desglose de pérdidas:', e);
    }

    const totalLossMwh = Math.max(0, totals.estimatedMwh - totals.realMwh);
    // El curtailment es lo que queda sin explicar. Nunca negativo.
    const curtailmentMwh = Math.max(0, totalLossMwh - totals.clippingMwh - offlineMwh - deadStringsMwh);

    return {
        estimatedMwh: totals.estimatedMwh,
        realMwh: totals.realMwh,
        totalLossMwh,
        clippingMwh: totals.clippingMwh,
        offlineMwh,
        deadStringsMwh,
        curtailmentMwh,
        reliable: totals.reliable,
    };
}

// ----------------------------------------------------------------------------
// VISTA HORARIA (curva de PR e irradiancia de un día)
// ----------------------------------------------------------------------------

export interface PrHourRow {
    hour: string;               // "00".."23" (hora local)
    avgIrradianceWm2: number;   // irradiancia media de la hora
    insolationKwhM2: number;    // insolación de esa hora
    energyMwh: number;          // energía DC generada en la hora
    powerAvgMw: number;         // potencia DC media de la hora
    tempPanelC: number | null;
    prDcDeg: number | null;     // PR de la hora (DC, con degradación)
    prDcDegTemp: number | null; // + corrección de temperatura
}

interface HourProd { hh: string; sum_kw: number; ticks: number }
interface HourMeteo { hh: string; sum_irr: number; irr_ticks: number; wsum: number; wden: number }

/** Métricas hora a hora de un día local ('YYYY-MM-DD'). */
export function getHourlyMetrics(day: string, cfg: PrConfig): PrHourRow[] {
    const tzMod = tzModifier(cfg);
    const dt = NOMINAL_DT_HOURS;
    const utcFrom = `${day}T00:00:00`;
    const utcTo = `${day}T23:59:59`;
    // El día local se corre respecto al UTC; ampliamos ±1 día y filtramos por date() local.
    const wideFrom = `${day}T00:00:00`;
    const wideTo = `${day}T23:59:59`;

    let prod: HourProd[] = [];
    let meteo: HourMeteo[] = [];
    try {
        prod = histDb.prepare(`
            SELECT strftime('%H', ts, ?) AS hh, SUM(power_kw_avg) AS sum_kw, COUNT(DISTINCT ts) AS ticks
            FROM historico_5m
            WHERE date(ts, ?) = ? AND ts >= date(?, '-1 day') AND ts <= date(?, '+2 day')
            GROUP BY hh ORDER BY hh
        `).all(tzMod, tzMod, day, wideFrom, wideTo) as HourProd[];

        meteo = histDb.prepare(`
            SELECT hh, SUM(avg_irr) AS sum_irr, COUNT(*) AS irr_ticks,
                   SUM(avg_irr * avg_temp) AS wsum, SUM(avg_irr) AS wden
            FROM (
                SELECT strftime('%H', ts, ?) AS hh, ts,
                       AVG(irradiance_avg) AS avg_irr, AVG(panel_temp_avg) AS avg_temp
                FROM meteo_historico_5m
                WHERE date(ts, ?) = ? AND ts >= date(?, '-1 day') AND ts <= date(?, '+2 day')
                GROUP BY ts
            )
            GROUP BY hh ORDER BY hh
        `).all(tzMod, tzMod, day, wideFrom, wideTo) as HourMeteo[];
    } catch (e) {
        console.error('[pr-engine] Error consultando horas:', e);
        return [];
    }
    void utcFrom; void utcTo;

    const prodByH = new Map(prod.map((p) => [p.hh, p]));
    const meteoByH = new Map(meteo.map((m) => [m.hh, m]));
    const ppDeg = cfg.ppicoPlantMW * Math.pow(1 - cfg.degradationRatePerYear, cfg.yearsInOperation);
    const safe = (n: number, d: number): number | null => (d > 0 && isFinite(n / d) ? n / d : null);

    const out: PrHourRow[] = [];
    for (let h = 0; h < 24; h++) {
        const hh = String(h).padStart(2, '0');
        const p = prodByH.get(hh);
        const m = meteoByH.get(hh);

        const energyMwh = p ? (p.sum_kw / POWER_SCALE_FIX) * dt / 1000 : 0;
        const powerAvgMw = p && p.ticks > 0 ? (p.sum_kw / POWER_SCALE_FIX) / 1000 / p.ticks : 0;
        const insol = m ? (m.sum_irr * dt) / 1000 : 0;
        const avgIrr = m && m.irr_ticks > 0 ? m.sum_irr / m.irr_ticks : 0;
        const tempPanel = m && m.wden > 0 ? m.wsum / m.wden : null;
        const cTemp = tempPanel !== null ? 1 + (tempPanel - cfg.tempStcC) * cfg.tempCoefPerC : 1;

        out.push({
            hour: hh,
            avgIrradianceWm2: avgIrr,
            insolationKwhM2: insol,
            energyMwh,
            powerAvgMw,
            tempPanelC: tempPanel,
            prDcDeg: safe(energyMwh, ppDeg * insol),
            prDcDegTemp: safe(energyMwh, ppDeg * insol * cTemp),
        });
    }
    return out;
}
