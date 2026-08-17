"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellOff, Check } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { cn } from "@/app/lib/utils";
import { translateAlarmMessage, getSeverityLabel } from "@/app/lib/alarm-translator";
import { ActiveAlarm } from "@/app/types/alarms";

interface Props {
    alarms: ActiveAlarm[];
    isLoading: boolean;
}

export function AlarmTable({ alarms, isLoading }: Props) {
    const [search, setSearch] = useState("");
    const [severityFilter, setSeverityFilter] = useState<number | null>(null);
    const [acking, setAcking] = useState<Set<string>>(new Set());
    const queryClient = useQueryClient();

    const handleAck = async (alarm: ActiveAlarm) => {
        const key = `${alarm.power_station}-${alarm.inversor}-${alarm.scb}-${alarm.alarm_code}`;
        setAcking((prev) => new Set(prev).add(key));
        try {
            await fetch("/api/alarms/ack", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    power_station: alarm.power_station,
                    inversor: alarm.inversor ?? 0,
                    scb: alarm.scb ?? 0,
                    alarm_code: alarm.alarm_code,
                }),
            });
            await queryClient.invalidateQueries({ queryKey: ["activeAlarms"] });
        } catch (e) {
            console.error("Error al reconocer alarma:", e);
        } finally {
            setAcking((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    };

    if (isLoading) return <div className="text-slate-500 p-4">Cargando alarmas...</div>;
    if (alarms.length === 0) return <div className="text-slate-500 p-4">No hay alarmas activas. Todo en orden.</div>;

    const filteredAlarms = alarms.filter(a => {
        const matchesSearch = a.power_station.toLowerCase().includes(search.toLowerCase()) || 
                              a.alarm_code.toLowerCase().includes(search.toLowerCase());
        const matchesSeverity = severityFilter ? a.severity === severityFilter : true;
        return matchesSearch && matchesSeverity;
    });

    return (
        <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <input 
                    type="text"
                    placeholder="Buscar por Planta (ej. PS1) o Código..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex h-9 w-full max-w-xs rounded-md border border-slate-800 bg-slate-950 px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-700 disabled:cursor-not-allowed disabled:opacity-50 text-white"
                />
                <div className="flex gap-2">
                    <button 
                        onClick={() => setSeverityFilter(null)}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors ${severityFilter === null ? 'bg-slate-700 text-white border-slate-600' : 'border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                    >
                        Todas
                    </button>
                    <button 
                        onClick={() => setSeverityFilter(3)}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors ${severityFilter === 3 ? 'bg-rose-900/50 text-rose-400 border-rose-800' : 'border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                    >
                        Críticas
                    </button>
                    <button 
                        onClick={() => setSeverityFilter(2)}
                        className={`px-3 py-1 text-xs rounded-full border transition-colors ${severityFilter === 2 ? 'bg-amber-900/50 text-amber-400 border-amber-800' : 'border-slate-800 text-slate-400 hover:bg-slate-800'}`}
                    >
                        Advertencias
                    </button>
                </div>
            </div>

            <div className="rounded-md border border-slate-800 overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-950/50">
                        <TableRow className="border-slate-800 hover:bg-transparent">
                            <TableHead className="w-[80px] text-slate-400">Sev</TableHead>
                            <TableHead className="text-slate-400">Equipo</TableHead>
                            <TableHead className="text-slate-400">Diagnóstico NOC</TableHead>
                            <TableHead className="text-right text-slate-400">Última Vez</TableHead>
                            <TableHead className="text-right text-slate-400">Acción</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredAlarms.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                                    No se encontraron alarmas con estos filtros.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredAlarms.map((alarm, idx) => {
                                const sevInfo = getSeverityLabel(alarm.severity);
                                const translation = translateAlarmMessage(alarm.alarm_code, alarm.message);
                                
                                return (
                                    <TableRow key={idx} className="border-slate-800 hover:bg-slate-800/50">
                                        <TableCell>
                                            <div
                                                className={cn(
                                                    "w-3 h-3 rounded-full shadow-sm",
                                                    alarm.severity >= 3 ? "bg-rose-500 shadow-rose-500/50" :
                                                        alarm.severity === 2 ? "bg-amber-500 shadow-amber-500/50" : "bg-blue-500"
                                                )}
                                                title={sevInfo.label}
                                            />
                                        </TableCell>
                                        <TableCell className="font-medium text-slate-300">
                                            {alarm.power_station}
                                            <div className="text-xs text-slate-500 font-mono mt-0.5">
                                                {alarm.scb ? `SCB ${alarm.scb}` : 'N/A'}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium text-slate-200">
                                                {translation.title}
                                            </div>
                                            <div className="text-xs text-slate-400 mt-1">
                                                <span className="font-semibold text-slate-500">Acción Sugerida: </span>
                                                {translation.action}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right text-xs text-slate-500">
                                            {new Date(alarm.last_seen_ts).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {alarm.ack === 1 ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-emerald-500/80">
                                                    <Check className="h-3.5 w-3.5" /> Reconocida
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => handleAck(alarm)}
                                                    disabled={acking.has(`${alarm.power_station}-${alarm.inversor}-${alarm.scb}-${alarm.alarm_code}`)}
                                                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50"
                                                    title="Silenciar esta alarma por 8 horas"
                                                >
                                                    <BellOff className="h-3.5 w-3.5" /> Reconocer
                                                </button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
