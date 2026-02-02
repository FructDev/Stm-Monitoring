'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ZapOff, Activity } from 'lucide-react';

interface Props {
    offlineScbs: number; // Cajas que no comunican
    alertScbs: number;   // Cajas con fusibles rotos
    avgVoltage: number;  // Voltaje promedio del sistema (ej. 700V, 1000V)
}

export function MwLossCard({ offlineScbs, alertScbs, avgVoltage }: Props) {
    // LÓGICA DE CÁLCULO DE PÉRDIDA (Estimación Ingenieril)

    // 1. Estimamos la corriente promedio que DEBERÍA tener una caja sana ahora mismo.
    // Como no tenemos irradiancia, asumimos un valor conservador de carga promedio 
    // o podemos usar un valor fijo si sabemos que es hora pico (ej. 150A).
    // Para hacerlo dinámico, asumimos que una caja sana lleva unos 10A por string * 18 = 180A.
    const estimatedAmpsPerBox = 150; // Ajustable según el parque
    const estimatedAmpsPerString = estimatedAmpsPerBox / 18;

    // 2. Pérdida por Cajas Offline (Ciegos total)
    // Potencia (W) = V * A
    const lostWattsOffline = offlineScbs * (avgVoltage * estimatedAmpsPerBox);

    // 3. Pérdida por Alertas (Fusibles)
    // Asumimos promedio 2 strings fuera por alerta
    const lostWattsAlert = alertScbs * (avgVoltage * (estimatedAmpsPerString * 2));

    // 4. Total Megawatts (MW) = Watts / 1,000,000
    const totalLostMW = (lostWattsOffline + lostWattsAlert) / 1_000_000;

    const isGood = totalLostMW < 0.01;

    return (
        <Card className={`border-slate-800 ${isGood ? 'bg-slate-900' : 'bg-rose-950/10 border-rose-900/50'}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Pérdida de Generación</CardTitle>
                <ZapOff className={`h-4 w-4 ${isGood ? 'text-emerald-500' : 'text-rose-500'}`} />
            </CardHeader>
            <CardContent>
                <div className="flex items-baseline gap-2">
                    <div className={`text-2xl font-bold font-mono ${isGood ? 'text-white' : 'text-rose-400'}`}>
                        {totalLostMW.toFixed(3)} MW
                    </div>
                    {!isGood && <span className="text-xs text-rose-500 flex items-center">Impacto Instantáneo</span>}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                    Potencia no inyectada estimada por fallos.
                </p>
            </CardContent>
        </Card>
    );
}