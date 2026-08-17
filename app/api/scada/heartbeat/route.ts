import { NextResponse } from "next/server";
import db from "@/app/lib/db";

export const dynamic = "force-dynamic";

interface DriverHeartbeatRow {
    started_at: string;
    last_seen_ts: string;
    process_id: number;
    version: string;
}

interface GatewayHeartbeatRow {
    gateway_id: string;
    last_attempt_ts: string;
    last_good_ts: string | null;
    last_quality: string;
    last_reason: string | null;
    last_latency_ms: number | null;
    last_mid: number | null;
    last_block_id: string | null;
}

function ageSeconds(ts: string | null): number | null {
    if (!ts) return null;
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? Math.max(0, (Date.now() - parsed) / 1000) : null;
}

export async function GET() {
    try {
        const tables = db.prepare(`
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name IN ('driver_heartbeat', 'gateway_heartbeat')
        `).all() as { name: string }[];
        const names = new Set(tables.map((row) => row.name));

        if (!names.has("driver_heartbeat") || !names.has("gateway_heartbeat")) {
            return NextResponse.json({
                status: "waiting",
                shadowMode: true,
                message: "El driver con heartbeat todavía no ha inicializado las tablas.",
                driver: null,
                gateways: [],
            });
        }

        const driver = db.prepare(`
            SELECT started_at, last_seen_ts, process_id, version
            FROM driver_heartbeat WHERE id = 1
        `).get() as DriverHeartbeatRow | undefined;
        const gateways = db.prepare(`
            SELECT gateway_id, last_attempt_ts, last_good_ts, last_quality, last_reason,
                   last_latency_ms, last_mid, last_block_id
            FROM gateway_heartbeat
            ORDER BY gateway_id
        `).all() as GatewayHeartbeatRow[];

        const driverAgeSeconds = driver ? ageSeconds(driver.last_seen_ts) : null;
        const driverAlive = driverAgeSeconds !== null && driverAgeSeconds <= 15;
        const enriched = gateways.map((gateway) => ({
            ...gateway,
            attemptAgeSeconds: ageSeconds(gateway.last_attempt_ts),
            goodAgeSeconds: ageSeconds(gateway.last_good_ts),
        }));

        return NextResponse.json({
            status: driverAlive ? "observing" : "stale",
            shadowMode: true,
            message: driverAlive
                ? "Heartbeat activo en observación; todavía no reemplaza los estados del dashboard."
                : "El heartbeat no es reciente; los valores analógicos podrían ser obsoletos.",
            driver: driver ? { ...driver, ageSeconds: driverAgeSeconds, alive: driverAlive } : null,
            summary: {
                gatewaysObserved: gateways.length,
                lastQualityGood: gateways.filter((gateway) => gateway.last_quality === "Good").length,
                lastQualityNotGood: gateways.filter((gateway) => gateway.last_quality !== "Good").length,
            },
            gateways: enriched,
        });
    } catch (error) {
        console.error("Error leyendo heartbeat SCADA:", error);
        return NextResponse.json({
            status: "error",
            shadowMode: true,
            message: "No se pudo leer el heartbeat del driver.",
            driver: null,
            gateways: [],
        }, { status: 500 });
    }
}
