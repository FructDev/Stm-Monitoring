export interface SoilingAlert {
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    details: string;
}

export function detectSoiling(history: any[], expectedPowerKw: number): SoilingAlert | null {
    if (!history || history.length === 0) return null;

    // Calculamos la potencia total generada hoy
    let totalGeneratedKw = 0;
    let validRows = 0;

    history.forEach(row => {
        if (row.power_kw_avg && row.power_kw_avg > 0) {
            totalGeneratedKw += row.power_kw_avg;
            validRows++;
        }
    });

    if (validRows < 10) return null;

    const avgPower = totalGeneratedKw / validRows;
    
    // Si la potencia media es consistentemente menor que la esperada en un margen del 10-20%
    // Asumiendo que el expectedPowerKw es proveído por el Gemelo Digital
    if (expectedPowerKw > 0 && avgPower > 0) {
        const ratio = avgPower / expectedPowerKw;
        if (ratio < 0.90 && ratio > 0.60) { // Pérdida entre 10% y 40%
            return {
                severity: ratio < 0.75 ? 'HIGH' : 'MEDIUM',
                details: `Bajo rendimiento general detectado (${((1 - ratio)*100).toFixed(1)}% pérdida). Sugerencia: Inspección de suciedad (Soiling).`
            };
        }
    }

    return null;
}
