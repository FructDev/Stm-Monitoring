'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PsSummary } from '@/app/types';
import { cn } from '@/app/lib/utils';
import { useScadaStream } from '@/app/hooks/useScadaStream';
import { useHealthThreshold } from '@/app/hooks/useHealthThreshold';
import { useCurtailment } from '@/app/hooks/useCurtailment';
import { Sun, ZapOff } from 'lucide-react';

export function PsGrid({ stations }: { stations: PsSummary[] }) {
    const { data: scadaData, meteoData } = useScadaStream();
    const { threshold } = useHealthThreshold();
    const { isManualCurtailment } = useCurtailment();
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {stations.map((ps) => {
                // --- Analítica Avanzada ---
                const psNumber = ps.name.replace('PS', '');
                const regionalMeteo = meteoData[`METEO_${psNumber}`];
                const irradiance = regionalMeteo?.PYR002 ?? 0;

                // Compute damaged strings
                // Un string se asume dañado térmicamente si su SCB reporta un health_score_pct < threshold y NO está en curtailment
                const psScbs = Object.values(scadaData).filter(scb => scb.power_station === ps.name);
                
                let damagedStringsCount = 0;
                
                // Si la irradiancia local es muy baja (entre 0.1 y 100 W/m²), los inversores pueden apagarse naturalmente o dar 0A.
                // Si es estrictamente 0, asumimos que no hay sensor y evaluamos normal.
                const isIrradianceTooLow = irradiance > 0 && irradiance < 100;

                psScbs.forEach(scb => {
                    const effectivelySilenced = scb.alarm_silenced || isManualCurtailment || isIrradianceTooLow;
                    // Solo contamos fallas si el SCB completo está debajo del umbral vital Y no hay Curtailment
                    if (!effectivelySilenced && scb.health_score_pct !== undefined && scb.health_score_pct < threshold) {
                         // Contamos físicamente qué strings están en 0A (o muy cerca del 0, ej < 0.5A que es 50 en la data cruda)
                         if (scb.currents && Array.isArray(scb.currents)) {
                             damagedStringsCount += scb.currents.filter(ampsRaw => ampsRaw < 50).length;
                         }
                    }
                });

                // Color dinámico base
                let statusColor = "border-slate-800 bg-slate-900";
                if (ps.status === 'critical') {
                    statusColor = "border-rose-900/50 bg-rose-950/10";
                } else if (ps.status === 'warning' || damagedStringsCount > 0) {
                    // Elevated warning if there's physical damage
                    statusColor = "border-orange-900/50 bg-orange-950/20";
                }

                return (
                    <Link href={`/ps/${ps.name}`} key={ps.name} className="block group">
                        <Card className={cn(
                            "transition-all duration-200 hover:border-slate-600 hover:shadow-lg h-full",
                            statusColor
                        )}>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-lg font-bold text-slate-200 group-hover:text-white">
                                    {ps.name}
                                </CardTitle>
                                {/* Badge de Estado */}
                                <StatusBadge status={ps.status} damagedStringsCount={damagedStringsCount} />
                            </CardHeader>

                            <CardContent>
                                <div className="mt-2 space-y-1.5">
                                    <div className="flex justify-between items-center bg-slate-950/50 p-1 rounded font-medium">
                                        <div className="flex items-center gap-1.5"><Sun className="h-3.5 w-3.5 text-amber-500"/> <span className="text-xs text-slate-400">Irradiancia Local:</span></div>
                                        <span className={`font-mono text-[11px] ${irradiance > 200 ? 'text-amber-400' : 'text-slate-500'}`}>
                                            {irradiance.toFixed(1)} W/m²
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center bg-slate-950/50 p-1 rounded font-medium">
                                        <div className="flex items-center gap-1.5"><ZapOff className={`h-3.5 w-3.5 ${damagedStringsCount > 0 ? 'text-rose-500' : 'text-slate-600'}`}/> <span className="text-xs tracking-tight text-slate-400">Strings Dañados:</span></div>
                                        <span className={`font-mono text-[11px] font-bold ${damagedStringsCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                            {damagedStringsCount}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs px-1 mt-2 font-medium">
                                        <span className="text-slate-400">Corriente Generada:</span>
                                        <span className="font-mono font-bold text-emerald-400">{ps.total_amps.toFixed(1)} A</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                );
            })}
        </div>
    );
}

function StatusBadge({ status, damagedStringsCount }: { status: PsSummary['status'], damagedStringsCount: number }) {
    if (status === 'critical') {
        return <Badge variant="destructive" className="animate-pulse">OFFLINE</Badge>;
    }
    if (status === 'warning' || damagedStringsCount > 0) {
        return <Badge className="bg-orange-500 hover:bg-orange-600 animate-pulse">ALERTA</Badge>;
    }
    return <Badge className="bg-emerald-600 hover:bg-emerald-700">OK</Badge>;
}