import { NextResponse } from "next/server";
import db from "@/app/lib/db";
import stateDb from "@/app/lib/stateDb";
import { TRACKER_TOPOLOGY, decodeAlarms, TRACKER_STALE_MS } from "@/app/lib/tracker-config";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        let rows: any[] = [];
        try {
            rows = db.prepare(
                "SELECT gateway, tracker_idx, setpoint, position, manual_sp, mode, alarm_raw, ts FROM tracker_readings"
            ).all() as any[];
        } catch {
            rows = []; // la tabla aún no existe (el driver no ha corrido todavía)
        }

        // Los registros vienen en centésimas de grado (×100). Convertimos a grados enteros.
        const toDeg = (v: any) => (typeof v === "number" ? Math.round(v / 100) : null);

        const now = Date.now();
        const byGw = new Map<string, any[]>();
        rows.forEach((r) => {
            if (!byGw.has(r.gateway)) byGw.set(r.gateway, []);
            byGw.get(r.gateway)!.push(r);
        });

        const trackers: any[] = [];
        for (const t of TRACKER_TOPOLOGY) {
            let globalCounter = 0;
            for (const plc of t.plcs) {
                const gwRows = (byGw.get(plc.gateway) || []).sort((a, b) => a.tracker_idx - b.tracker_idx);
                // Conteo: si se conoce, exacto; si no, máximo del controlador (6) para que el PLC
                // aparezca aunque aún no haya datos. El conteo exacto se afina con el reg 26 / en campo.
                const count = plc.count ?? Math.max(gwRows.length, 6);
                for (let local = 1; local <= count; local++) {
                    globalCounter++;
                    const row = gwRows.find((r) => r.tracker_idx === local);
                    const ts = row?.ts ?? null;
                    const stale = !row || now - new Date(ts).getTime() > TRACKER_STALE_MS;
                    const alarmRaw = row?.alarm_raw ?? 0;
                    const alarmFlags = decodeAlarms(alarmRaw);
                    // "Fuera de setpoint" (bit 0) es NORMAL mientras el tracker se reposiciona (no es error).
                    // Error real = encoder dañado / bloqueo de motor / motor encendido demasiado.
                    const realFault = alarmFlags.encoder_error || alarmFlags.motor_lockout || alarmFlags.motor_on_too_long;
                    trackers.push({
                        id: `${plc.gateway}-${local}`,
                        ps: t.ps,
                        gateway: plc.gateway,
                        localIdx: local,
                        globalNum: globalCounter,
                        setpoint: toDeg(row?.setpoint),
                        position: toDeg(row?.position),
                        manual_sp: toDeg(row?.manual_sp),
                        mode: row?.mode ?? null, // 0=Auto, 1=Manual
                        alarm_raw: alarmRaw,
                        alarms: alarmFlags,
                        has_alarm: realFault,
                        ts,
                        stale,
                        online: !!row && !stale,
                        bypass: false,
                        bypassMaster: null as number | null,
                        bypassMasterId: null as string | null,
                    });
                }
            }
        }
        // Bypass: leído de la base de estado (gestionable desde la UI).
        let bypassMap: Record<string, string> = {};
        try {
            const bpRows = stateDb.prepare("SELECT slave_key, master_key FROM tracker_bypass").all() as any[];
            bpRows.forEach((r) => { bypassMap[r.slave_key] = r.master_key; });
        } catch { bypassMap = {}; }

        // Cada tracker en paralelo toma la posición de su maestro y se le relaja la alarma.
        const byKey = new Map<string, any>();
        trackers.forEach((t) => byKey.set(`${t.ps}-${t.globalNum}`, t));
        trackers.forEach((t) => {
            const masterKey = bypassMap[`${t.ps}-${t.globalNum}`];
            if (!masterKey) return;
            const master = byKey.get(masterKey);
            t.bypass = true;
            t.bypassMaster = master ? master.globalNum : null;
            t.bypassMasterId = master ? master.id : null;
            if (master) {
                // El encoder del esclavo está dañado: su posición real es la del maestro (van en paralelo).
                t.position = master.position;
                t.setpoint = master.setpoint;
                t.stale = master.stale;
                t.online = master.online;
            }
            t.has_alarm = false; // condición conocida, no se despacha
            t.alarms = { ...t.alarms, encoder_error: false };
        });

        return NextResponse.json({ trackers });
    } catch (e) {
        console.error("Error /api/trackers:", e);
        return NextResponse.json({ error: "Failed to fetch trackers" }, { status: 500 });
    }
}
