'use client';

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GlobalSnapshot, GatewaySnapshot } from "@/app/types/scada";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
/* Table imports removed as they are no longer used */
import { Badge } from "@/components/ui/badge";
import { Wifi, AlertTriangle, Sun, ZapOff, CloudRain } from "lucide-react";
import { useScadaStream } from "@/app/hooks/useScadaStream";
import { analyzeScb } from "@/app/lib/analytics";
import { ParkStats, PsSummary } from "@/app/types";

// --- Fetcher ---
async function fetchSnapshot(): Promise<GlobalSnapshot> {
    const res = await fetch('/api/scada/snapshot');
    if (!res.ok) throw new Error('Failed to fetch snapshot');
    return res.json();
}

// --- Helper Functions ---
function getPsStats(data: GatewaySnapshot) {
    const devices = Object.values(data);
    const total = devices.length;
    const offline = devices.filter(d => d.last_quality === "Offline").length;
    const bad = devices.filter(d => d.last_quality === "Bad").length;
    const errors = offline + bad;

    // Average Latency of ONLINE devices
    const onlineDevices = devices.filter(d => d.latency_ms > 0);
    const avgLatency = onlineDevices.length > 0
        ? onlineDevices.reduce((sum, d) => sum + d.latency_ms, 0) / onlineDevices.length
        : 0;

    return { total, offline, bad, errors, avgLatency };
}

function getStatusColor(errors: number, total: number) {
    if (errors === 0) return "border-emerald-500/50 bg-emerald-950/20";
    if (errors === total) return "border-rose-600 bg-rose-950/40 animate-pulse";
    if (errors > 0) return "border-orange-500/50 bg-orange-950/20";
    return "border-slate-800 bg-slate-900";
}

// --- Main Component ---
export function GatewayGrid() {
    // 1. Snapshot for latency and HTTP health
    const { data: snapshotData, isLoading } = useQuery({
        queryKey: ['scada-snapshot'],
        queryFn: fetchSnapshot,
        refetchInterval: 5000
    });

    // Stats from SQL for accurate dead strings
    const { data: statsData } = useQuery<ParkStats & { stations: PsSummary[] }>({
        queryKey: ["park-stats"],
    });

    // 2. Twin Engine data
    const { data: scadaData, meteoData } = useScadaStream();

    const [selectedPs, setSelectedPs] = useState<string | null>(null);

    if (isLoading || !snapshotData) {
        return <div className="text-slate-500 text-center animate-pulse">Cargando estado de Gateways...</div>;
    }

    // Sort PS numerically (PS1, PS2, PS10...)
    const psKeys = Object.keys(snapshotData).sort((a, b) => {
        const numA = parseInt(a.replace('PS', '')) || 0;
        const numB = parseInt(b.replace('PS', '')) || 0;
        return numA - numB;
    });

    return (
        <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {psKeys.map((psName) => {
                    const psData = snapshotData[psName];
                    const stats = getPsStats(psData);
                    
                    // --- Analítica Avanzada ---
                    const psNumber = psName.replace('PS', '');
                    const regionalMeteo = meteoData[`METEO_${psNumber}`];
                    const irradiance = regionalMeteo?.PYR002 ?? 0;

                    // Fetch accurate dead strings from SQL stats
                    const psStats = statsData?.stations?.find(s => s.name === psName);
                    const damagedStringsCount = psStats?.dead_strings || 0;

                    // El color ahora depende de los fallos físicos reales + los de red
                    const totalAnomalies = stats.errors + damagedStringsCount;
                    const colorClass = getStatusColor(totalAnomalies, stats.total);

                    return (
                        <Card
                            key={psName}
                            onClick={() => setSelectedPs(psName)}
                            className={`cursor-pointer transition-all hover:scale-105 hover:shadow-xl ${colorClass}`}
                        >
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="flex justify-between items-center text-lg">
                                    {psName}
                                    {totalAnomalies === 0 ?
                                        <Wifi className="h-5 w-5 text-emerald-500" /> :
                                        <div className="flex gap-1" title={`${stats.errors} Offlines, ${damagedStringsCount} Térmicos`}>
                                            <span className="text-sm font-bold text-rose-400">{totalAnomalies}</span>
                                            <AlertTriangle className="h-5 w-5 text-rose-500" />
                                        </div>
                                    }
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-xs text-slate-400 mt-2 space-y-1.5 font-medium">
                                    <div className="flex justify-between items-center bg-slate-950/50 p-1 rounded">
                                        <div className="flex items-center gap-1.5"><Sun className="h-3.5 w-3.5 text-amber-500"/> <span>Irradiancia Local:</span></div>
                                        <span className={`font-mono text-[11px] ${irradiance > 200 ? 'text-amber-400' : 'text-slate-500'}`}>
                                            {irradiance.toFixed(1)} W/m²
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center bg-slate-950/50 p-1 rounded">
                                        <div className="flex items-center gap-1.5"><ZapOff className={`h-3.5 w-3.5 ${damagedStringsCount > 0 ? 'text-rose-500' : 'text-slate-600'}`}/> <span>Strings Dañados:</span></div>
                                        <span className={`font-mono text-[11px] font-bold ${damagedStringsCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                            {damagedStringsCount}
                                        </span>
                                    </div>
                                    <div className="flex justify-between px-1">
                                        <span>Ping: {stats.avgLatency.toFixed(0)}ms</span>
                                        <span>Equipos: {stats.total - stats.errors} / {stats.total}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Drill-down Modal */}
            <Dialog open={!!selectedPs} onOpenChange={(open) => !open && setSelectedPs(null)}>
                <DialogContent className="max-w-2xl bg-slate-950 border-slate-800 text-slate-100">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-2xl">
                                <span className="font-bold">{selectedPs}</span>
                                <span className="text-base font-normal text-slate-500">| Conectividad</span>
                            </div>
                            {selectedPs && snapshotData[selectedPs] && (
                                <Badge variant="outline" className={`${Object.values(snapshotData[selectedPs]).some(d => d.last_quality !== "Good") ? 'border-rose-500 text-rose-500' : 'border-emerald-500 text-emerald-500'}`}>
                                    {Object.values(snapshotData[selectedPs]).every(d => d.last_quality === "Good") ? "Todo OK" : "Fallos Detectados"}
                                </Badge>
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    {selectedPs && snapshotData[selectedPs] && (
                        <div className="space-y-4">
                            {/* Summary Stats Rows similar to StringDialog metric boxes */}
                            <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-400">
                                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                                    Total Equipos: <span className="text-white font-bold">{Object.keys(snapshotData[selectedPs]).length}</span>
                                </div>
                                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                                    Promedio Latencia: <span className="text-white font-bold">
                                        {(Object.values(snapshotData[selectedPs]).reduce((a, b) => a + b.latency_ms, 0) / Object.keys(snapshotData[selectedPs]).length).toFixed(0)} ms
                                    </span>
                                </div>
                                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                                    Fallos Red: <span className="text-rose-400 font-bold">{Object.values(snapshotData[selectedPs]).filter(d => d.last_quality !== "Good").length}</span>
                                </div>
                            </div>

                            {/* The "String-Style" Grid */}
                            <div className="grid grid-cols-6 gap-2">
                                {Object.entries(snapshotData[selectedPs])
                                    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                                    .map(([id, device]) => {
                                        const isGood = device.last_quality === "Good";
                                        const isOffline = device.last_quality === "Offline";

                                        let cellStyle = "bg-slate-900 border-slate-800 text-slate-500";
                                        if (isGood) cellStyle = "bg-emerald-950/30 border-emerald-900/50 text-emerald-400 hover:bg-emerald-950/50";
                                        else if (isOffline) cellStyle = "bg-rose-950/40 border-rose-900 text-rose-500 hover:bg-rose-950/60";
                                        else cellStyle = "bg-orange-950/40 border-orange-900 text-orange-400 hover:bg-orange-950/60";

                                        // Backend is now passing correct data, determine inverter visually
                                        // or leave it simple based on the device id
                                        const parsedId = parseInt(id);

                                        return (
                                            <div
                                                key={id}
                                                className={`
                                                    p-2 rounded border flex flex-col items-center justify-center transition-colors cursor-help h-20
                                                    ${cellStyle}
                                                `}
                                                title={device.last_error || `Estado: ${device.last_quality} | Latencia: ${device.latency_ms}ms`}
                                            >
                                                <span className="text-[10px] opacity-70 mb-1 uppercase leading-tight text-center">
                                                    STM {parsedId}
                                                </span>

                                                {isGood ? (
                                                    <span className="font-mono font-bold text-lg">
                                                        {device.latency_ms}
                                                        <span className="text-[10px] ml-0.5 opacity-50">ms</span>
                                                    </span>
                                                ) : (
                                                    <span className="font-bold text-xs uppercase text-center leading-tight">
                                                        {device.last_quality}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
