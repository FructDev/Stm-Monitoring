import { NextResponse } from 'next/server';
import db from '@/app/lib/db';
import stateDb from '@/app/lib/stateDb';
import { ActiveAlarm, AlarmSummary } from '@/app/types/alarms';
import { analyzeScb } from '@/app/lib/analytics';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // 1. Fetch Live Readings instead of empty alarm_state
        // We synthesize alarms from the live data since the backend isn't populating alarm_state
        const rawReadings = db.prepare(`
            SELECT * FROM lecturas_live 
            WHERE power_station LIKE 'PS%' AND NOT (power_station = 'PS1' AND inversor = 1 AND scb > 18)
        `).all() as any[];

        const now = new Date().getTime();
        // Tolerancia alta: el deadband del driver hace que una SCB estable conserve un ts viejo aunque
        // comunique. Evita falsas alarmas críticas de "sin comunicación". La caída real la marca el driver.
        const UMBRAL_SEGUNDOS = 90000;

        // Construir mapa de lecturas con mapeo lógico de SCBs
        const lookup = new Map();
        
        // Fetch manual reviews map
        const reviewsMap: any = {};
        const reviewRows = stateDb.prepare("SELECT * FROM scb_manual_reviews").all();
        reviewRows.forEach((r: any) => {
            if (!reviewsMap[r.power_station]) reviewsMap[r.power_station] = {};
            if (!reviewsMap[r.power_station][r.inversor]) reviewsMap[r.power_station][r.inversor] = {};
            if (!reviewsMap[r.power_station][r.inversor][r.scb]) reviewsMap[r.power_station][r.inversor][r.scb] = {};
            reviewsMap[r.power_station][r.inversor][r.scb][r.card_id] = r.last_review_ts;
        });

        rawReadings.forEach((r) => {
            let inv = r.inversor;
            let s = r.scb;
            if (inv === 1 && s > 18) {
                inv = 2;
                s -= 18;
            }
            const key = `${r.power_station}-${inv}-${s}`;
            
            const existing = lookup.get(key);
            const rowTime = new Date(r.ts).getTime();
            if (!existing || rowTime > new Date(existing.ts).getTime()) {
                lookup.set(key, r);
            }
        });

        // Garantizar las 504 cajas y aplicar lógica zombie
        const readings: any[] = [];
        for (let p = 1; p <= 14; p++) {
            const psName = `PS${p}`;
            for (let inv = 1; inv <= 2; inv++) {
                for (let s = 1; s <= 18; s++) {
                    const key = `${psName}-${inv}-${s}`;
                    let r = lookup.get(key);

                    if (!r) {
                        // Inyectar caja perdida
                        r = {
                            power_station: psName,
                            inversor: inv,
                            scb: s,
                            estado: 'OFFLINE',
                            ts: new Date().toISOString(),
                            i_total: 0
                        };
                    } else {
                        // Chequeo Zombie
                        const rowTime = new Date(r.ts).getTime();
                        if ((now - rowTime) / 1000 > UMBRAL_SEGUNDOS) {
                            r.estado = 'OFFLINE';
                            r.i_total = 0;
                        }
                    }
                    // Forzar inversor y scb lógicos para las alarmas
                    r.inversor = inv;
                    r.scb = s;
                    readings.push(r);
                }
            }
        }

        // Calculamos la corriente total del parque para saber si es de noche
        const totalParkAmps = readings.reduce((acc, r) => acc + ((r.i_total ?? 0) / 100), 0);
        const isNightTime = totalParkAmps < 50; // Si todo el parque da menos de 50A, es de noche/muy oscuro

        const alarms: ActiveAlarm[] = [];

        readings.forEach(r => {
            // 1. ALARMAS DE ESTADO (Provenientes del backend Python o Inyectadas)
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
                r.manual_reviews = reviewsMap[r.power_station]?.[r.inversor]?.[r.scb];
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

                if (analysis.expiredReviewCards && analysis.expiredReviewCards.length > 0) {
                    alarms.push({
                        power_station: r.power_station,
                        inversor: r.inversor,
                        scb: r.scb,
                        alarm_code: 'REVISION_VENCIDA',
                        details: '',
                        active: 1,
                        severity: 3, // Critical
                        message: `Revisión manual caducada en tarjeta STM-SP ${analysis.expiredReviewCards.join(', ')}`,
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

        // 1.5 Marcar alarmas reconocidas ("Reconocer"): silencio de 8 horas por
        // combinación exacta (planta, inversor, scb, alarm_code). Si la caja cambia de
        // problema, el alarm_code cambia y la alarma vuelve a contar como no reconocida.
        const ACK_WINDOW_MS = 8 * 60 * 60 * 1000;
        const ackRows = stateDb.prepare(
            "SELECT power_station, inversor, scb, alarm_code, ack_ts FROM alarm_acks"
        ).all() as any[];
        const ackSet = new Set<string>();
        ackRows.forEach((r) => {
            if (now - new Date(r.ack_ts).getTime() < ACK_WINDOW_MS) {
                ackSet.add(`${r.power_station}-${r.inversor}-${r.scb}-${r.alarm_code}`);
            }
        });
        alarms.forEach((a) => {
            a.ack = ackSet.has(`${a.power_station}-${a.inversor}-${a.scb}-${a.alarm_code}`) ? 1 : 0;
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
