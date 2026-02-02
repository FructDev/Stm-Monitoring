'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertOctagon, CheckCircle2, TrendingDown, Zap } from 'lucide-react';
import { ParkStats } from '@/app/types';

interface Props {
    stats: ParkStats;
}

export function StatsOverview({ stats }: Props) {
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

    return (
        <div className="space-y-6 mb-8">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">

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

                {/* 4. VOLTAJE */}
                <Card className="bg-slate-900 border-slate-800">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-bold text-slate-200">Tensión DC</CardTitle>
                        <Zap className="h-4 w-4 text-yellow-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-black text-white font-mono">{stats.avg_voltage.toFixed(0)} V</div>
                        <p className="text-xs text-slate-400 mt-1 font-medium">
                            Promedio de todo el parque.
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