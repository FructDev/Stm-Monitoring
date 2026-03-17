import { NextResponse } from 'next/server';
import db from '@/app/lib/db';
import { ActiveAlarm, AlarmSummary } from '@/app/types/alarms';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Fetch Live Readings instead of empty alarm_state
        // We synthesize alarms from the live data since the backend isn't populating alarm_state
        const readings = db.prepare(`
            SELECT * FROM lecturas_live 
            WHERE estado != 'OK' OR estado IS NULL
            ORDER BY power_station, inversor, scb
        `).all() as any[];

        const alarms: ActiveAlarm[] = readings.map(r => {
            let severity = 1;
            let code = 'UNKNOWN';
            let message = r.estado || 'Error Desconocido';

            // Logic to map state to severity/code
            if (r.estado === 'OFFLINE' || r.estado === 'READ_FAIL' || r.estado === 'FAIL') {
                severity = 3; // Critical
                code = r.estado === 'FAIL' ? 'READ_FAIL' : r.estado;
                message = r.estado === 'OFFLINE' ? 'Sin comunicación con el dispositivo' : 'Fallo de lectura Modbus';
            } else if (r.estado?.includes('FUSIBLE')) {
                severity = 2; // Warning
                code = 'FUSIBLE';
                message = 'Posible fusible abierto o string dañado';
            } else if (r.estado === 'BAJA_TENSION') {
                severity = 2;
                code = 'BAJA_TENSION';
                message = 'Voltaje DC bajo detectado';
            } else {
                severity = 1;
                code = 'ALERTA';
            }

            return {
                // id: removed to match ActiveAlarm interface
                power_station: r.power_station,
                inversor: r.inversor,
                scb: r.scb,
                alarm_code: code,
                details: '',
                active: 1,
                severity: severity,
                message: message,
                start_ts: r.ts,
                last_seen_ts: r.ts,
                first_seen_ts: r.ts, // Fix: Added missing property
                acknowledged: 0,
                ack: 0, // Fix: Added missing property
                modbus_id: r.modbus_id || 0 // Fix: Added missing property
            };
        });

        // 2. Aggregate counts
        const summary: AlarmSummary = {
            critical: 0,
            warning: 0,
            info: 0,
            total: alarms.length
        };

        alarms.forEach(a => {
            if (a.severity >= 3) summary.critical++;
            else if (a.severity === 2) summary.warning++;
            else summary.info++;
        });

        return NextResponse.json({
            summary,
            alarms
        });

    } catch (error) {
        console.error("Error fetching active alarms:", error);
        return NextResponse.json({ error: "Failed to fetch alarms" }, { status: 500 });
    }
}
