import { ScbData } from "@/app/types";
import { getScbCapacity } from "@/app/lib/scb-config";

// Promedio de horas sol pico (Ajustable)
const HORAS_SOL_PICO = 5.5;

// Umbral de confianza para el diagnóstico RELATIVO de strings (Amperios medios por string sano).
// Por debajo de este valor la caja está en penumbra (amanecer/atardecer/nublado) o bajo
// curtailment fuerte: el diagnóstico relativo (bajo rendimiento) no es confiable, para evitar
// falsos positivos. OJO: esto NO frena la detección de ceros absolutos (ver regla dura abajo).
// Ajustable durante la calibración del parque.
const MIN_CONFIDENCE_AMPS = 2.0;

// --- REGLA DURA DE STRING CAÍDO (independiente de la luz) ---
// Un string en ~0 mientras la caja está claramente produciendo es un string CAÍDO, punto:
// sus hermanos con corriente prueban que hay sol y que la caja/tarjeta de lectura funcionan,
// así que su 0 no es penumbra ni falla de comunicación. No depende del gating de confianza.
const HARD_DEAD_FLOOR_AMPS = 0.3;      // por debajo = sin salida (caído); el sombreado de amanecer da 0.3-1A, no 0
const CLEAR_PRODUCTION_AMPS = 1.0;     // corriente que evidencia generación real (más que el brillo pre-alba)
const MIN_PRODUCING_STRINGS = 2;       // nº de strings así para considerar que la caja "está produciendo"

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
    confirmedDeadCards: number[]; // Tarjetas confirmadas como fallo de medición (persistentes)
    expiredReviewCards: number[]; // Tarjetas que expiró su revisión de 7 días
    reconstructedCurrentAmps: number; // Corriente estimada de canales sin medición
    effectiveCurrentAmps: number; // Corriente medida + reconstruida
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

        // REGLA DURA (siempre, sin importar la luz): si la caja está claramente produciendo
        // (varios strings con corriente real), cualquier string en ~0 es un CAÍDO. Esto NO puede
        // ser falso positivo por penumbra: hay strings hermanos generando. Corrige el hueco por el
        // cual un cero evidente quedaba oculto en mañana/tarde/nublado (falsa sensación de "todo bien").
        const producingStrings = currents.filter(v => v >= CLEAR_PRODUCTION_AMPS).length;
        const boxIsProducing = producingStrings >= MIN_PRODUCING_STRINGS;
        if (boxIsProducing) {
            currents.forEach((val, i) => {
                if (val < HARD_DEAD_FLOOR_AMPS) stringStatus[i] = 'dead';
            });
        }

        // Gating de confianza para el diagnóstico RELATIVO (bajo rendimiento / degradación parcial):
        // solo si la caja produce por encima de un mínimo. En penumbra un string un poco bajo podría
        // caer bajo el umbral relativo y ser falso positivo — por eso esta parte sí se protege.
        if (idealStringAmps >= MIN_CONFIDENCE_AMPS) {
            // Umbrales relativos al promedio "sano"
            // Ej: Si el promedio sano es 8A, un fallo es < 1.6A
            const failureThreshold = idealStringAmps * 0.20; // 20% del promedio
            const lowPerfThreshold = idealStringAmps * 0.70; // 70% del promedio

            // Segunda pasada: Evaluar contra los umbrales (sin pisar lo ya marcado como caído)
            currents.forEach((val, i) => {
                if (stringStatus[i] === 'dead') return; // ya lo marcó la regla dura
                if (val < failureThreshold) {
                    stringStatus[i] = 'dead';
                } else if (val < lowPerfThreshold) {
                    stringStatus[i] = 'low';
                }
            });
        }
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
    const confirmedDeadCards: number[] = [];
    const expiredReviewCards: number[] = [];

    cardGroups.forEach((group, cardIdx) => {
        const cardId = cardIdx + 1;
        const validGroup = group.filter(i => i < capacity);
        if (validGroup.length === 0) return;

        const isCardDead = validGroup.every(i => stringStatus[i] === 'dead');
        const reviewTs = scb.manual_reviews?.[cardId];

        // Una confirmación es persistente hasta normalización. Solo reconstruimos los
        // canales que continúan sin medición; si la tarjeta vuelve a reportar, no duplicamos corriente.
        if (reviewTs) {
            confirmedDeadCards.push(cardId);
            validGroup.forEach(i => {
                if (stringStatus[i] === 'dead') {
                    stringStatus[i] = 'assumed_good';
                    assumedGoodStrings.push(i + 1); // 1-indexed string number
                }
            });
        }

        if (isCardDead && validStringsCount > 0) {
            suspectedDeadCards.push(cardId);
        }
    });

    let dead = 0;
    let low = 0;
    stringStatus.forEach(s => {
        if (s === 'dead') dead++;
        if (s === 'low') low++;
    });

    // 4. Cálculos de Potencia (P = V * I) / 1000 = kW
    // Los canales de una tarjeta confirmada siguen produciendo aunque reporten cero.
    // Reconstruimos su corriente con el promedio de los canales sanos de la misma SCB.
    const reconstructedCurrentAmps = assumedGoodStrings.length * idealStringAmps;
    const effectiveCurrentAmps = i_total + reconstructedCurrentAmps;
    const actualKW = (effectiveCurrentAmps * vdc) / 1000;

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
        activeStrings: capacity - dead - low,
        deadStrings: dead,
        lowPerfStrings: low,
        actualPowerKW: actualKW,
        potentialPowerKW: potentialKW,
        lostPowerKW: lostKW,
        efficiency: efficiency,
        dailyLostMWh: dailyLostMWh,
        assumedGoodStrings,
        suspectedDeadCards,
        confirmedDeadCards,
        expiredReviewCards,
        reconstructedCurrentAmps,
        effectiveCurrentAmps
    };
}
