import { NextRequest, NextResponse } from "next/server";
import stateDb from "@/app/lib/stateDb";

export const dynamic = "force-dynamic";

// Devuelve el mapa de bypass actual { "PS1-2": "PS1-4", ... }
export async function GET() {
    try {
        const rows = stateDb.prepare("SELECT slave_key, master_key FROM tracker_bypass").all() as any[];
        const map: Record<string, string> = {};
        rows.forEach((r) => { map[r.slave_key] = r.master_key; });
        return NextResponse.json(map);
    } catch (e) {
        console.error("Error GET bypass:", e);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

// Pone un tracker en bypass: { slave_key, master_key }
export async function POST(request: NextRequest) {
    try {
        const { slave_key, master_key } = await request.json();
        if (!slave_key || !master_key) {
            return NextResponse.json({ error: "slave_key y master_key requeridos" }, { status: 400 });
        }
        if (slave_key === master_key) {
            return NextResponse.json({ error: "un tracker no puede ser su propio maestro" }, { status: 400 });
        }
        stateDb.prepare(`
            INSERT INTO tracker_bypass (slave_key, master_key, created_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(slave_key) DO UPDATE SET master_key = excluded.master_key, created_at = CURRENT_TIMESTAMP
        `).run(slave_key, master_key);
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("Error POST bypass:", e);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

// Normaliza un tracker (lo saca de bypass): { slave_key }
export async function DELETE(request: NextRequest) {
    try {
        const { slave_key } = await request.json();
        if (!slave_key) return NextResponse.json({ error: "slave_key requerido" }, { status: 400 });
        stateDb.prepare("DELETE FROM tracker_bypass WHERE slave_key = ?").run(slave_key);
        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("Error DELETE bypass:", e);
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
