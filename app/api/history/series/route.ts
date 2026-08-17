import { NextRequest, NextResponse } from "next/server";
import {
    aggregateSeries,
    defaultLabel,
    SeriesSpec,
    HistVariable,
    RawHistRow,
} from "@/app/lib/history-agg";
import { driverUrl } from "@/app/lib/driver-url";

export const dynamic = "force-dynamic";

const VALID_VARIABLES: HistVariable[] = ["corriente", "voltaje", "potencia", "temperatura", "irradiancia"];

// Devuelve series temporales ya agregadas por nivel (PS/Inversor/SCB/String),
// listas para graficar. Hace una sola consulta al driver por cada PS involucrada.
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const hours: number = Math.max(1, Math.min(Number(body.hours) || 24, 24 * 90)); // tope 90 días
        const variable: HistVariable = VALID_VARIABLES.includes(body.variable) ? body.variable : "corriente";
        const series: SeriesSpec[] = Array.isArray(body.series) ? body.series : [];

        if (series.length === 0) {
            return NextResponse.json({ series: [] });
        }

        // Una sola llamada al driver por PS (varias series pueden compartir PS).
        const psNeeded = Array.from(new Set(series.map((s) => s.ps).filter(Boolean)));
        const rowsByPs = new Map<string, RawHistRow[]>();

        await Promise.all(
            psNeeded.map(async (ps) => {
                try {
                    const res = await fetch(
                        driverUrl(`/history?gateway=${encodeURIComponent(ps)}&hours=${hours}`),
                        { cache: "no-store" }
                    );
                    const json = res.ok ? await res.json() : { data: [] };
                    rowsByPs.set(ps, Array.isArray(json.data) ? json.data : []);
                } catch {
                    rowsByPs.set(ps, []);
                }
            })
        );

        const result = series.map((spec) => ({
            id: spec.id,
            label: spec.label || defaultLabel(spec),
            color: spec.color,
            points: aggregateSeries(spec, variable, rowsByPs.get(spec.ps) || []),
        }));

        return NextResponse.json({ variable, hours, series: result });
    } catch (error) {
        console.error("Error en /api/history/series:", error);
        return NextResponse.json({ error: "Failed to build history series" }, { status: 500 });
    }
}
