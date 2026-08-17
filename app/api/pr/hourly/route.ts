import { NextRequest, NextResponse } from "next/server";
import { getHourlyMetrics } from "@/app/lib/pr-engine";
import { loadPrConfig } from "@/app/lib/pr-config";

export const dynamic = "force-dynamic";

// Curva horaria (PR e irradiancia) de un día. GET /api/pr/hourly?date=YYYY-MM-DD
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json({ error: "Fecha inválida (YYYY-MM-DD)" }, { status: 400 });
        }
        const cfg = loadPrConfig();
        const hours = getHourlyMetrics(date, cfg);
        return NextResponse.json({ date, hours });
    } catch (error) {
        console.error("Error en /api/pr/hourly:", error);
        return NextResponse.json({ error: "No se pudo calcular la curva horaria" }, { status: 500 });
    }
}
