import { NextRequest, NextResponse } from "next/server";
import stateDb from "@/app/lib/stateDb";
import { DEFAULT_PR_CONFIG } from "@/app/lib/pr-engine";

export const dynamic = "force-dynamic";

// Constantes del modelo de PR. Por defecto son las del Excel de gerencia; se pueden
// ajustar sin tocar código (Ppico, coef. temperatura, degradación, factor de planta, etc.).

const EDITABLE = new Set(Object.keys(DEFAULT_PR_CONFIG));

export async function GET() {
    try {
        const cfg: Record<string, number> = { ...(DEFAULT_PR_CONFIG as unknown as Record<string, number>) };
        const rows = stateDb.prepare("SELECT key, value FROM pr_config").all() as { key: string; value: number }[];
        for (const r of rows) if (EDITABLE.has(r.key)) cfg[r.key] = r.value;
        return NextResponse.json({ config: cfg, defaults: DEFAULT_PR_CONFIG });
    } catch (error) {
        console.error("Error GET /api/pr/config:", error);
        return NextResponse.json({ config: DEFAULT_PR_CONFIG, defaults: DEFAULT_PR_CONFIG });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const entries = Object.entries(body || {}).filter(([k]) => EDITABLE.has(k));

        if (entries.length === 0) {
            return NextResponse.json({ error: "No se recibió ninguna constante válida" }, { status: 400 });
        }

        const stmt = stateDb.prepare(`
            INSERT INTO pr_config (key, value, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `);
        const tx = stateDb.transaction((rows: [string, number][]) => {
            for (const [k, v] of rows) stmt.run(k, v);
        });

        const clean: [string, number][] = [];
        for (const [k, v] of entries) {
            const num = Number(v);
            if (!isFinite(num)) {
                return NextResponse.json({ error: `Valor inválido para ${k}` }, { status: 400 });
            }
            clean.push([k, num]);
        }
        tx(clean);

        return NextResponse.json({ status: "success", updated: clean.length });
    } catch (error) {
        console.error("Error POST /api/pr/config:", error);
        return NextResponse.json({ error: "No se pudo guardar la configuración" }, { status: 500 });
    }
}
