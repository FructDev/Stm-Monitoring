import { NextRequest, NextResponse } from "next/server";
import { getDailyMetrics, getInverterMetrics, getLossBreakdown } from "@/app/lib/pr-engine";
import { loadPrConfig, loadAcEnergy, latestDataDate, addDaysIso } from "@/app/lib/pr-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const cfg = loadPrConfig();

        // Rango por defecto: 7 días terminando en la ÚLTIMA fecha con datos (no en "hoy",
        // que podría no tener nada todavía). Así la página abre siempre mostrando datos.
        const anchor = latestDataDate(cfg) || new Date().toISOString().slice(0, 10);
        const to = searchParams.get("to") || anchor;
        const from = searchParams.get("from") || addDaysIso(to, -6);

        const acEnergy = loadAcEnergy(from, to);
        const days = getDailyMetrics(from, to, cfg, acEnergy);
        const inverters = getInverterMetrics(from, to, cfg);

        // Totales del rango. En días parciales la energía AC (24 h) no es comparable con una
        // insolación de unas horas, así que ahí usamos la DC (misma ventana) para no inflar nada.
        const estimatedMwh = days.reduce((s, d) => s + d.energyEstimatedMwh, 0);
        const realMwh = days.reduce(
            (s, d) => s + (d.partialDay || d.energyAcMwh == null ? d.energyDcMwh : d.energyAcMwh),
            0
        );
        const clippingMwh = inverters.reduce((s, i) => s + i.clipEnergyMwh, 0);
        const reliable = days.length > 0 && days.every((d) => !d.partialDay);

        const lossBreakdown = getLossBreakdown(from, to, cfg, {
            estimatedMwh, realMwh, clippingMwh, reliable,
        });

        return NextResponse.json({ from, to, latestDataDate: anchor, config: cfg, days, inverters, lossBreakdown });
    } catch (error) {
        console.error("Error en /api/pr:", error);
        return NextResponse.json({ error: "No se pudieron calcular las métricas de PR" }, { status: 500 });
    }
}
