'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Clock } from 'lucide-react';

interface PrHour {
    hour: string;
    avgIrradianceWm2: number;
    energyMwh: number;
    powerAvgMw: number;
    tempPanelC: number | null;
    prDcDeg: number | null;
    prDcDegTemp: number | null;
}

export function HourlyChart({ defaultDate }: { defaultDate: string }) {
    const [date, setDate] = useState(defaultDate);

    const { data, isLoading } = useQuery({
        queryKey: ['pr-hourly', date],
        queryFn: async () => {
            const res = await fetch(`/api/pr/hourly?date=${date}`);
            if (!res.ok) throw new Error('Error');
            return res.json() as Promise<{ hours: PrHour[] }>;
        },
    });

    const rows = (data?.hours || []).map((h) => ({
        hour: `${h.hour}h`,
        irr: Math.round(h.avgIrradianceWm2),
        power: Number(h.powerAvgMw.toFixed(2)),
        pr: h.prDcDegTemp != null ? Number((h.prDcDegTemp * 100).toFixed(1)) : null,
    }));
    const hasData = rows.some((r) => r.irr > 0 || r.power > 0);

    return (
        <div className="mt-8">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Clock className="h-5 w-5 text-sky-400" /> Curva horaria
                    <span className="text-xs font-normal text-slate-500">PR (DC) e irradiancia del día</span>
                </h2>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200" />
            </div>

            <div className="border border-slate-800 rounded-xl bg-slate-900/40 p-4" style={{ height: 340 }}>
                {isLoading ? (
                    <div className="h-full flex items-center justify-center text-slate-500 text-sm">Calculando…</div>
                ) : !hasData ? (
                    <div className="h-full flex items-center justify-center text-slate-500 text-sm">Sin datos para {date}.</div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 11 }} interval={1} />
                            <YAxis yAxisId="left" tick={{ fill: '#fbbf24', fontSize: 11 }}
                                label={{ value: 'Irrad. W/m² · Pot. MW', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }} />
                            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: '#38bdf8', fontSize: 11 }}
                                label={{ value: 'PR %', angle: 90, position: 'insideRight', fill: '#64748b', fontSize: 10 }} />
                            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Area yAxisId="left" type="monotone" dataKey="irr" name="Irradiancia W/m²" stroke="#f59e0b" fill="#f59e0b22" strokeWidth={1.5} />
                            <Line yAxisId="left" type="monotone" dataKey="power" name="Potencia MW" stroke="#22c55e" strokeWidth={2} dot={false} />
                            <Line yAxisId="right" type="monotone" dataKey="pr" name="PR %" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 2 }} connectNulls />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>
            <p className="text-[11px] text-slate-600 mt-2">
                El PR horario es DC (energía reconstruida). Un PR que se aplana al mediodía con irradiancia alta suele indicar <b>clipping</b>;
                una caída localizada por la tarde suele ser <b>sombreado</b>.
            </p>
        </div>
    );
}
