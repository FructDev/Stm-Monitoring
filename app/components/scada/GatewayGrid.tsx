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
import { Wifi, WifiOff, AlertTriangle } from "lucide-react";

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
    const { data, isLoading } = useQuery({
        queryKey: ['scada-snapshot'],
        queryFn: fetchSnapshot,
        refetchInterval: 5000
    });

    const [selectedPs, setSelectedPs] = useState<string | null>(null);

    if (isLoading || !data) {
        return <div className="text-slate-500 text-center animate-pulse">Cargando estado de Gateways...</div>;
    }

    // Sort PS numerically (PS1, PS2, PS10...)
    const psKeys = Object.keys(data).sort((a, b) => {
        const numA = parseInt(a.replace('PS', '')) || 0;
        const numB = parseInt(b.replace('PS', '')) || 0;
        return numA - numB;
    });

    return (
        <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {psKeys.map((psName) => {
                    const psData = data[psName];
                    const stats = getPsStats(psData);
                    const colorClass = getStatusColor(stats.errors, stats.total);

                    return (
                        <Card
                            key={psName}
                            onClick={() => setSelectedPs(psName)}
                            className={`cursor-pointer transition-all hover:scale-105 hover:shadow-xl ${colorClass}`}
                        >
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="flex justify-between items-center text-lg">
                                    {psName}
                                    {stats.errors === 0 ?
                                        <Wifi className="h-5 w-5 text-emerald-500" /> :
                                        <div className="flex gap-1">
                                            <span className="text-sm font-bold text-rose-400">{stats.errors}</span>
                                            <AlertTriangle className="h-5 w-5 text-rose-500" />
                                        </div>
                                    }
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <div className="text-xs text-slate-400 mt-2 space-y-1">
                                    <div className="flex justify-between">
                                        <span>Latencia:</span>
                                        <span className={`font-mono ${stats.avgLatency > 2000 ? 'text-orange-400' : 'text-slate-200'}`}>
                                            {stats.avgLatency.toFixed(0)} ms
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Equipos:</span>
                                        <span>{stats.total - stats.errors} / {stats.total}</span>
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
                            {selectedPs && data[selectedPs] && (
                                <Badge variant="outline" className={`${Object.values(data[selectedPs]).some(d => d.last_quality !== "Good") ? 'border-rose-500 text-rose-500' : 'border-emerald-500 text-emerald-500'}`}>
                                    {Object.values(data[selectedPs]).every(d => d.last_quality === "Good") ? "Todo OK" : "Fallos Detectados"}
                                </Badge>
                            )}
                        </DialogTitle>
                    </DialogHeader>

                    {selectedPs && data[selectedPs] && (
                        <div className="space-y-4">
                            {/* Summary Stats Rows similar to StringDialog metric boxes */}
                            <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-400">
                                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                                    Total Equipos: <span className="text-white font-bold">{Object.keys(data[selectedPs]).length}</span>
                                </div>
                                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                                    Promedio Latencia: <span className="text-white font-bold">
                                        {(Object.values(data[selectedPs]).reduce((a, b) => a + b.latency_ms, 0) / Object.keys(data[selectedPs]).length).toFixed(0)} ms
                                    </span>
                                </div>
                                <div className="bg-slate-900 p-2 rounded border border-slate-800">
                                    Fallos: <span className="text-rose-400 font-bold">{Object.values(data[selectedPs]).filter(d => d.last_quality !== "Good").length}</span>
                                </div>
                            </div>

                            {/* The "String-Style" Grid */}
                            <div className="grid grid-cols-6 gap-2">
                                {Object.entries(data[selectedPs])
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
