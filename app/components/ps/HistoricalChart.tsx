'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { Loader2, AlertCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface HistoricalDataPoint {
    ts: string;
    gateway: string;
    mid: number;
    inversor: number;
    scb: number;
    v_avg: number;
    i_total_avg: number;
    power_kw_avg: number;
    temp_avg: number;
    currents: number[];
}

interface Props {
    psName: string;
    mid: number;
    inversor: number;
    scbId: number;
    stringId?: number; // Si se provee, grafica solo para este string
}

export function HistoricalChart({ psName, mid, inversor, scbId, stringId }: Props) {
    const [hours, setHours] = useState('24');

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['scada-history', psName, mid, hours],
        queryFn: async (): Promise<HistoricalDataPoint[]> => {
            const res = await fetch(`/api/scada/history?gateway=${psName}&mid=${mid}&hours=${hours}`);
            if (!res.ok) throw new Error('API Error');
            const json = await res.json();
            if (json.error) throw new Error(json.error);
            return json.data || [];
        },
        staleTime: 5 * 60 * 1000 // Cached for 5 mins as data only updates every 5 mins
    });

    if (isLoading) {
        return (
            <div className="h-64 flex flex-col items-center justify-center text-slate-500 bg-slate-900 rounded border border-slate-800">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p>Cargando millones de datos en milisegundos...</p>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="h-64 flex flex-col items-center justify-center text-rose-500 bg-slate-900 rounded border border-rose-900/50">
                <AlertCircle className="h-8 w-8 mb-2" />
                <p>Error cargando historial.</p>
                <p className="text-xs opacity-70 mt-1">{String(error)}</p>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="h-64 flex items-center justify-center text-slate-500 bg-slate-900 rounded border border-slate-800">
                No hay datos históricos para este periodo.
            </div>
        );
    }

    // Preparar datos para Recharts
    const chartData = data.map(d => {
        const date = new Date(d.ts);

        let stringCurrent = 0;
        let stringPower = 0;
        if (stringId && stringId >= 1 && stringId <= 18) {
            // Asumiendo que rust retorna currents en 100x o normal (usamos lo que venga, 
            // pero si hay q dividir se hará en un refactor mayor si vemos error de escala)
            const rawCurrent = d.currents ? d.currents[stringId - 1] : 0;
            // Para mantener consistencia con como se muestra en live (quizás rust manda x 100)
            // Si v_avg viene en escala, P = V * I. 
            // Vamos a usar el valor raw de la API, si en el futuro necesita /100 se lo pasamos
            stringCurrent = rawCurrent;
            stringPower = (rawCurrent * d.v_avg) / 1000; // kW
        }

        return {
            time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            Voltaje: d.v_avg,
            Amperaje: d.i_total_avg,
            Potencia: d.power_kw_avg,
            Temperatura: d.temp_avg,
            StringCurrent: stringCurrent,
            StringPower: stringPower,
            fullDate: date.toLocaleString()
        };
    });

    return (
        <div className="w-full bg-slate-950 p-4 rounded-lg border border-slate-800">
            {/* Cabecera del Gráfico */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-200">
                        Histórico Avanzado (5 Min Avg)
                    </h3>
                    <p className="text-sm text-slate-500">
                        Inversor {inversor} - SCB {scbId} {stringId ? ` - Fusible S${stringId}` : ''}
                    </p>
                </div>

                <Select value={hours} onValueChange={setHours}>
                    <SelectTrigger className="w-[180px] bg-slate-900 border-slate-700 text-slate-300">
                        <SelectValue placeholder="Periodo" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700 text-slate-300">
                        <SelectItem value="1">Última Hora</SelectItem>
                        <SelectItem value="6">Últimas 6 Horas</SelectItem>
                        <SelectItem value="12">Últimas 12 Horas</SelectItem>
                        <SelectItem value="24">Últimas 24 Horas</SelectItem>
                        <SelectItem value="72">Últimos 3 Días</SelectItem>
                        <SelectItem value="168">Última Semana</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Contenedor del Gráfico */}
            <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis
                            dataKey="time"
                            stroke="#64748b"
                            fontSize={12}
                            tickMargin={10}
                            minTickGap={30}
                        />
                        <YAxis
                            yAxisId="left"
                            stroke="#64748b"
                            fontSize={12}
                            domain={['dataMin - 10', 'auto']}
                        />
                        <YAxis
                            yAxisId="right"
                            orientation="right"
                            stroke="#64748b"
                            fontSize={12}
                            domain={[0, 'auto']}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                            itemStyle={{ fontWeight: 'bold' }}
                            labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
                            labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate || label}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />

                        {stringId ? (
                            <>
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="StringCurrent"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    dot={false}
                                    name={`Corriente S${stringId} (A)`}
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="StringPower"
                                    stroke="#f59e0b"
                                    strokeWidth={2}
                                    dot={false}
                                    name="Potencia (kW)"
                                />
                            </>
                        ) : (
                            <>
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="Voltaje"
                                    stroke="#38bdf8"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 6 }}
                                    name="Voltaje (V)"
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="Amperaje"
                                    stroke="#10b981"
                                    strokeWidth={2}
                                    dot={false}
                                    name="Corriente (A)"
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="Potencia"
                                    stroke="#f59e0b"
                                    strokeWidth={2}
                                    dot={false}
                                    name="Potencia (kW)"
                                />
                            </>
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="mt-4 text-xs text-slate-500 flex justify-between">
                <span>V2 DB Engine (Rust)</span>
                <span>Resolución: 1 Punto c/5 min</span>
            </div>
        </div>
    );
}
