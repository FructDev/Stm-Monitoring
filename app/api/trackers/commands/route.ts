import { NextRequest, NextResponse } from "next/server";
import db from "@/app/lib/db";
import stateDb from "@/app/lib/stateDb";
import { GATEWAY_TO_PS } from "@/app/lib/tracker-config";

export const dynamic = "force-dynamic";

interface PendingCommand {
    id: number;
    gateway: string;
    tracker_idx: number;
    requested_mode: number | null;
    requested_setpoint_deg: number | null;
    requested_at: string;
    status: string;
}

interface TrackerObservation {
    mode: number | null;
    manual_sp: number | null;
    ts: string;
}

function reconcileCommands() {
    const pending = stateDb.prepare(`
        SELECT id, gateway, tracker_idx, requested_mode, requested_setpoint_deg, requested_at, status
        FROM tracker_command_audit
        WHERE status IN ('SENDING', 'ACCEPTED')
        ORDER BY requested_at
    `).all() as PendingCommand[];

    const observationStmt = db.prepare(`
        SELECT mode, manual_sp, ts FROM tracker_readings
        WHERE gateway = ? AND tracker_idx = ?
    `);
    const verifiedStmt = stateDb.prepare(`
        UPDATE tracker_command_audit
        SET status = ?, observed_mode = ?, observed_setpoint_deg = ?, observed_at = ?, verified_at = ?
        WHERE id = ?
    `);
    const timeoutStmt = stateDb.prepare(`
        UPDATE tracker_command_audit
        SET status = 'TIMEOUT', verified_at = ? WHERE id = ?
    `);

    const now = new Date();
    const tx = stateDb.transaction(() => {
        for (const command of pending) {
            const requestedMs = Date.parse(command.requested_at);
            const observation = observationStmt.get(command.gateway, command.tracker_idx) as TrackerObservation | undefined;
            const observationMs = observation ? Date.parse(observation.ts) : Number.NaN;

            if (observation && Number.isFinite(observationMs) && observationMs >= requestedMs) {
                const observedSetpoint = typeof observation.manual_sp === "number"
                    ? Math.round(observation.manual_sp / 100)
                    : null;
                const modeMatches = command.requested_mode === null || observation.mode === command.requested_mode;
                const setpointMatches = command.requested_setpoint_deg === null
                    || observedSetpoint === command.requested_setpoint_deg;
                const status = modeMatches && setpointMatches ? "VERIFIED" : "MISMATCH";
                verifiedStmt.run(status, observation.mode, observedSetpoint, observation.ts, now.toISOString(), command.id);
            } else if (Number.isFinite(requestedMs) && now.getTime() - requestedMs > 60_000) {
                timeoutStmt.run(now.toISOString(), command.id);
            }
        }
    });
    tx();
}

export async function GET(request: NextRequest) {
    try {
        reconcileCommands();

        const gateway = request.nextUrl.searchParams.get("gateway");
        const trackerIdx = Number(request.nextUrl.searchParams.get("tracker_idx"));
        const limit = Math.max(1, Math.min(50, Number(request.nextUrl.searchParams.get("limit")) || 10));

        if (!gateway || !GATEWAY_TO_PS[gateway] || !Number.isInteger(trackerIdx) || trackerIdx < 1) {
            return NextResponse.json({ error: "gateway y tracker_idx válidos son requeridos" }, { status: 400 });
        }

        const commands = stateDb.prepare(`
            SELECT id, gateway, tracker_idx, command_type, requested_mode, requested_setpoint_deg,
                   requested_at, source_ip, status, driver_status, driver_message,
                   observed_mode, observed_setpoint_deg, observed_at, verified_at
            FROM tracker_command_audit
            WHERE gateway = ? AND tracker_idx = ?
            ORDER BY requested_at DESC
            LIMIT ?
        `).all(gateway, trackerIdx, limit);

        return NextResponse.json({ commands });
    } catch (error) {
        console.error("Error consultando auditoría de trackers:", error);
        return NextResponse.json({ error: "No se pudo consultar la auditoría" }, { status: 500 });
    }
}
