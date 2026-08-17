'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, BrainCircuit, Droplets, ThermometerSun, SunDim } from 'lucide-react';

interface Prediction {
    id: number;
    power_station: string;
    inversor: number;
    scb: number;
    string_id?: number;
    prediction_type: string;
    severity: string;
    details: string;
    created_at: string;
}

export function PredictiveAlerts() {
    const { data: predictions, isLoading } = useQuery<Prediction[]>({
        queryKey: ['ai-predictions'],
        queryFn: async () => {
            const res = await fetch('/api/stats/predictions');
            if (!res.ok) throw new Error('Error fetching predictions');
            return res.json();
        },
        refetchInterval: 30000 // Poll every 30s
    });

    if (isLoading || !predictions || predictions.length === 0) return null;

    const getIcon = (type: string) => {
        switch (type) {
            case 'SOILING': return <Droplets className="h-4 w-4 text-amber-500" />;
            case 'THERMAL_FATIGUE': return <ThermometerSun className="h-4 w-4 text-rose-500" />;
            case 'SHADING': return <SunDim className="h-4 w-4 text-indigo-400" />;
            default: return <BrainCircuit className="h-4 w-4 text-emerald-400" />;
        }
    };

    return (
        <Card className="bg-slate-900 border-slate-800 mb-8">
            <CardHeader className="pb-2 border-b border-slate-800/50 flex flex-row items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-emerald-400" />
                <CardTitle className="text-lg font-bold text-slate-200">Recomendaciones Proactivas (IA)</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {predictions.map((p) => (
                        <div key={p.id} className="flex items-start p-3 rounded-lg bg-slate-950/50 border border-slate-800/60">
                            <div className="mt-0.5 mr-3 p-1.5 rounded-full bg-slate-900 border border-slate-800">
                                {getIcon(p.prediction_type)}
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                                    {p.power_station} - Inv {p.inversor} - SCB {p.scb}
                                    {p.string_id && <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">Str {p.string_id}</span>}
                                </h4>
                                <p className="text-xs text-slate-400 mt-1 leading-snug">{p.details}</p>
                                <span className={`inline-block mt-2 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    p.severity === 'HIGH' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                                    p.severity === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                    'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                                }`}>
                                    PRIORIDAD {p.severity === 'HIGH' ? 'ALTA' : p.severity === 'MEDIUM' ? 'MEDIA' : 'BAJA'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
