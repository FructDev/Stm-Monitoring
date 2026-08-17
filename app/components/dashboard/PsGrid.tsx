'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PsSummary, InverterSummary } from '@/app/types';
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

                // Utilizamos el cálculo estadístico purificado que viene directamente del servidor
                const damagedStringsCount = ps.dead_strings || 0;

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

                                    {/* Inversores: encendido (inferido por corriente) + potencia */}
                                    {ps.inverters && ps.inverters.length > 0 && (
                                        <div className="grid grid-cols-2 gap-1.5 mt-2">
                                            {ps.inverters.map((iv) => (
                                                <InverterBox key={iv.inv} iv={iv} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                );
            })}
        </div>
    );
}

function InverterBox({ iv }: { iv: InverterSummary }) {
    // Color e indicador según estado inferido por corriente/potencia.
    const cfg = {
        ACTIVE:       { dot: 'bg-emerald-500', label: 'Encendido', box: 'border-emerald-800/60 bg-emerald-950/20', pwr: 'text-emerald-400' },
        WARN_VOLTAGE: { dot: 'bg-yellow-500',  label: 'Aviso V',   box: 'border-yellow-800/50 bg-yellow-950/10',  pwr: 'text-yellow-400' },
        OFFLINE:      { dot: 'bg-rose-600',     label: 'Sin com.',  box: 'border-rose-900/40 bg-rose-950/10',      pwr: 'text-slate-500' },
        IDLE:         { dot: 'bg-slate-600',    label: 'En espera', box: 'border-slate-800 bg-slate-950/50',       pwr: 'text-slate-500' },
    }[iv.state];

    return (
        <div className={`rounded-md p-1.5 border ${cfg.box}`}>
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-300">Inv {iv.inv}</span>
                <span className="flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${cfg.dot} ${iv.on ? 'animate-pulse' : ''}`}></span>
                    <span className="text-[9px] text-slate-400">{cfg.label}</span>
                </span>
            </div>
            <div className={`font-mono font-bold text-sm mt-0.5 ${cfg.pwr}`}>
                {iv.power_mw.toFixed(2)} <span className="text-[9px] text-slate-500 font-normal">MW</span>
            </div>
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