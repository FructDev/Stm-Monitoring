'use client';

import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, Eye, ServerCrash } from "lucide-react";

interface HeartbeatResponse {
    status: "waiting" | "observing" | "stale" | "error";
    shadowMode: boolean;
    message: string;
    driver: null | {
        started_at: string;
        last_seen_ts: string;
        process_id: number;
        version: string;
        ageSeconds: number | null;
        alive: boolean;
    };
    summary?: {
        gatewaysObserved: number;
        lastQualityGood: number;
        lastQualityNotGood: number;
    };
}

interface DataSourcesResponse {
    status: "available" | "degraded";
    message: string;
    sources: Record<"live" | "historical" | "state", {
        available: boolean;
        path: string;
        error: string | null;
        sizeBytes: number | null;
        modifiedAt: string | null;
    }>;
}

async function fetchHeartbeat(): Promise<HeartbeatResponse> {
    const response = await fetch('/api/scada/heartbeat', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo leer el heartbeat');
    return response.json();
}

async function fetchDataSources(): Promise<DataSourcesResponse> {
    const response = await fetch('/api/scada/data-sources', { cache: 'no-store' });
    return response.json();
}

export function HeartbeatStatus() {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['scada-heartbeat-shadow'],
        queryFn: fetchHeartbeat,
        refetchInterval: 5000,
    });
    const { data: sourceData } = useQuery({
        queryKey: ['scada-data-sources'],
        queryFn: fetchDataSources,
        refetchInterval: 15000,
    });

    if (isLoading) {
        return <div className="mb-6 h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900" />;
    }

    const stale = isError || data?.status === 'stale' || data?.status === 'error';
    const observing = data?.status === 'observing';
    const border = stale ? 'border-rose-900/60' : observing ? 'border-cyan-900/60' : 'border-amber-900/50';
    const iconColor = stale ? 'text-rose-400' : observing ? 'text-cyan-400' : 'text-amber-400';
    const Icon = stale ? ServerCrash : observing ? Activity : Clock3;

    return (
        <section className={`mb-6 rounded-xl border bg-slate-900/80 p-4 ${border}`}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <Icon className={`mt-0.5 h-6 w-6 shrink-0 ${iconColor}`} />
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-semibold text-slate-100">Heartbeat del driver</h2>
                            <span className="inline-flex items-center gap-1 rounded-full border border-violet-800/60 bg-violet-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-300">
                                <Eye className="h-3 w-3" /> Solo observación
                            </span>
                        </div>
                        <p className="mt-1 break-words text-sm text-slate-400">
                            {isError ? 'No se pudo consultar el heartbeat.' : data?.message}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[430px]">
                    <HeartbeatMetric label="Proceso" value={data?.driver?.alive ? 'Vivo' : data?.status === 'waiting' ? 'Pendiente' : 'Sin señal'} tone={data?.driver?.alive ? 'good' : 'warn'} />
                    <HeartbeatMetric label="Edad" value={data?.driver?.ageSeconds == null ? '--' : `${data.driver.ageSeconds.toFixed(0)} s`} />
                    <HeartbeatMetric label="Gateways vistos" value={String(data?.summary?.gatewaysObserved ?? 0)} />
                    <HeartbeatMetric label="Última calidad Good" value={String(data?.summary?.lastQualityGood ?? 0)} />
                </div>
            </div>

            {sourceData && (
                <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-800 pt-4 sm:grid-cols-3">
                    <DataSource label="Base en vivo" source={sourceData.sources.live} />
                    <DataSource label="Base histórica" source={sourceData.sources.historical} />
                    <DataSource label="Base de estado" source={sourceData.sources.state} />
                </div>
            )}
        </section>
    );
}

function DataSource({ label, source }: { label: string; source: DataSourcesResponse['sources']['live'] }) {
    const sizeMb = source.sizeBytes === null ? '--' : `${(source.sizeBytes / 1024 / 1024).toFixed(1)} MB`;
    return (
        <div className="min-w-0 rounded-lg bg-slate-950/50 px-3 py-2" title={source.error || source.path}>
            <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-slate-300">{label}</span>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${source.available ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            </div>
            <p className={`mt-1 text-xs ${source.available ? 'text-slate-500' : 'text-rose-400'}`}>
                {source.available ? `Disponible · ${sizeMb}` : 'No disponible'}
            </p>
        </div>
    );
}

function HeartbeatMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'good' | 'warn' }) {
    const color = tone === 'good' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-slate-100';
    return (
        <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 break-words text-lg font-semibold ${color}`}>{value}</p>
        </div>
    );
}
