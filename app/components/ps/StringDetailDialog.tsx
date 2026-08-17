import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScbData } from "@/app/types";
import { Thermometer, Zap, Activity } from "lucide-react";
import { getScbCapacity } from "@/app/lib/scb-config";
import { HistoricalChart } from "./HistoricalChart";
import { useState } from "react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { LineChart as LineChartIcon } from "lucide-react";
import { analyzeScb } from "@/app/lib/analytics";

interface Props {
    scb: ScbData | null;
    isOpen: boolean;
    onClose: () => void;
}

export function StringDetailDialog({ scb, isOpen, onClose }: Props) {
    const [showChart, setShowChart] = useState(false);
    const [activeString, setActiveString] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const queryClient = useQueryClient();

    // Fetch AI Predictions to overlay on the strings
    const { data: predictions } = useQuery<any[]>({
        queryKey: ['ai-predictions'],
        queryFn: async () => {
            const res = await fetch('/api/stats/predictions');
            if (!res.ok) return [];
            return res.json();
        },
        enabled: isOpen // Only fetch when dialog is open
    });

    if (!scb) return null;

    // --- PROTECCIÓN CONTRA NULOS ---
    const safe_i_total = (scb.i_total ?? 0) / 100;
    const safe_vdc = scb.vdc ?? 0;
    const safe_temp = scb.temp_c ?? 0;
    const safe_avg = (scb.i_avg ?? 0) / 100;

    const capacity = getScbCapacity(scb.power_station, scb.inversor, scb.scb);
    const analysis = analyzeScb(scb);

    const assumedGood = analysis.assumedGoodStrings || [];
    const suspectedCards = analysis.suspectedDeadCards || [];
    const confirmedCards = analysis.confirmedDeadCards || [];

    const strings = Array.from({ length: 18 }, (_, i) => {
        const id = i + 1;
        const key = `s${String(id).padStart(2, '0')}` as keyof ScbData;
        const rawVal = scb[key];
        const val = typeof rawVal === 'number' ? rawVal / 100 : 0;
        const isValid = id <= capacity;
        return { id, val, isValid };
    });

    const actualizarTarjeta = async (cardId: number, normalize = false) => {
        setIsSubmitting(true);
        try {
            // Mapeo inversores si es PS antigua
            let finalInversor = scb.inversor;
            let finalScb = scb.scb;
            if (finalInversor === 1 && finalScb > 18) {
                finalInversor = 2;
                finalScb -= 18;
            }

            await fetch('/api/reviews', {
                method: normalize ? 'DELETE' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    power_station: scb.power_station,
                    inversor: finalInversor,
                    scb: finalScb,
                    card_id: cardId
                })
            });

            // Refrescamos los datos afectados por la revisión sin recargar toda la página
            // (evita parpadeo y pérdida de estado). Cerramos el modal al terminar.
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['ps-data'] }),
                queryClient.invalidateQueries({ queryKey: ['park-stats'] }),
                queryClient.invalidateQueries({ queryKey: ['activeAlarms'] }),
                queryClient.invalidateQueries({ queryKey: ['ai-predictions'] }),
            ]);
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    }

    function getStringColor(val: number, avg: number, id: number) {
        if (assumedGood.includes(id)) return 'bg-purple-950/40 border-purple-900 text-purple-400';
        if (val === 0) {
            return 'bg-rose-950/40 border-rose-900 text-rose-500';
        }
        if (avg > 1 && val < avg * 0.7) return 'bg-orange-950/40 border-orange-900 text-orange-400'; // Sucio/Sombra
        return 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400'; // OK
    }

    // Filter predictions for this specific SCB
    const scbPredictions = predictions?.filter(p => 
        p.power_station === scb.power_station && 
        p.inversor === scb.inversor && 
        p.scb === scb.scb
    ) || [];

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3 text-2xl">
                        <span className="font-mono text-emerald-400">
                            {scb.power_station} · SCB {scb.scb}
                        </span>
                        <span className="text-slate-500 text-base font-normal">
                            | Inversor {Number(scb.scb) > 18 ? 2 : scb.inversor}
                        </span>
                        <span className={`ml-auto px-3 py-1 rounded text-sm font-bold ${getStatusColor(scb.estado)}`}>
                            {scb.estado}
                        </span>
                    </DialogTitle>
                </DialogHeader>

                <div className="overflow-y-auto max-h-[65vh] pr-2 -mr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-slate-900/40 [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-600">
                    <div className="grid grid-cols-3 gap-4 mb-4 mt-1">
                        <MetricBox icon={<Zap className="text-yellow-500" />} label="Corriente Total" value={`${safe_i_total.toFixed(1)} A`} />
                        <MetricBox icon={<Activity className="text-blue-500" />} label="Voltaje DC" value={`${safe_vdc.toFixed(0)} V`} />
                        <MetricBox icon={<Thermometer className="text-rose-500" />} label="Temperatura" value={`${safe_temp.toFixed(1)} °C`} />
                    </div>

                    {/* --- DIAGNÓSTICOS IA --- */}
                    {suspectedCards.length > 0 && (
                        <div className="bg-purple-950/30 border border-purple-900/50 p-2.5 rounded mb-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h5 className="text-purple-400 font-bold text-sm mb-0.5">⚠️ Fallo de Telemetría STM-SP</h5>
                                    <p className="text-xs text-slate-300">
                                        Canales sin medición en tarjeta(s) {suspectedCards.join(', ')}. Confirma solo si verificaste que los strings producen.
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-1.5 justify-end max-w-[200px]">
                                    {suspectedCards.filter(c => !confirmedCards.includes(c)).map(c => (
                                        <Button key={c} size="sm" variant="outline" disabled={isSubmitting} className="border-purple-800 text-purple-300 hover:bg-purple-900 text-xs py-0.5 h-7 px-2" onClick={() => actualizarTarjeta(c)}>
                                            Confirmar T{c}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {confirmedCards.length > 0 && (
                        <div className="bg-indigo-950/30 border border-indigo-900/50 p-2.5 rounded mb-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h5 className="text-indigo-300 font-bold text-sm mb-0.5">Tarjeta de medición confirmada</h5>
                                    <p className="text-xs text-slate-300">
                                        Tarjeta(s) {confirmedCards.join(', ')}: sus canales se reconstruyen y no cuentan como strings caídos.
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-1.5 justify-end max-w-[200px]">
                                    {confirmedCards.map(c => (
                                        <Button key={c} size="sm" variant="outline" disabled={isSubmitting} className="border-indigo-700 text-indigo-200 text-xs py-0.5 h-7 px-2" onClick={() => actualizarTarjeta(c, true)}>
                                            Normalizar T{c}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Grid de Strings */}
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
                                        : getStringColor(s.val, safe_avg, s.id);

                                    const ringStyle = isSelected ? 'ring-2 ring-blue-500 scale-105 shadow-lg z-10' : 'hover:scale-105 transition-transform cursor-pointer';

                                    const stringPrediction = scbPredictions.find(p => p.string_id === s.id);
                                    const hasAiWarning = !!stringPrediction;

                                    return (
                                        <div
                                            key={s.id}
                                            onClick={() => {
                                                if (s.isValid) {
                                                    setActiveString(prev => prev === s.id ? null : s.id);
                                                    setShowChart(true);
                                                }
                                            }}
                                            className={`p-2 rounded border flex flex-col items-center justify-center transition-all relative ${baseStyle} ${s.isValid ? ringStyle : ''}`}
                                        >
                                            {hasAiWarning && (
                                                <span className="absolute -top-2 -right-2 w-4 h-4 bg-indigo-500 rounded-full animate-bounce" title={stringPrediction.details}></span>
                                            )}
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
                </div>
            </DialogContent>
        </Dialog>
    );
}

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
    if (status === 'OK' || status === 'ONLINE') return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50';
    if (status === 'OFFLINE' || status === 'READ_FAIL') return 'bg-rose-500/20 text-rose-400 border border-rose-500/50';
    return 'bg-orange-500/20 text-orange-400 border border-orange-500/50';
}
