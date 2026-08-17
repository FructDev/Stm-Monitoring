export interface ShadingAlert {
    string_id: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    details: string;
}

export function detectShading(history: any[]): ShadingAlert[] {
    const alerts: ShadingAlert[] = [];
    if (!history || history.length === 0) return alerts;

    const stringSums = new Array(18).fill(0);
    let validRows = 0;

    history.forEach(row => {
        if (row.currents && row.currents.length === 18 && row.i_total_avg > 5) {
            row.currents.forEach((curr: number, i: number) => {
                stringSums[i] += curr;
            });
            validRows++;
        }
    });

    if (validRows < 10) return alerts;

    const stringAverages = stringSums.map(sum => sum / validRows);
    const validAverages = stringAverages.filter(v => v > 0);
    if (validAverages.length === 0) return alerts;

    const globalAvg = validAverages.reduce((a, b) => a + b, 0) / validAverages.length;

    stringAverages.forEach((avg, index) => {
        if (avg > 0.5 && avg < globalAvg * 0.7) { 
            alerts.push({
                string_id: index + 1,
                severity: avg < globalAvg * 0.5 ? 'HIGH' : 'MEDIUM',
                details: `Pérdida del ${((1 - avg/globalAvg)*100).toFixed(1)}% respecto a vecinos. Posible maleza u obstáculo físico.`
            });
        }
    });

    return alerts;
}
