'use client';

import { useQuery } from "@tanstack/react-query";
import { ScadaMetrics } from "@/app/types/scada";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Server, Wifi, WifiOff } from "lucide-react";

async function fetchMetrics(): Promise<ScadaMetrics> {
    const res = await fetch('/api/scada/metrics');
    if (!res.ok) throw new Error('Failed to fetch metrics');
    return res.json();
}

export function HealthKPIs() {
    const { data, isLoading } = useQuery({
        queryKey: ['scada-metrics'],
        queryFn: fetchMetrics,
        refetchInterval: 5000
    });

    if (isLoading || !data) {
        return <div className="animate-pulse bg-slate-900 h-24 rounded-lg w-full"></div>;
    }

    const { quality_counts, total_devices } = data;
    const onlineRate = ((quality_counts.good / total_devices) * 100).toFixed(1);

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="bg-slate-900 border-slate-800">
                <CardContent className="p-4 flex items-center justify-between">
                    <div>
                        <p className="text-slate-500 text-xs uppercase tracking-wider font-bold">Total Equipos</p>
                        <h3 className="text-2xl font-bold text-white">{total_devices}</h3>
                    </div>
                    <Server className="h-8 w-8 text-slate-700" />
                </CardContent>
            </Card>

            <Card className="bg-slate-900 border-emerald-900/30">
                <CardContent className="p-4 flex items-center justify-between">
                    <div>
                        <p className="text-emerald-500 text-xs uppercase tracking-wider font-bold">Online (Good)</p>
                        <h3 className="text-2xl font-bold text-emerald-400">{quality_counts.good}</h3>
                        <span className="text-xs text-emerald-600/70">{onlineRate}% Online</span>
                    </div>
                    <Wifi className="h-8 w-8 text-emerald-900" />
                </CardContent>
            </Card>

            <Card className="bg-slate-900 border-rose-900/30">
                <CardContent className="p-4 flex items-center justify-between">
                    <div>
                        <p className="text-rose-500 text-xs uppercase tracking-wider font-bold">Offline / Fallos</p>
                        <h3 className="text-2xl font-bold text-rose-400">
                            {quality_counts.bad + quality_counts.offline + quality_counts.timeouts}
                        </h3>
                        <span className="text-xs text-rose-600/70">{quality_counts.offline} Offline puro</span>
                    </div>
                    <WifiOff className="h-8 w-8 text-rose-900" />
                </CardContent>
            </Card>

            <Card className="bg-slate-900 border-slate-800">
                <CardContent className="p-4 flex items-center justify-between">
                    <div>
                        <p className="text-slate-500 text-xs uppercase tracking-wider font-bold">Estado General</p>
                        <h3 className="text-2xl font-bold text-white">
                            {Number(onlineRate) > 98 ? "Estable" : "Revisión Req."}
                        </h3>
                    </div>
                    <Activity className={`h-8 w-8 ${Number(onlineRate) > 98 ? 'text-emerald-500' : 'text-orange-500'} animate-pulse`} />
                </CardContent>
            </Card>
        </div>
    );
}
