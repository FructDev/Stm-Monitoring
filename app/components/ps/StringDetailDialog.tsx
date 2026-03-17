import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScbData } from "@/app/types";
import { Thermometer, Zap, Activity } from "lucide-react";
import { getScbCapacity } from "@/app/lib/scb-config";
import { HistoricalChart } from "./HistoricalChart";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LineChart as LineChartIcon } from "lucide-react";

interface Props {
    scb: ScbData | null;
    isOpen: boolean;
    onClose: () => void;
}

export function StringDetailDialog({ scb, isOpen, onClose }: Props) {
    const [showChart, setShowChart] = useState(false);
    const [activeString, setActiveString] = useState<number | null>(null);

    if (!scb) return null;

    // --- PROTECCIÓN CONTRA NULOS (Defensive Programming) ---
    // Si la caja está offline, estos valores vienen NULL. Usamos 0.
    const safe_i_total = (scb.i_total ?? 0) / 100; // Fix: Dividir por 100
    const safe_vdc = scb.vdc ?? 0;
    const safe_temp = scb.temp_c ?? 0;
    const safe_avg = (scb.i_avg ?? 0) / 100; // Fix: Dividir por 100 para consistencia

    // Determinar Capacidad (15 o 18)
    const capacity = getScbCapacity(scb.power_station, scb.inversor, scb.scb);

    // Extraer valores de strings dinámicamente con protección
    // Siempre generamos 18 slots para mantener la UI consistente (6x3)
    const strings = Array.from({ length: 18 }, (_, i) => {
        const id = i + 1;
        const key = `s${String(id).padStart(2, '0')}` as keyof ScbData;
        const rawVal = scb[key];
        const val = typeof rawVal === 'number' ? rawVal / 100 : 0;

        // Es válido si el ID está dentro de la capacidad (ej: id <= 15)
        const isValid = id <= capacity;

        return { id, val, isValid };
    });

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3 text-2xl">
                        <span className="font-mono text-emerald-400">
                            SCB {scb.scb}
                        </span>
                        <span className="text-slate-500 text-base font-normal">
                            | Inversor {Number(scb.scb) > 18 ? 2 : scb.inversor}
                        </span>
                        <span className={`ml-auto px-3 py-1 rounded text-sm font-bold ${getStatusColor(scb.estado)}`}>
                            {scb.estado}
                        </span>
                    </DialogTitle>
                </DialogHeader>

                {/* Métricas Generales (Usamos las variables seguras 'safe_...') */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <MetricBox icon={<Zap className="text-yellow-500" />} label="Corriente Total" value={`${safe_i_total.toFixed(1)} A`} />
                    <MetricBox icon={<Activity className="text-blue-500" />} label="Voltaje DC" value={`${safe_vdc.toFixed(0)} V`} />
                    <MetricBox icon={<Thermometer className="text-rose-500" />} label="Temperatura" value={`${safe_temp.toFixed(1)} °C`} />
                </div>

                {/* Grid de 18 Strings */}
                <div className="space-y-2">
                    <h4 className="flex justify-between items-center text-sm font-medium text-slate-400 uppercase tracking-wider">
                        <span>Monitor de Fusibles (Strings)</span>
                        {capacity < 18 && <span className="text-xs text-orange-400">Config: {capacity} Strings</span>}
                    </h4>
                    {scb.estado === 'OFFLINE' ? (
                        <div className="p-8 text-center border border-dashed border-slate-800 rounded text-slate-500">
                            Esta caja no tiene comunicación. No hay datos de strings disponibles.
                        </div>
                    ) : (
                        <div className="grid grid-cols-6 gap-2">
                            {strings.map((s) => {
                                const isSelected = activeString === s.id;
                                const baseStyle = !s.isValid
                                    ? 'bg-slate-900/50 border-slate-800 text-slate-700 cursor-not-allowed'
                                    : getStringColor(s.val, safe_avg);

                                const ringStyle = isSelected ? 'ring-2 ring-blue-500 scale-105 shadow-lg z-10' : 'hover:scale-105 transition-transform cursor-pointer';

                                return (
                                    <div
                                        key={s.id}
                                        onClick={() => {
                                            if (s.isValid) {
                                                setActiveString(prev => prev === s.id ? null : s.id);
                                                setShowChart(true);
                                            }
                                        }}
                                        className={`p-2 rounded border flex flex-col items-center justify-center transition-all ${baseStyle} ${s.isValid ? ringStyle : ''}`}
                                    >
                                        <span className={`text-xs opacity-70 mb-1 ${isSelected ? 'text-blue-300 font-bold' : ''}`}>S{s.id}</span>
                                        <span className="font-mono font-bold text-lg">
                                            {!s.isValid ? '--' : s.val.toFixed(1)}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="mt-4 flex justify-center">
                    <Button
                        variant="outline"
                        className="bg-slate-900 border-slate-700 hover:bg-slate-800 text-slate-300 gap-2"
                        onClick={() => {
                            if (showChart) setActiveString(null);
                            setShowChart(!showChart);
                        }}
                    >
                        <LineChartIcon className="w-4 h-4" />
                        {showChart ? "Ocultar Histórico" : "Ver Análisis Histórico SCB"}
                    </Button>
                </div>

                {/* Gráfico Histórico */}
                {showChart && (
                    <div className="mt-4 border-t border-slate-800 pt-4 animate-in slide-in-from-top-4 duration-300">
                        <HistoricalChart
                            psName={scb.power_station}
                            mid={scb.scb}
                            inversor={scb.inversor}
                            scbId={scb.scb}
                            stringId={activeString || undefined}
                        />
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

// Ayudantes visuales
function MetricBox({ icon, label, value }: any) {
    return (
        <div className="bg-slate-900/50 border border-slate-800 p-3 rounded flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded">{icon}</div>
            <div>
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-lg font-bold">{value}</p>
            </div>
        </div>
    );
}

function getStatusColor(status: string) {
    if (status === 'OK') return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50';
    if (status === 'OFFLINE' || status === 'READ_FAIL') return 'bg-rose-500/20 text-rose-400 border border-rose-500/50';
    return 'bg-orange-500/20 text-orange-400 border border-orange-500/50';
}

function getStringColor(val: number, avg: number) {
    if (val === 0) return 'bg-rose-950/40 border-rose-900 text-rose-500'; // Fusible roto
    if (avg > 1 && val < avg * 0.7) return 'bg-orange-950/40 border-orange-900 text-orange-400'; // Sucio/Sombra
    return 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400'; // OK
}