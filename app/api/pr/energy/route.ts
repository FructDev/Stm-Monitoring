import { NextRequest, NextResponse } from "next/server";
import stateDb from "@/app/lib/stateDb";

export const dynamic = "force-dynamic";

// Energía AC medida del medidor fiscal. Es el ÚNICO dato manual del módulo de PR.

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const from = searchParams.get("from");
        const to = searchParams.get("to");
        const rows = from && to
            ? stateDb.prepare("SELECT fecha, ac_kwh, updated_at FROM pr_manual_energy WHERE fecha >= ? AND fecha <= ? ORDER BY fecha DESC").all(from, to)
            : stateDb.prepare("SELECT fecha, ac_kwh, updated_at FROM pr_manual_energy ORDER BY fecha DESC LIMIT 90").all();
        return NextResponse.json({ energies: rows });
    } catch (error) {
        console.error("Error GET /api/pr/energy:", error);
        return NextResponse.json({ error: "No se pudo leer la energía cargada" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const fecha = String(body?.fecha || "");
        const acKwh = Number(body?.ac_kwh);

        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            return NextResponse.json({ error: "Fecha inválida (se espera YYYY-MM-DD)" }, { status: 400 });
        }
        if (!isFinite(acKwh) || acKwh < 0) {
            return NextResponse.json({ error: "La energía debe ser un número positivo (kWh)" }, { status: 400 });
        }

        stateDb.prepare(`
            INSERT INTO pr_manual_energy (fecha, ac_kwh, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(fecha) DO UPDATE SET ac_kwh = excluded.ac_kwh, updated_at = CURRENT_TIMESTAMP
        `).run(fecha, acKwh);

        return NextResponse.json({ status: "success", fecha, ac_kwh: acKwh });
    } catch (error) {
        console.error("Error POST /api/pr/energy:", error);
        return NextResponse.json({ error: "No se pudo guardar la energía" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const fecha = String(body?.fecha || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
            return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
        }
        stateDb.prepare("DELETE FROM pr_manual_energy WHERE fecha = ?").run(fecha);
        return NextResponse.json({ status: "success" });
    } catch (error) {
        console.error("Error DELETE /api/pr/energy:", error);
        return NextResponse.json({ error: "No se pudo borrar" }, { status: 500 });
    }
}
