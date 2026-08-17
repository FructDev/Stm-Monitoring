'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertOctagon, CheckCircle2, TrendingDown, Zap, Sun } from 'lucide-react';
import { ParkStats } from '@/app/types';
import { useScadaStream } from '@/app/hooks/useScadaStream';

interface Props {
    stats: ParkStats;
}

export function StatsOverview({ stats }: Props) {
    const { meteoData } = useScadaStream();

    // 1. Evitar división por cero
    const validOnlineScbs = stats.online_scbs > 0 ? stats.online_scbs : 1;

    // 2. Referencias
    const avgAmpsPerBox = stats.total_amps / validOnlineScbs;
    const avgVolts = stats.avg_voltage > 0 ? stats.avg_voltage : 0;
    const powerPerBoxWatts = avgAmpsPerBox * avgVolts;

    // 3. CÁLCULO DE PÉRDIDAS
    const lossOfflineWatts = stats.offline_scbs * powerPerBoxWatts;

    // 🔥 MEJORA: Pérdida basada en STRINGS reales
    // Asumimos que cada string es 1/18 de la potencia de la caja
    const wattsPerString = powerPerBoxWatts / 18;
    const lossStringsWatts = (stats.total_dead_strings || 0) * wattsPerString;

    // Total MW Perdidos
    const totalLossMW = (lossOfflineWatts + lossStringsWatts) / 1_000_000;

    // Salud
    const totalBoxes = stats.total_scbs || 1;
    // Penalizamos fuerte por Cajas Offline y leve por Strings muertos
    const healthScore = 100 - ((stats.offline_scbs / totalBoxes) * 100 + (stats.total_dead_strings / (totalBoxes * 18)) * 100);
    const finalHealth = Math.max(0, Math.min(100, healthScore));

    const isHighLoss = totalLossMW > 0.1;

    // 4. IRRADIANCIA Y POTENCIA ACTUAL
    const meteoStations = Object.values(meteoData);
    let totalIrradiance = 0;
    let meteoCount = 0;
    meteoStations.forEach(m => {
        // Usamos PYR002 (irradiancia en plano de módulo / POA): es la relevante para
        // generación y la que reporta el SCADA (siempre mayor que la horizontal PYR001).
        // Fallback a PYR001 si la estación no tiene sensor inclinado.
        const irr = (m && typeof m.PYR002 === 'number' && m.PYR002 > 0)
            ? m.PYR002
            : (m && typeof m.PYR001 === 'number' && m.PYR001 > 0 ? m.PYR001 : null);
        if (irr !== null) {
            totalIrradiance += irr;
            meteoCount++;
        }
    });
    const avgIrradiance = meteoCount > 0 ? totalIrradiance / meteoCount : 0;
    
    // Potencia total en MW = Amperios totales * Voltaje promedio del parque
    const currentPowerMW = (stats.total_amps * stats.avg_voltage) / 1_000_000;

    return (
        <div className="space-y-6 mb-8">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">

                {/* 1. PÉRDIDAS */}
                <Card className={`border ${isHighLoss ? 'bg-rose-950/20 border-rose-800' : 'bg-slate-900 border-slate-800'}`}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-bold text-slate-200">Pérdida Estimada</CardTitle>
                        <TrendingDown className={`h-4 w-4 ${isHighLoss ? 'text-rose-400' : 'text-emerald-500'}`} />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-baseline gap-2">
                            <div className={`text-2xl font-black font-mono ${isHighLoss ? 'text-rose-400' : 'text-emerald-400'}`}>
                                {totalLossMW.toFixed(3)} <span className="text-lg">MW</span>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 font-medium">
                            Pérdida aproximada por strings averiados y cajas offline.
                        </p>
                    </CardContent>
                </Card>

                {/* 2. DISPONIBILIDAD */}
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-bold text-slate-200">Disponibilidad</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-blue-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-white">
                            {((stats.online_scbs / totalBoxes) * 100).toFixed(1)}%
                        </div>
                        <p className="text-xs text-slate-400 mt-1 font-medium">
                            {stats.online_scbs} Online / <span className="text-rose-400">{stats.offline_scbs} Offline</span>
                        </p>
                    </CardContent>
                </Card>

                {/* 3. STRINGS DAÑADOS (La Nueva) */}
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-bold text-slate-200">Strings Dañados</CardTitle>
                        {/* Icono de Octágono (Parecido a un STOP) */}
                        <AlertOctagon className="h-4 w-4 text-orange-400" />
                    </CardHeader>
                    <CardContent>
                        {/* Usamos el nuevo dato de la API */}
                        <div className="text-2xl font-black text-white">{stats.total_dead_strings || 0}</div>
                        <p className="text-xs text-slate-400 mt-1 font-medium">
                            Cableado averiado o fusibles abiertos.
                        </p>
                    </CardContent>
                </Card>

                {/* 4. IRRADIANCIA Y POTENCIA */}
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-bold text-slate-200">Irradiancia y Potencia</CardTitle>
                        <Sun className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex justify-between items-baseline">
                            <div className="text-2xl font-black text-yellow-500 font-mono">
                                {avgIrradiance.toFixed(0)} <span className="text-sm text-slate-400 font-medium">W/m²</span>
                            </div>
                            <div className="text-xl font-bold text-emerald-400 font-mono">
                                {currentPowerMW.toFixed(2)} <span className="text-sm text-slate-400 font-medium">MW</span>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 font-medium flex justify-between">
                            <span>Promedio Global</span>
                            <span>Generación Actual</span>
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* BARRA DE SALUD */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
                <div className="flex justify-between items-end mb-2">
                    <div>
                        <h3 className="text-sm font-bold text-slate-200">Índice de Salud del Parque</h3>
                    </div>
                    <div className="text-right">
                        <span className={`text-2xl font-black ${finalHealth > 90 ? 'text-emerald-400' : finalHealth > 75 ? 'text-orange-400' : 'text-rose-400'}`}>
                            {finalHealth.toFixed(1)}%
                        </span>
                    </div>
                </div>
                <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                    <div
                        className={`h-full transition-all duration-1000 ${finalHealth > 90 ? 'bg-emerald-500' : finalHealth > 75 ? 'bg-orange-500' : 'bg-rose-600'}`}
                        style={{ width: `${finalHealth}%` }}
                    ></div>
                </div>
            </div>
        </div>
    );
}