import { NextResponse } from "next/server";
import histDb from "@/app/lib/histDb";

export const dynamic = "force-dynamic";

interface ValidationRow {
    pairs: number;
    latest_ts: string | null;
    current_ratio: number | null;
    power_ratio: number | null;
    voltage_ratio: number | null;
    temperature_ratio: number | null;
    string_ratio: number | null;
}

function closeTo(value: number | null, expected: number, tolerance: number): boolean {
    return value !== null && Number.isFinite(value) && Math.abs(value - expected) <= tolerance;
}

/**
 * Compara las filas shadow V2 con las filas legado generadas en el mismo instante.
 * No modifica ni selecciona la fuente usada por las pantallas.
 */
export async function GET() {
    try {
        const exists = histDb.prepare(`
            SELECT EXISTS(
                SELECT 1 FROM sqlite_master
                WHERE type = 'table' AND name = 'historico_5m_v2'
            ) AS value
        `).get() as { value: number };

        if (!exists.value) {
            return NextResponse.json({
                status: "waiting",
                message: "La tabla histórica V2 todavía no ha sido inicializada por el driver.",
                legacyActive: true,
                v2Active: false,
            });
        }

        const row = histDb.prepare(`
            SELECT COUNT(*) AS pairs,
                   MAX(v2.ts) AS latest_ts,
                   AVG(CASE WHEN v2.i_total_avg != 0 THEN old.i_total_avg / v2.i_total_avg END) AS current_ratio,
                   AVG(CASE WHEN v2.power_kw_avg != 0 THEN old.power_kw_avg / v2.power_kw_avg END) AS power_ratio,
                   AVG(CASE WHEN v2.v_avg != 0 THEN old.v_avg / v2.v_avg END) AS voltage_ratio,
                   AVG(CASE WHEN v2.temp_avg != 0 THEN old.temp_avg / v2.temp_avg END) AS temperature_ratio,
                   AVG(CASE WHEN v2.s01 != 0 THEN old.s01 / v2.s01 END) AS string_ratio
            FROM historico_5m_v2 v2
            INNER JOIN historico_5m old
               ON old.ts = v2.ts AND old.gateway = v2.gateway AND old.mid = v2.mid
        `).get() as ValidationRow;

        const checks = {
            currentRatio100: closeTo(row.current_ratio, 100, 0.001),
            powerRatio100: closeTo(row.power_ratio, 100, 0.001),
            stringRatio100: closeTo(row.string_ratio, 100, 0.001),
            voltageRatio1: closeTo(row.voltage_ratio, 1, 0.000001),
            temperatureRatio1: closeTo(row.temperature_ratio, 1, 0.000001),
        };
        const ready = row.pairs > 0 && Object.values(checks).every(Boolean);

        return NextResponse.json({
            status: row.pairs === 0 ? "waiting" : ready ? "validated" : "mismatch",
            message: row.pairs === 0
                ? "V2 existe, pero todavía no hay un ciclo de cinco minutos para comparar."
                : ready
                    ? "Las unidades V2 coinciden con la relación esperada. Las pantallas siguen usando legado."
                    : "La comparación no coincide; V2 no debe activarse.",
            legacyActive: true,
            v2Active: false,
            pairs: row.pairs,
            latestTs: row.latest_ts,
            ratios: {
                currentLegacyToV2: row.current_ratio,
                powerLegacyToV2: row.power_ratio,
                voltageLegacyToV2: row.voltage_ratio,
                temperatureLegacyToV2: row.temperature_ratio,
                stringLegacyToV2: row.string_ratio,
            },
            checks,
        });
    } catch (error) {
        console.error("Error validando histórico V2:", error);
        return NextResponse.json({
            status: "error",
            message: "No se pudo comparar el histórico legado con V2.",
            legacyActive: true,
            v2Active: false,
        }, { status: 500 });
    }
}
