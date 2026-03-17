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
}

export function analyzeScb(scb: ScbData): ScbAnalysis {
    // 1. Protección contra NULOS (Vital para evitar crashes)
    const i_total = (scb.i_total ?? 0) / 100; // Fix: Scale by 100
    const vdc = scb.vdc ?? 0;

    // Determinar capacidad real de la caja (15 o 18)
    const capacity = getScbCapacity(scb.power_station, scb.inversor, scb.scb);

    // Extraer strings de forma segura
    // Solo consideramos los strings hasta la capacidad definida
    let currents = [
        scb.s01, scb.s02, scb.s03, scb.s04, scb.s05, scb.s06,
        scb.s07, scb.s08, scb.s09, scb.s10, scb.s11, scb.s12,
        scb.s13, scb.s14, scb.s15, scb.s16, scb.s17, scb.s18
    ].map(val => (val ?? 0) / 100); // Si es null, lo convierte a 0 y divide por 100

    // Si es de 15 strings, cortamos el array
    if (capacity === 15) {
        currents = currents.slice(0, 15);
    }

    // 2. Determinar "Corriente Ideal" (Benchmark)
    // Usamos el promedio de los strings BUENOS de esta misma caja.
    const goodStrings = currents.filter(a => a > 1.0);

    // Si la caja está muerta o es de noche, retornamos todo en 0
    if (goodStrings.length === 0) {
        return {
            activeStrings: 0, deadStrings: 0, lowPerfStrings: 0,
            actualPowerKW: 0, potentialPowerKW: 0, lostPowerKW: 0,
            efficiency: 0, dailyLostMWh: 0
        };
    }

    const idealStringAmps = goodStrings.reduce((a, b) => a + b, 0) / goodStrings.length;

    // 3. Clasificar Strings
    let dead = 0;
    let low = 0;

    currents.forEach(val => {
        // Solo contamos como "muerto" si la caja tiene voltaje (está activa)
        if (val < 0.5) dead++;
        else if (val < idealStringAmps * 0.7) low++;
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
        activeStrings: capacity - dead - low,
        deadStrings: dead,
        lowPerfStrings: low,
        actualPowerKW: actualKW,
        potentialPowerKW: potentialKW,
        lostPowerKW: lostKW,
        efficiency: efficiency,
        dailyLostMWh: dailyLostMWh
    };
}