import { NextRequest, NextResponse } from "next/server";
import stateDb from "@/app/lib/stateDb";

export const dynamic = "force-dynamic";

// Registra el "Reconocer" de una alarma. El silencio se aplica por combinación
// exacta (planta, inversor, scb, alarm_code): si la caja cambia de problema,
// la nueva alarma tiene otro alarm_code y vuelve a sonar.
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { power_station, inversor, scb, alarm_code } = body;

        if (!power_station || inversor == null || scb == null || !alarm_code) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const now = new Date().toISOString();

        stateDb.prepare(`
            INSERT INTO alarm_acks (power_station, inversor, scb, alarm_code, ack_ts)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(power_station, inversor, scb, alarm_code) DO UPDATE SET ack_ts = excluded.ack_ts
        `).run(power_station, inversor, scb, alarm_code, now);

        return NextResponse.json({ success: true, ack_ts: now });
    } catch (error) {
        console.error("Error acknowledging alarm:", error);
        return NextResponse.json({ error: "Failed to acknowledge alarm" }, { status: 500 });
    }
}
