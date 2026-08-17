import { NextRequest, NextResponse } from "next/server";
import { TRACKER_MIN_DEG, TRACKER_MAX_DEG } from "@/app/lib/tracker-config";
import { GATEWAY_TO_PS } from "@/app/lib/tracker-config";
import stateDb from "@/app/lib/stateDb";
import { driverUrl } from "@/app/lib/driver-url";

export const dynamic = "force-dynamic";

// Proxy validado hacia el driver Rust (POST /tracker/setpoint => FC06).
export async function POST(req: NextRequest) {
    let commandId: number | null = null;
    try {
        const body = await req.json();
        const { gateway, tracker_idx, mode, manual_setpoint } = body || {};

        const trackerIdx = Number(tracker_idx);
        const gatewayDef = typeof gateway === "string" ? GATEWAY_TO_PS[gateway] : undefined;
        if (!gatewayDef || !Number.isInteger(trackerIdx) || trackerIdx < 1 || trackerIdx > (gatewayDef.count ?? 6)) {
            return NextResponse.json({ status: "error", message: "Gateway o tracker_idx fuera de la topología configurada" }, { status: 400 });
        }
        if (mode !== undefined && mode !== 0 && mode !== 1) {
            return NextResponse.json({ status: "error", message: "Modo inválido; se espera 0 (Auto) o 1 (Manual)" }, { status: 400 });
        }
        // Resguardo: clampar el ángulo al rango físico antes de enviar
        let sp = manual_setpoint;
        if (typeof sp === "number" && Number.isFinite(sp)) {
            sp = Math.max(TRACKER_MIN_DEG, Math.min(TRACKER_MAX_DEG, Math.round(sp)));
        } else if (sp !== undefined && sp !== null) {
            return NextResponse.json({ status: "error", message: "Setpoint manual inválido" }, { status: 400 });
        }

        const commandType = sp !== undefined && sp !== null ? "MANUAL_SETPOINT" : mode === 1 ? "MODE_MANUAL" : "MODE_AUTO";
        const requestedAt = new Date().toISOString();
        const sourceIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            || req.headers.get("x-real-ip")
            || null;
        const inserted = stateDb.prepare(`
            INSERT INTO tracker_command_audit
                (gateway, tracker_idx, command_type, requested_mode, requested_setpoint_deg,
                 requested_at, source_ip, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'SENDING')
        `).run(gateway, trackerIdx, commandType, mode ?? null, sp ?? null, requestedAt, sourceIp);
        commandId = Number(inserted.lastInsertRowid);

        const res = await fetch(driverUrl("/tracker/setpoint"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gateway, tracker_idx: trackerIdx, mode, manual_setpoint: sp }),
            cache: "no-store",
        });
        const json = await res.json().catch(() => ({ status: "error", message: "Respuesta inválida del driver" }));
        const accepted = res.ok && json.status === "success";
        stateDb.prepare(`
            UPDATE tracker_command_audit
            SET status = ?, driver_status = ?, driver_message = ?
            WHERE id = ?
        `).run(accepted ? "ACCEPTED" : "FAILED", String(json.status || res.status), json.message ?? null, commandId);
        return NextResponse.json({ ...json, commandId, verification: accepted ? "pending" : "failed" }, { status: accepted ? 200 : 502 });
    } catch (e) {
        console.error("Error proxy /api/trackers/setpoint:", e);
        if (commandId !== null) {
            stateDb.prepare(`
                UPDATE tracker_command_audit
                SET status = 'FAILED', driver_status = 'network_error', driver_message = ?
                WHERE id = ?
            `).run(e instanceof Error ? e.message : String(e), commandId);
        }
        return NextResponse.json({ status: "error", message: "No se pudo contactar al driver (¿está corriendo?)", commandId }, { status: 502 });
    }
}
