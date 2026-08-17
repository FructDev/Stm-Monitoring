import fs from 'fs';
import { AI_SHADOW_LOG_PATH } from '../data-paths';
import { driverUrl } from '../driver-url';
import stateDb from '../stateDb';
import { detectShading } from './shadingDetector';
import { detectSoiling } from './soilingPredictor';
import { detectThermalFatigue } from './thermalFatigue';
import { calculateExpectedPower } from './digitalTwin';

// Ventana histórica analizada. Soiling y fatiga térmica son fenómenos de semanas,
// por eso pedimos 14 días en una sola consulta y cada detector filtra internamente.
const HISTORY_HOURS = 336; // 14 días

// Log de validación para Shadow Mode (comparar la IA contra la realidad antes del go-live).
const SHADOW_LOG = AI_SHADOW_LOG_PATH;

function appendShadowLog(entry: Record<string, unknown>) {
    try {
        fs.appendFileSync(SHADOW_LOG, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
    } catch {
        /* el log es best-effort; no debe romper el análisis */
    }
}

/**
 * Ejecuta los detectores predictivos sobre una caja SCB.
 *
 * @param psName   Identificador de la planta (ej: "PS1")
 * @param mid      MID físico Modbus (1-36) usado para consultar el histórico del driver
 * @param inversor Inversor lógico (1|2) con el que se guarda la predicción
 * @param scb      SCB lógico (1-18) con el que se guarda la predicción
 * @param mode     'shadow' = validación silenciosa (no visible al técnico) | 'live' = visible
 */
export async function runDailyAnalyticsForScb(
    psName: string,
    mid: number,
    inversor: number,
    scb: number,
    mode: 'shadow' | 'live' = 'live'
) {
    try {
        // El histórico se consulta por MID físico; la predicción se guarda por inversor/scb lógico.
        const historyUrl = driverUrl(`/history?gateway=${encodeURIComponent(psName)}&mid=${mid}&hours=${HISTORY_HOURS}`);
        const res = await fetch(historyUrl, { cache: 'no-store' });
        if (!res.ok) return;

        const json = await res.json();
        const history = json.data;
        if (!history || history.length === 0) return;

        // Desactivamos solo las predicciones previas DEL MISMO MODO para no pisar el otro.
        stateDb.prepare(`
            UPDATE ai_predictions
            SET is_active = 0
            WHERE power_station = ? AND inversor = ? AND scb = ? AND mode = ?
        `).run(psName, inversor, scb, mode);

        const insertStmt = stateDb.prepare(`
            INSERT INTO ai_predictions (power_station, inversor, scb, string_id, prediction_type, severity, details, mode)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const record = (
            stringId: number | null,
            type: string,
            severity: string,
            details: string
        ) => {
            insertStmt.run(psName, inversor, scb, stringId, type, severity, details, mode);
            if (mode === 'shadow') {
                appendShadowLog({ psName, inversor, scb, stringId, type, severity, details });
            }
        };

        // 1. Shading (Maleza)
        const shadingAlerts = detectShading(history);
        for (const alert of shadingAlerts) {
            record(alert.string_id, 'SHADING', alert.severity, alert.details);
        }

        // 2. Fatiga Térmica
        const thermalAlert = detectThermalFatigue(history);
        if (thermalAlert) {
            record(null, 'THERMAL_FATIGUE', thermalAlert.severity, thermalAlert.details);
        }

        // 3. Soiling (Gemelo Digital + Predictor)
        // Irradiancia/temperatura reales provistas por /history (cruce con la meteo de la planta).
        // Solo contamos filas con irradiancia válida; si la meteo no reportó, no adivinamos.
        let avgIrrad = 0; let avgTemp = 0; let count = 0;
        history.forEach((row: any) => {
            const irrad = typeof row.irradiance_avg === 'number' ? row.irradiance_avg : null;
            if (irrad !== null && irrad > 100) {
                avgIrrad += irrad;
                avgTemp += row.temp_avg;
                count++;
            }
        });

        if (count > 0) {
            const expectedPower = calculateExpectedPower(avgIrrad / count, avgTemp / count);
            const soilingAlert = detectSoiling(history, expectedPower);
            if (soilingAlert) {
                record(null, 'SOILING', soilingAlert.severity, soilingAlert.details);
            }
        }

    } catch (error) {
        console.error(`[ML Runner] Error procesando SCB ${scb} en ${psName}:`, error);
    }
}
