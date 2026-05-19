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

    let dead = 0;
    let low = 0;
    let idealStringAmps = 0;

    // Si la caja no produce suficiente (ej < 5A global) o no hay strings válidos, no juzgamos muertos para evitar falsos positivos
    if (i_total > 5 && validStringsCount > 0) {
        idealStringAmps = sumValidAmps / validStringsCount;
        const failureThreshold = idealStringAmps * 0.20; // < 20% = Fusible abierto
        const lowPerfThreshold = idealStringAmps * 0.70; // < 70% = Degradación/Sombra

        currents.forEach(val => {
            if (val < failureThreshold) dead++;
            else if (val < lowPerfThreshold) low++;
        });
    }

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