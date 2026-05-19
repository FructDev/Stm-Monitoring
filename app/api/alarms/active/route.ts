import { NextResponse } from 'next/server';
import db from '@/app/lib/db';
import { ActiveAlarm, AlarmSummary } from '@/app/types/alarms';
import { analyzeScb } from '@/app/lib/analytics';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Fetch Live Readings instead of empty alarm_state
        // We synthesize alarms from the live data since the backend isn't populating alarm_state
        const readings = db.prepare(`
            SELECT * FROM lecturas_live 
            WHERE power_station LIKE 'PS%' AND NOT (power_station = 'PS1' AND inversor = 1 AND scb > 18)
            ORDER BY power_station, inversor, scb
        `).all() as any[];

        // Calculamos la corriente total del parque para saber si es de noche
        const totalParkAmps = readings.reduce((acc, r) => acc + ((r.i_total ?? 0) / 100), 0);
        const isNightTime = totalParkAmps < 50; // Si todo el parque da menos de 50A, es de noche/muy oscuro

        const alarms: ActiveAlarm[] = [];

        readings.forEach(r => {
            // 1. ALARMAS DE ESTADO (Provenientes del backend Python)
            if (r.estado !== 'OK' && r.estado !== 'ONLINE' && r.estado !== null) {
                // Supresión inteligente
                if (!(r.estado === 'BAJA_TENSION' && isNightTime)) {
                    let severity = 1;
                    let code = r.estado; // Usamos el código real del backend
                    let message = r.estado;

                    if (r.estado === 'OFFLINE' || r.estado === 'READ_FAIL' || r.estado === 'FAIL') {
                        severity = 3;
                        code = r.estado === 'FAIL' ? 'READ_FAIL' : r.estado;
                        message = r.estado === 'OFFLINE' ? 'Sin comunicación con el dispositivo' : 'Fallo de lectura Modbus';
                    } else if (r.estado.includes('FUSIBLE')) {
                        severity = 2;
                        code = 'FUSIBLE';
                        message = 'Posible fusible abierto o string dañado';
                    } else if (r.estado === 'BAJA_TENSION') {
                        severity = 2;
                        code = 'BAJA_TENSION';
                        message = 'Voltaje DC bajo detectado';
                    } else {
                        severity = 1; // Para cualquier otra alarma desconocida que mande el backend
                    }

                    alarms.push({
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
                        first_seen_ts: r.ts,
                        acknowledged: 0,
                        ack: 0,
                        modbus_id: r.modbus_id || 0
                    });
                }
            }

            // 2. ALARMAS SINTÉTICAS (Cálculo Analítico de Strings)
            // Evaluamos strings solo si la caja SÍ está comunicando (no offline/fail)
            if (r.estado !== 'OFFLINE' && r.estado !== 'READ_FAIL' && r.estado !== 'FAIL') {
                const analysis = analyzeScb(r);
                if (analysis.deadStrings > 0) {
                    alarms.push({
                        power_station: r.power_station,
                        inversor: r.inversor,
                        scb: r.scb,
                        alarm_code: 'ALERTA_STRINGS',
                        details: '',
                        active: 1,
                        severity: 2, // Warning
                        message: `Múltiples Strings sin corriente (${analysis.deadStrings} detectados)`,
                        start_ts: r.ts,
                        last_seen_ts: r.ts,
                        first_seen_ts: r.ts,
                        acknowledged: 0,
                        ack: 0,
                        modbus_id: r.modbus_id || 0
                    });
                }
            }
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
