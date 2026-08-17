export interface ThermalAlert {
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    details: string;
}

export function detectThermalFatigue(history: any[]): ThermalAlert | null {
    if (!history || history.length === 0) return null;

    let stressCount = 0;
    
    // Contamos cuántas mediciones sobrepasan los 65°C mientras la corriente es alta (>8A por string aprox, o total > 100A)
    history.forEach(row => {
        if (row.temp_avg > 65 && row.i_total_avg > 100) {
            stressCount++;
        }
    });

    // Si hubo más de 12 lecturas (1 hora si es cada 5 mins) en estrés térmico crítico
    if (stressCount > 12) {
        return {
            severity: stressCount > 24 ? 'HIGH' : 'MEDIUM',
            details: `Estrés térmico elevado detectado (${(stressCount * 5 / 60).toFixed(1)} hrs a >65°C con alta carga). Riesgo de fatiga en fusibles.`
        };
    }

    return null;
}
