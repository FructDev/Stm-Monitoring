import { ScbData } from "@/app/types";
import { getScbCapacity } from "@/app/lib/scb-config";

// Promedio de horas sol pico (Ajustable)
const HORAS_SOL_PICO = 5.5;

export interface ScbAnalysis {
    activeStrings: number;
    deadStrings: number;     // Strings < 0.5A (Fusibles)
    lowPerfStrings: number;  // Strings bajos

    actualPowerKW: number;   // Generación Real
    potentialPowerKW: number;// Generación Teórica (Si estuviera sana)
    lostPowerKW: number;     // Fuga de Potencia

    efficiency: number;      // % Eficiencia (0-100)
    dailyLostMWh: number;    // Proyección pérdida diaria

    assumedGoodStrings: number[]; // Strings que están en 0 pero asumimos buenos por fallo de tarjeta
    suspectedDeadCards: number[]; // IDs de tarjetas sospechosas (1 a 5)
    expiredReviewCards: number[]; // Tarjetas que expiró su revisión de 7 días
}

export function analyzeScb(scb: ScbData): ScbAnalysis {
    // 1. Protección contra NULOS (Vital para evitar crashes)
    const i_total = (scb.i_total ?? 0) / 100; // Fix: Scale by 100
    const vdc = scb.vdc ?? 0;

    // Determinar capacidad real de la caja (15 o 18)
    const capacity = getScbCapacity(scb.power_station, scb.inversor, scb.scb);

    const stringKeys = ["s01", "s02", "s03", "s04", "s05", "s06", "s07", "s08", "s09", "s10", "s11", "s12", "s13", "s14", "s15", "s16", "s17", "s18"] as (keyof ScbData)[];
    
    let validStringsCount = 0;
    let sumValidAmps = 0;
    const currents: number[] = [];

    for (let i = 0; i < capacity; i++) {
        const rawVal = scb[stringKeys[i]];
        // Ignoramos explícitamente nulos
        if (rawVal === null || rawVal === undefined) continue;
        
        const val = Number(rawVal) / 100;
        currents.push(val);
        
        // Promediamos usando los strings vivos (>0.5)
        if (val >= 0.5) {
            sumValidAmps += val;
            validStringsCount++;
        }
    }

    let idealStringAmps = 0;
    const stringStatus = new Array(capacity).fill('ok');

    // Si la caja no produce suficiente o no hay strings válidos, no juzgamos muertos para evitar falsos positivos
    if (validStringsCount > 0) {
        idealStringAmps = sumValidAmps / validStringsCount;
        
        // Umbrales relativos al promedio "sano"
        // Ej: Si el promedio sano es 8A, un fallo es < 1.6A
        const failureThreshold = idealStringAmps * 0.20; // 20% del promedio
        const lowPerfThreshold = idealStringAmps * 0.70; // 70% del promedio

        // Segunda pasada: Evaluar contra los umbrales
        currents.forEach((val, i) => {
            if (val < failureThreshold) {
                stringStatus[i] = 'dead';
            } else if (val < lowPerfThreshold) {
                stringStatus[i] = 'low';
            }
        });
    }

    // --- NUEVA LÓGICA: DETECCIÓN DE TARJETAS STM-SP ---
    const cardGroups = [
        [0, 1, 2, 3],     // Tarjeta 1
        [4, 5, 6, 7],     // Tarjeta 2
        [8, 9, 10, 11],   // Tarjeta 3
        [12, 13, 14, 15], // Tarjeta 4
        [16, 17]          // Tarjeta 5
    ];

    const assumedGoodStrings: number[] = [];
    const suspectedDeadCards: number[] = [];
    const expiredReviewCards: number[] = [];

    const nowMs = new Date().getTime();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    cardGroups.forEach((group, cardIdx) => {
        const cardId = cardIdx + 1;
        const validGroup = group.filter(i => i < capacity);
        if (validGroup.length === 0) return;

        const isCardDead = validGroup.every(i => stringStatus[i] === 'dead');

        if (isCardDead && validStringsCount > 0) {
            suspectedDeadCards.push(cardId);
            
            // Check review status
            const reviewTs = scb.manual_reviews?.[cardId];
            let isExpired = true;

            if (reviewTs) {
                const reviewTime = new Date(reviewTs).getTime();
                if (nowMs - reviewTime <= SEVEN_DAYS_MS) {
                    isExpired = false;
                }
            }

            if (isExpired) {
                expiredReviewCards.push(cardId);
            } else {
                // Not expired! Assumed Good.
                validGroup.forEach(i => {
                    stringStatus[i] = 'assumed_good';
                    assumedGoodStrings.push(i + 1); // 1-indexed string number
                });
            }
        }
    });

    let dead = 0;
    let low = 0;
    stringStatus.forEach(s => {
        if (s === 'dead') dead++;
        if (s === 'low') low++;
    });

    // 4. Cálculos de Potencia (P = V * I) / 1000 = kW
    const actualKW = (i_total * vdc) / 1000;

    // Potencia Potencial: Si los X strings dieran el amperaje ideal
    const potentialAmps = idealStringAmps * capacity; // Usamos la capacidad real
    const potentialKW = (potentialAmps * vdc) / 1000;

    // Pérdida (Mínimo 0)
    const lostKW = Math.max(0, potentialKW - actualKW);

    // Eficiencia
    const efficiency = potentialKW > 0 ? (actualKW / potentialKW) * 100 : 0;

    // Proyección Diaria (MWh) = kW * Horas / 1000
    const dailyLostMWh = (lostKW * HORAS_SOL_PICO) / 1000;

    return {
        activeStrings: capacity - dead - low - assumedGoodStrings.length,
        deadStrings: dead,
        lowPerfStrings: low,
        actualPowerKW: actualKW,
        potentialPowerKW: potentialKW,
        lostPowerKW: lostKW,
        efficiency: efficiency,
        dailyLostMWh: dailyLostMWh,
        assumedGoodStrings,
        suspectedDeadCards,
        expiredReviewCards
    };
}