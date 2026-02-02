'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, WifiOff, AlertTriangle, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

const fetchHeatmap = async () => {
    const res = await fetch('/api/heatmap');
    if (!res.ok) throw new Error('Error al cargar mapa');
    return res.json();
};

export default function HeatmapPage() {
    const router = useRouter();
    const { data, isLoading, isError } = useQuery({
        queryKey: ['heatmap'],
        queryFn: fetchHeatmap,
        refetchInterval: 5000,
    });

    if (isLoading) return <div className="h-screen flex items-center justify-center text-slate-400 animate-pulse font-medium">Cargando Mapa Térmico...</div>;
    if (isError) return <div className="h-screen flex items-center justify-center text-rose-400 font-bold">Error de conexión con el servidor.</div>;

    const groupedData: Record<string, any[]> = {};

    if (data?.stats) {
        data.stats.forEach((item: any) => {
            if (!groupedData[item.ps]) groupedData[item.ps] = [];
            groupedData[item.ps].push(item);
        });
    }

    const psNames = Object.keys(groupedData).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true })
    );

    return (
        // FIX SCROLL: overflow-x-hidden para evitar scroll horizontal
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 pb-20 overflow-x-hidden">

            {/* Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => router.push('/')} className="text-slate-300 hover:text-white border border-transparent hover:border-slate-700">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">Mapa de Calor</h1>
                        <p className="text-slate-400 text-sm">Visión táctica de 504 Cajas de Nivel</p>
                    </div>
                </div>

                {/* Leyenda Mejorada (Texto más brillante) */}
                <div className="flex flex-wrap gap-3 text-[10px] sm:text-xs font-mono bg-slate-900 p-3 rounded-xl border border-slate-800 shadow-lg">
                    <LegendItem color="bg-emerald-500" label=">90% Óptimo" />
                    <LegendItem color="bg-emerald-800" label=">75% Normal" />
                    <LegendItem color="bg-yellow-400 text-black font-bold" label="<60% Sucio/Sombra" />
                    <LegendItem color="bg-rose-500 animate-pulse" label="Fallo Crítico" />
                    <div className="flex items-center gap-2 px-2 py-1 bg-slate-800 rounded border border-dashed border-slate-600">
                        <WifiOff className="h-3 w-3 text-slate-400" /> <span className="text-slate-300">Offline</span>
                    </div>
                </div>
            </div>

            {/* Grid de Estaciones */}
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
                {psNames.map(psName => (
                    <div key={psName} className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 shadow-sm hover:border-slate-600 transition-colors">
                        <div className="flex justify-between items-end mb-4 border-b border-slate-700/50 pb-2">
                            <h3 className="font-bold text-lg text-slate-100">{psName}</h3>
                            <div className="text-right">
                                <span className="text-xs text-slate-400 font-mono block">SCBs Activas</span>
                                <span className="text-sm font-bold text-emerald-400">
                                    {groupedData[psName].filter((s: any) => s.status === 'OK').length}
                                    <span className="text-slate-500 text-xs font-normal"> / {groupedData[psName].length}</span>
                                </span>
                            </div>
                        </div>

                        {/* Matriz de Celdas */}
                        <div className="grid grid-cols-6 sm:grid-cols-9 gap-2 relative">
                            {groupedData[psName].map((scb: any, index: number) => (
                                <HeatmapCell
                                    key={scb.id}
                                    data={scb}
                                    index={index} // Pasamos el índice para calcular posición
                                    totalCols={9} // Asumimos grid de 9 para desktop
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// --- COMPONENTES AUXILIARES ---

function LegendItem({ color, label }: { color: string, label: string }) {
    return (
        <div className="flex items-center gap-2 px-2 py-1 bg-slate-950 rounded border border-slate-800">
            <span className={`w-2 h-2 rounded-full ${color}`}></span>
            <span className="text-slate-200">{label}</span>
        </div>
    );
}

// --- LA CELDA INTELIGENTE ---
function HeatmapCell({ data, index, totalCols }: { data: any, index: number, totalCols: number }) {
    const safeAmps = data.amps ?? 0;
    const safePerf = data.perf ?? 0;

    // --- CÁLCULO DE POSICIÓN TOOLTIP (FIX BORDE) ---
    // Columna actual (0 a 8)
    const colIndex = index % totalCols;

    let tooltipPositionClass = 'left-1/2 -translate-x-1/2'; // Por defecto: Centro
    let arrowPositionClass = 'left-1/2 -translate-x-1/2';

    if (colIndex === 0 || colIndex === 1) {
        // Si está muy a la izquierda -> Tooltip a la derecha
        tooltipPositionClass = 'left-0 translate-x-0';
        arrowPositionClass = 'left-4';
    } else if (colIndex === totalCols - 1 || colIndex === totalCols - 2) {
        // Si está muy a la derecha -> Tooltip a la izquierda
        tooltipPositionClass = 'right-0 translate-x-0';
        arrowPositionClass = 'right-4';
    }

    // --- LÓGICA DE DISEÑO ---
    let bgClass = '';
    let textClass = 'text-white';
    let borderClass = 'border-transparent';
    let icon = null;

    const isOffline = data.status === 'OFFLINE' || data.status === 'READ_FAIL';
    const isError = data.status.includes('FUSIBLE') || (safeAmps === 0 && !isOffline);

    if (isOffline) {
        bgClass = 'bg-slate-800';
        borderClass = 'border-dashed border-slate-600';
        textClass = 'text-slate-400'; // Texto más brillante
        icon = <WifiOff className="h-3 w-3" />;
    }
    else if (isError) {
        bgClass = 'bg-rose-600 hover:bg-rose-500';
        icon = <AlertTriangle className="h-3 w-3 text-white" />;
    }
    else if (safePerf > 90) {
        bgClass = 'bg-emerald-600 hover:bg-emerald-500';
    }
    else if (safePerf > 75) {
        bgClass = 'bg-emerald-900 hover:bg-emerald-800 border-emerald-700';
        borderClass = 'border-solid';
    }
    else if (safePerf < 75 && safePerf > 60) {
        bgClass = "bg-gradient-to-r from-green-400 to-yellow-400"
    }
    else if (safePerf < 60) {
        bgClass = 'bg-yellow-400 hover:bg-yellow-300';
        textClass = 'text-black font-extrabold';
    }
    else {
        bgClass = 'bg-slate-600 hover:bg-slate-500';
    }

    return (
        <div className="group relative z-0 hover:z-50"> {/* z-50 al hover para que el tooltip flote sobre todo */}
            {/* CELDA */}
            <div
                className={`
                   h-9 w-full rounded-md border flex items-center justify-center 
                   text-[10px] font-bold cursor-pointer transition-transform duration-200
                   hover:scale-110 shadow-sm
                   ${bgClass} ${borderClass} ${textClass}
                `}
            >
                {icon ? icon : data.scb}
            </div>

            {/* TOOLTIP INTELIGENTE */}
            <div className={`absolute bottom-full mb-3 w-48 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none ${tooltipPositionClass}`}>
                <div className="bg-slate-950/95 backdrop-blur-md border border-slate-700 p-3 rounded-lg shadow-2xl text-left relative">

                    {/* Header Tooltip */}
                    <div className="flex justify-between items-start mb-2 border-b border-slate-800 pb-2">
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Inversor {data.inversor}</p>
                            <p className="text-lg font-black text-white leading-none">SCB {data.scb}</p>
                        </div>
                        <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isError ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {isOffline ? 'OFF' : isError ? 'ERR' : 'OK'}
                        </div>
                    </div>

                    {/* Body Tooltip */}
                    {isOffline ? (
                        <p className="text-xs text-rose-400 flex items-center gap-1 font-medium">
                            <WifiOff className="h-3 w-3" /> Sin conexión
                        </p>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex justify-between items-end">
                                <span className="text-xs text-slate-400 font-medium">Corriente</span>
                                <span className="text-xl font-mono font-bold text-white">{safeAmps.toFixed(1)} <span className="text-xs text-slate-500">A</span></span>
                            </div>

                            {/* Barra de Rendimiento */}
                            <div>
                                <div className="flex justify-between text-[10px] mb-1 font-medium">
                                    <span className="text-slate-400">Eficiencia</span>
                                    <span className={safePerf < 60 ? 'text-yellow-400 font-bold' : 'text-emerald-400 font-bold'}>{safePerf.toFixed(0)}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${safePerf < 60 ? 'bg-yellow-400' : 'bg-emerald-500'}`}
                                        style={{ width: `${Math.min(safePerf, 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Flecha dinámica */}
                    <div className={`absolute top-full -mt-1 border-4 border-transparent border-t-slate-950/95 ${arrowPositionClass}`}></div>
                </div>
            </div>
        </div>
    );
}