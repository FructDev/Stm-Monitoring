'use client';

import React from 'react';
import { useScadaStream } from '@/app/hooks/useScadaStream';
import { CloudRain, Wind, ThermometerSun, Sun, Compass } from 'lucide-react';
import { MeteoData } from '@/app/types';

// Simple gauge component using SVG
function RadialGauge({ value, max, label, unit, colorClass }: { value: number, max: number, label: string, unit: string, colorClass: string }) {
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    // For a semi-circle gauge (dasharray: circumference / 2)
    const strokeDasharray = `${circumference / 2} ${circumference / 2}`;
    const pct = Math.min(value / max, 1);
    const strokeDashoffset = (circumference / 2) * (1 - pct);

    return (
        <div className="flex flex-col items-center relative h-24 w-32 overflow-hidden justify-end pb-2">
            <svg className="w-full h-full absolute top-2 left-0 transform -rotate-180" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={radius} fill="transparent" stroke="#1e293b" strokeWidth="8" strokeDasharray={strokeDasharray} />
                <circle cx="50" cy="50" r={radius} fill="transparent" stroke="currentColor" strokeWidth="8"
                    className={`transition-all duration-1000 ease-out ${colorClass}`}
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                />
            </svg>
            <div className="z-10 flex flex-col items-center">
                <span className="text-xl font-bold font-mono tracking-tighter shadow-none">{value.toFixed(1)}</span>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">{label} ({unit})</span>
            </div>
        </div>
    );
}

function LinearThermometer({ label, value, max = 80 }: { label: string, value: number, max?: number }) {
    const pct = Math.min(Math.max(value / max, 0), 1) * 100;
    
    // Choose color based on temp
    let color = "bg-emerald-500";
    if (value > 50) color = "bg-orange-500";
    if (value > 65) color = "bg-rose-500";
    if (value < 20) color = "bg-blue-400";

    return (
        <div className="flex items-center gap-3 text-xs w-full">
            <span className="w-16 text-slate-400 font-mono text-right">{label}</span>
            <div className="flex-1 h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800 relative">
                <div 
                    className={`h-full ${color} transition-all duration-700 ease-out`} 
                    style={{ width: `${pct}%` }} 
                />
            </div>
            <span className="w-12 text-slate-200 font-bold font-mono">{value.toFixed(1)}°C</span>
        </div>
    );
}

function MeteoStationCard({ data }: { data: MeteoData }) {
    // Check if we actually have any numeric data readings from this station
    const hasNoData = !Object.keys(data).some(k => 
        !['gateway_id', 'ts', 'state', 'alarm_silenced', 'raw_len'].includes(k) && 
        data[k] !== null && typeof data[k] === 'number'
    );
    const isOffline = data.state?.last_quality === "Offline" || data.state?.last_quality === "Bad" || hasNoData;

    return (
        <div className={`bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col gap-4 shadow-xl transition-colors ${hasNoData ? 'opacity-80 hover:bg-slate-900/50' : 'hover:bg-slate-900/60'}`}>
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-800/50 pb-3">
                <h3 className="font-bold text-lg text-slate-200 flex items-center gap-2">
                    <CloudRain className={`h-5 w-5 ${hasNoData ? 'text-slate-600' : 'text-blue-400'}`} />
                    Estación {data.gateway_id.replace('METEO_', '')}
                </h3>
                <div className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2 py-1 rounded">
                    {new Date(data.ts).toLocaleTimeString()}
                </div>
            </div>

            {hasNoData ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                    <span className="text-[10px] uppercase tracking-widest font-bold mb-1">Sin Telemetría</span>
                    <span className="text-[10px]">La estación no reporta datos numéricos activos</span>
                </div>
            ) : (
                <>
                    {/* Top Gauges Row */}
                    <div className="flex flex-wrap gap-4 justify-center items-center">
                        {data.PYR002 !== null && data.PYR002 !== undefined && (
                            <RadialGauge 
                                value={data.PYR002} 
                                max={1200} 
                                label="Irradiancia" 
                                unit="W/m²" 
                                colorClass="text-amber-500" 
                            />
                        )}
                        {data.WIND_SPEED !== null && data.WIND_SPEED !== undefined && (
                            <RadialGauge 
                                value={data.WIND_SPEED} 
                                max={30} 
                                label="Viento" 
                                unit="m/s" 
                                colorClass="text-cyan-400" 
                            />
                        )}
                    </div>

                    {/* Environmental Thermometers */}
                    <div className="bg-slate-950/50 rounded-lg p-3 space-y-2.5 border border-slate-800/30 w-full mt-2">
                        <div className="flex items-center gap-2 mb-1 text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                            <ThermometerSun className="h-3.5 w-3.5 text-orange-500" />
                            Temperaturas Clave
                        </div>
                        {data.AirTC !== null && data.AirTC !== undefined && <LinearThermometer label="Ambiente" value={data.AirTC} max={60} />}
                        {data.Pt100_1 !== null && data.Pt100_1 !== undefined && <LinearThermometer label="Sonda 1" value={data.Pt100_1} max={85} />}
                        {data.Pt100_2 !== null && data.Pt100_2 !== undefined && <LinearThermometer label="Sonda 2" value={data.Pt100_2} max={85} />}
                        {data.Pt100_3 !== null && data.Pt100_3 !== undefined && <LinearThermometer label="Sonda 3" value={data.Pt100_3} max={85} />}
                        {data.Pt100_4 !== null && data.Pt100_4 !== undefined && <LinearThermometer label="Sonda 4" value={data.Pt100_4} max={85} />}
                        {data.Pt100_5 !== null && data.Pt100_5 !== undefined && <LinearThermometer label="Sonda 5" value={data.Pt100_5} max={85} />}
                    </div>

                    {/* Other Generic Variables */}
                    {Object.keys(data).filter(key => 
                        !['gateway_id', 'ts', 'state', 'alarm_silenced', 'AirTC', 'PYR001', 'PYR002', 'WIND_SPEED', 'WIND_VANE', 'Pt100_1', 'Pt100_2', 'Pt100_3', 'Pt100_4', 'Pt100_5', 'raw_len'].includes(key) && 
                        data[key] !== null && typeof data[key] === 'number'
                    ).length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mt-2 w-full">
                            {Object.keys(data).filter(key => 
                                !['gateway_id', 'ts', 'state', 'alarm_silenced', 'AirTC', 'PYR001', 'PYR002', 'WIND_SPEED', 'WIND_VANE', 'Pt100_1', 'Pt100_2', 'Pt100_3', 'Pt100_4', 'Pt100_5', 'raw_len'].includes(key) && 
                                data[key] !== null && typeof data[key] === 'number'
                            ).map(key => (
                                <div key={key} className="flex justify-between items-center bg-slate-950/50 p-1.5 px-2 rounded text-xs font-mono border border-slate-800/30">
                                    <span className="text-slate-500 lowercase truncate max-w-[80px]" title={key}>{key}</span>
                                    <span className="text-emerald-400 font-bold">{Number(data[key]).toFixed(2)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
            
            <div className="flex justify-between items-center text-[10px] text-slate-500 mt-2 px-1 w-full border-t border-slate-800/50 pt-2">
                {data.PYR001 !== null && data.PYR001 !== undefined ? (
                    <span className="flex items-center gap-1.5"><Sun className="h-3.5 w-3.5 text-yellow-500"/> Global H: {data.PYR001.toFixed(1)} W/m²</span>
                ) : <span></span>}
                
                {data.WIND_VANE !== null && data.WIND_VANE !== undefined && (
                    <span className="flex items-center gap-1.5"><Compass className="h-3.5 w-3.5 text-slate-400"/> Dir: {data.WIND_VANE.toFixed(0)}°</span>
                )}
            </div>
        </div>
    );
}

export default function MeteoPage() {
    const { meteoData, isConnected } = useScadaStream();
    const stations = Object.values(meteoData).sort((a,b) => {
        const numA = parseInt(a.gateway_id.replace('METEO_', '')) || 0;
        const numB = parseInt(b.gateway_id.replace('METEO_', '')) || 0;
        return numA - numB;
    });

    console.log("[MeteoPage Debug] meteoData keys:", Object.keys(meteoData).length, meteoData);

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-100 uppercase tracking-tight flex items-center gap-3">
                        <CloudRain className="h-7 w-7 text-blue-500" />
                        Monitoreo Climatológico
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Estaciones meteorológicas en vivo y sensores termodinámicos.
                    </p>
                </div>
                <div className="flex items-center gap-3 bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800">
                    <span className="relative flex h-3 w-3">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'} opacity-75`}></span>
                        <span className={`relative inline-flex rounded-full h-3 w-3 ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    </span>
                    <span className="text-sm text-slate-400 font-mono tracking-tight">
                        {isConnected ? 'SSE STREAM ACTIVO' : 'OFICIALMENTE DESCONECTADO'}
                    </span>
                </div>
            </div>

            {stations.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 border border-slate-800 border-dashed rounded-xl bg-slate-900/20">
                    <CloudRain className="h-16 w-16 text-slate-700 mb-4 animate-pulse" />
                    <p className="text-slate-500 font-mono uppercase tracking-widest text-sm">Esperando paquetes METEO_ desde el Stream...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {stations.map(station => (
                        <MeteoStationCard key={station.gateway_id} data={station} />
                    ))}
                </div>
            )}
        </div>
    );
}
