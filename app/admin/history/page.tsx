'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { saveAs } from 'file-saver';
import {
    ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Plus, X, BarChart2, List, Loader2, ArrowLeft, Activity, Layers, Download, Sun, Sparkles } from 'lucide-react';
import { HistLevel, HistVariable } from '@/app/lib/history-agg';

const VARIABLES: { key: HistVariable; label: string; unit: string }[] = [
    { key: 'corriente', label: 'Corriente', unit: 'A' },
    { key: 'voltaje', label: 'Voltaje', unit: 'V' },
    { key: 'potencia', label: 'Potencia', unit: 'kW' },
    { key: 'temperatura', label: 'Temperatura', unit: '°C' },
];
const LEVELS: { key: HistLevel; label: string }[] = [
    { key: 'PS', label: 'Power Station' },
    { key: 'INV', label: 'Inversor' },
    { key: 'SCB', label: 'SCB' },
    { key: 'STRING', label: 'String' },
];
const PRESETS = [
    { key: 'today', label: 'Hoy' }, { key: 'yesterday', label: 'Ayer' }, { key: '24h', label: '24 h' },
    { key: '7d', label: '7 días' }, { key: '30d', label: '30 días' }, { key: 'custom', label: 'Personalizado' },
];
const PS_LIST = Array.from({ length: 14 }, (_, i) => `PS${i + 1}`);
const colorFor = (i: number) => `hsl(${Math.round((i * 137.508) % 360)}, 70%, 60%)`;

interface UISeries { id: string; level: HistLevel; ps: string; inversor: number; scb: number; stringId: number; }

const mkSeries = (p: Omit<UISeries, 'id'>): UISeries => ({ ...p, id: `${p.level}|${p.ps}|${p.inversor}|${p.scb}|${p.stringId}` });

const labelOf = (s: UISeries): string => {
    if (s.level === 'PS') return s.ps;
    if (s.level === 'INV') return `${s.ps} · Inv ${s.inversor}`;
    if (s.level === 'SCB') return `${s.ps} · Inv ${s.inversor} · SCB ${s.scb}`;
    return `${s.ps} · Inv ${s.inversor} · SCB ${s.scb} · S${s.stringId}`;
};

function presetRange(preset: string, cs: string, ce: string): { start: Date; end: Date } {
    const now = new Date();
    const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (preset) {
        case 'today': return { start: mid, end: now };
        case 'yesterday': { const y = new Date(mid); y.setDate(y.getDate() - 1); return { start: y, end: mid }; }
        case '24h': return { start: new Date(now.getTime() - 24 * 3600000), end: now };
        case '7d': return { start: new Date(now.getTime() - 7 * 86400000), end: now };
        case '30d': return { start: new Date(now.getTime() - 30 * 86400000), end: now };
        case 'custom': return { start: cs ? new Date(cs) : new Date(now.getTime() - 24 * 3600000), end: ce ? new Date(ce) : now };
        default: return { start: mid, end: now };
    }
}

// Correlación de Pearson (para relación variable ↔ irradiancia)
function pearson(xs: number[], ys: number[]): number {
    const n = xs.length;
    if (n < 3) return NaN;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    const d = Math.sqrt(sxx * syy);
    return d === 0 ? NaN : sxy / d;
}

export default function HistoryPage() {
    const [level, setLevel] = useState<HistLevel>('PS');
    const [ctxPs, setCtxPs] = useState('PS1');
    const [ctxInv, setCtxInv] = useState(1);
    const [ctxScb, setCtxScb] = useState(1);
    const [selected, setSelected] = useState<number[]>([1]); // elementos del nivel final
    const [frozen, setFrozen] = useState<UISeries[]>([]);     // series fijadas de otros contextos

    const [variable, setVariable] = useState<HistVariable>('corriente');
    const [preset, setPreset] = useState('today');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [showIrr, setShowIrr] = useState(false);
    const [tab, setTab] = useState<'GRAFICO' | 'DATOS'>('GRAFICO');

    const [chartData, setChartData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasData, setHasData] = useState(false);

    const varInfo = VARIABLES.find(v => v.key === variable)!;
    const decimals = varInfo.unit === 'A' || varInfo.unit === 'kW' ? 2 : 1;

    // Opciones del multi-select del nivel final
    const finalOptions = useMemo(() => {
        if (level === 'PS') return PS_LIST.map((_, i) => i + 1);          // 1..14
        if (level === 'INV') return [1, 2];
        return Array.from({ length: 18 }, (_, i) => i + 1);              // SCB / String 1..18
    }, [level]);

    const optLabel = (n: number) => level === 'PS' ? `PS${n}` : level === 'INV' ? `Inv ${n}` : level === 'SCB' ? `SCB ${n}` : `S${n}`;

    // Series "vivas" derivadas de la selección actual
    const liveSeries: UISeries[] = useMemo(() => selected.map(n => {
        if (level === 'PS') return mkSeries({ level: 'PS', ps: `PS${n}`, inversor: 1, scb: 1, stringId: 1 });
        if (level === 'INV') return mkSeries({ level: 'INV', ps: ctxPs, inversor: n, scb: 1, stringId: 1 });
        if (level === 'SCB') return mkSeries({ level: 'SCB', ps: ctxPs, inversor: ctxInv, scb: n, stringId: 1 });
        return mkSeries({ level: 'STRING', ps: ctxPs, inversor: ctxInv, scb: ctxScb, stringId: n });
    }), [level, ctxPs, ctxInv, ctxScb, selected]);

    const allSeries: UISeries[] = useMemo(() => {
        const m = new Map<string, UISeries>();
        [...frozen, ...liveSeries].forEach(s => m.set(s.id, s));
        return Array.from(m.values());
    }, [frozen, liveSeries]);

    const seriesKey = allSeries.map(s => s.id).join(',');
    const manySeries = allSeries.length > 8;

    const toggleSel = (n: number) => setSelected(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n].sort((a, b) => a - b));
    const selectAll = () => setSelected(finalOptions);
    const clearSel = () => setSelected([]);
    const freezeContext = () => { setFrozen(prev => { const m = new Map(prev.map(s => [s.id, s])); liveSeries.forEach(s => m.set(s.id, s)); return Array.from(m.values()); }); setSelected([]); };
    const resetAll = () => { setFrozen([]); setSelected([1]); };
    const removeFrozen = (id: string) => setFrozen(prev => prev.filter(s => s.id !== id));

    // Al cambiar de nivel, reiniciamos la selección
    useEffect(() => { setSelected([1]); }, [level]);

    // Búsqueda automática
    useEffect(() => {
        const range = presetRange(preset, customStart, customEnd);
        const hours = Math.max(1, Math.ceil((Date.now() - range.start.getTime()) / 3600000) + 1);
        const specs = allSeries.map(s => ({ id: s.id, level: s.level, ps: s.ps, inversor: s.inversor, scb: s.scb, stringId: s.stringId }));
        if (specs.length === 0) { setChartData([]); setHasData(false); return; }

        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await fetch('/api/history/series', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hours, variable, series: specs }),
                });
                const json = await res.json();
                const resp: { id: string; points: { ts: string; value: number }[] }[] = json.series || [];
                const map = new Map<string, any>();
                resp.forEach(r => r.points.forEach(p => {
                    const tms = new Date(p.ts).getTime();
                    if (tms < range.start.getTime() || tms > range.end.getTime()) return;
                    if (!map.has(p.ts)) map.set(p.ts, { ts: p.ts });
                    map.get(p.ts)[r.id] = p.value;
                }));
                if (showIrr) {
                    const psUnique = Array.from(new Set(allSeries.map(s => s.ps)));
                    const irrSpecs = psUnique.map(ps => ({ id: `irr_${ps}`, level: 'PS', ps }));
                    const res2 = await fetch('/api/history/series', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ hours, variable: 'irradiancia', series: irrSpecs }),
                    });
                    const json2 = await res2.json();
                    const irrByTs = new Map<string, { sum: number; n: number }>();
                    (json2.series || []).forEach((r: any) => r.points.forEach((p: any) => {
                        const e = irrByTs.get(p.ts) || { sum: 0, n: 0 }; e.sum += p.value; e.n += 1; irrByTs.set(p.ts, e);
                    }));
                    map.forEach((row, ts) => { const e = irrByTs.get(ts); if (e && e.n) row.__irr__ = e.sum / e.n; });
                }
                const merged = Array.from(map.values()).sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
                setChartData(merged); setHasData(merged.length > 0);
            } catch { setChartData([]); setHasData(false); } finally { setLoading(false); }
        }, 300);
        return () => clearTimeout(t);
    }, [seriesKey, variable, preset, customStart, customEnd, showIrr]);

    // --- INTELIGENCIA (Fase 3): pico/promedio/mínimo + correlación con el sol ---
    const insights = useMemo(() => {
        if (!chartData.length) return [];
        return allSeries.map(s => {
            const pts = chartData.filter(r => r[s.id] != null);
            if (!pts.length) return null;
            let max = -Infinity, maxTs = '', min = Infinity, sum = 0;
            const xs: number[] = [], ys: number[] = [];
            pts.forEach(r => {
                const v = r[s.id];
                if (v > max) { max = v; maxTs = r.ts; }
                if (v < min) min = v;
                sum += v;
                if (showIrr && r.__irr__ != null) { xs.push(v); ys.push(r.__irr__); }
            });
            const corr = showIrr ? pearson(xs, ys) : NaN;
            return { id: s.id, label: labelOf(s), max, maxTs, min, avg: sum / pts.length, corr };
        }).filter(Boolean) as { id: string; label: string; max: number; maxTs: string; min: number; avg: number; corr: number }[];
    }, [chartData, seriesKey, showIrr]);

    const fmtVal = (v: number) => (v == null ? '-' : v.toFixed(decimals));

    const exportCsv = () => {
        if (!chartData.length) return;
        const header = ['Tiempo', ...allSeries.map(labelOf), ...(showIrr ? ['Irradiancia (W/m2)'] : [])];
        const lines = [header.join(',')];
        chartData.forEach(row => {
            lines.push([
                format(new Date(row.ts), 'yyyy-MM-dd HH:mm'),
                ...allSeries.map(s => (row[s.id] != null ? row[s.id].toFixed(decimals) : '')),
                ...(showIrr ? [row.__irr__ != null ? row.__irr__.toFixed(0) : ''] : []),
            ].join(','));
        });
        saveAs(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `historial_${variable}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    };

    // Resumen en lenguaje natural (cuando hay una sola serie)
    const nlSummary = useMemo(() => {
        if (insights.length !== 1) return null;
        const it = insights[0];
        let s = `${it.label}: pico de ${it.max.toFixed(decimals)} ${varInfo.unit} a las ${it.maxTs ? format(new Date(it.maxTs), 'HH:mm') : '--'}, promedio ${it.avg.toFixed(decimals)} ${varInfo.unit}.`;
        if (showIrr && !isNaN(it.corr)) {
            const pct = Math.round(it.corr * 100);
            s += pct >= 90 ? ` Sigue muy bien al sol (correlación ${pct}%).`
                : pct >= 70 ? ` Sigue al sol de forma aceptable (${pct}%).`
                : ` Correlación baja con el sol (${pct}%) — posible bajo rendimiento.`;
        }
        return s;
    }, [insights, showIrr, variable]);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6">
                <Link href="/">
                    <button className="text-slate-400 hover:text-white flex items-center gap-2 text-sm border border-slate-800 rounded px-3 py-1.5 hover:bg-slate-900 transition-colors">
                        <ArrowLeft className="h-4 w-4" /> Volver
                    </button>
                </Link>
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                        <Activity className="h-6 w-6 text-blue-500" /> Historial Avanzado
                    </h1>
                    <p className="text-slate-500 text-sm">Compara y analiza por Power Station, inversor, SCB o string.</p>
                </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-4 mb-6">
                {/* Periodo */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold w-16">Periodo</span>
                    {PRESETS.map(p => (
                        <button key={p.key} onClick={() => setPreset(p.key)}
                            className={`px-3 py-1 text-xs rounded-full border transition-colors ${preset === p.key ? 'bg-blue-600 text-white border-blue-500' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}>{p.label}</button>
                    ))}
                    {preset === 'custom' && (
                        <div className="flex items-center gap-2 ml-2">
                            <input type="datetime-local" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:border-blue-500 outline-none" />
                            <span className="text-slate-600">→</span>
                            <input type="datetime-local" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:border-blue-500 outline-none" />
                        </div>
                    )}
                </div>

                {/* Nivel + contexto */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold w-16">Nivel</span>
                    {LEVELS.map(l => (
                        <button key={l.key} onClick={() => setLevel(l.key)}
                            className={`px-3 py-1 text-xs rounded-full border transition-colors ${level === l.key ? 'bg-emerald-600 text-white border-emerald-500' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}>{l.label}</button>
                    ))}
                    <div className="flex items-center gap-2 ml-2">
                        {level !== 'PS' && (
                            <select value={ctxPs} onChange={e => setCtxPs(e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:border-emerald-500 outline-none cursor-pointer">
                                {PS_LIST.map(ps => <option key={ps} value={ps}>{ps}</option>)}
                            </select>
                        )}
                        {(level === 'SCB' || level === 'STRING') && (
                            <select value={ctxInv} onChange={e => setCtxInv(Number(e.target.value))} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:border-emerald-500 outline-none cursor-pointer">
                                <option value={1}>Inv 1</option><option value={2}>Inv 2</option>
                            </select>
                        )}
                        {level === 'STRING' && (
                            <select value={ctxScb} onChange={e => setCtxScb(Number(e.target.value))} className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-300 focus:border-emerald-500 outline-none cursor-pointer">
                                {Array.from({ length: 18 }, (_, i) => i + 1).map(n => <option key={n} value={n}>SCB {n}</option>)}
                            </select>
                        )}
                    </div>
                </div>

                {/* Multi-select del nivel final */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold w-16">Elegir</span>
                    {finalOptions.map(n => (
                        <button key={n} onClick={() => toggleSel(n)}
                            className={`px-2 py-1 text-[11px] rounded border transition-colors min-w-[2rem] ${selected.includes(n) ? 'bg-emerald-700 text-white border-emerald-500' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}>{optLabel(n)}</button>
                    ))}
                    <button onClick={selectAll} className="px-2 py-1 text-[11px] rounded border border-slate-600 text-slate-300 hover:bg-slate-800 ml-1 inline-flex items-center gap-1"><Layers className="h-3 w-3" /> Todos</button>
                    <button onClick={clearSel} className="px-2 py-1 text-[11px] rounded border border-slate-700 text-slate-500 hover:bg-slate-800">Ninguno</button>
                </div>

                {/* Variable + irradiancia */}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold w-16">Variable</span>
                    {VARIABLES.map(v => (
                        <button key={v.key} onClick={() => setVariable(v.key)}
                            className={`px-3 py-1 text-xs rounded-full border transition-colors ${variable === v.key ? 'bg-amber-600 text-white border-amber-500' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}>{v.label} <span className="opacity-60">({v.unit})</span></button>
                    ))}
                    <button onClick={() => setShowIrr(v => !v)}
                        className={`inline-flex items-center gap-1 px-3 py-1 text-xs rounded-full border transition-colors ml-1 ${showIrr ? 'bg-yellow-500/20 text-yellow-400 border-yellow-600/50' : 'border-slate-700 text-slate-400 hover:bg-slate-800'}`}><Sun className="h-3.5 w-3.5" /> Irradiancia</button>
                </div>

                {/* Series fijadas + acciones */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/60">
                    <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold w-16">Comparar</span>
                    {frozen.length > 0 && !manySeries && frozen.map(s => (
                        <span key={s.id} className="inline-flex items-center gap-2 rounded-full pl-2 pr-1 py-1 text-xs border border-slate-700 bg-slate-800">
                            {labelOf(s)}
                            <button onClick={() => removeFrozen(s.id)} className="hover:text-rose-400 text-slate-500"><X className="h-3.5 w-3.5" /></button>
                        </span>
                    ))}
                    {manySeries && <span className="text-xs text-slate-400">{allSeries.length} series</span>}
                    <button onClick={freezeContext} disabled={liveSeries.length === 0}
                        className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs border border-dashed border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"><Plus className="h-3.5 w-3.5" /> Fijar y comparar otro</button>
                    {(frozen.length > 0) && <button onClick={resetAll} className="text-xs text-rose-400 hover:underline ml-1">limpiar todo</button>}
                </div>
            </div>

            {/* Toggle + export */}
            <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-slate-500 flex items-center gap-2">
                    {loading && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…</>}
                    {!loading && hasData && `${chartData.length} puntos · ${allSeries.length} serie(s)`}
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={exportCsv} disabled={!hasData} className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 flex items-center gap-1.5"><Download className="h-4 w-4" /> CSV</button>
                    <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
                        <button onClick={() => setTab('GRAFICO')} className={`px-3 py-1 text-xs rounded flex items-center gap-1.5 ${tab === 'GRAFICO' ? 'bg-slate-800 text-amber-400' : 'text-slate-400 hover:text-white'}`}><BarChart2 className="h-4 w-4" /> Gráfico</button>
                        <button onClick={() => setTab('DATOS')} className={`px-3 py-1 text-xs rounded flex items-center gap-1.5 ${tab === 'DATOS' ? 'bg-slate-800 text-blue-400' : 'text-slate-400 hover:text-white'}`}><List className="h-4 w-4" /> Datos</button>
                    </div>
                </div>
            </div>

            {/* Resumen NL */}
            {nlSummary && (
                <div className="mb-3 bg-slate-900/60 border border-slate-800 rounded-lg px-4 py-2.5 text-sm text-slate-300 flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" /> {nlSummary}
                </div>
            )}

            {/* Contenido */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                {!hasData && !loading ? (
                    <div className="h-80 flex flex-col items-center justify-center text-slate-500">
                        <Activity className="h-12 w-12 mb-3 opacity-20" />
                        <p className="text-sm">{allSeries.length === 0 ? 'Selecciona al menos un elemento.' : 'No hay datos para este rango.'}</p>
                    </div>
                ) : tab === 'GRAFICO' ? (
                    <div className="h-[26rem] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 10, right: showIrr ? 20 : 8, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                <XAxis dataKey="ts" stroke="#475569" fontSize={11} tickFormatter={(ts) => format(new Date(ts), 'dd/MM HH:mm')} minTickGap={50} />
                                <YAxis yAxisId="left" stroke="#475569" fontSize={11} width={48} label={{ value: varInfo.unit, angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
                                {showIrr && <YAxis yAxisId="right" orientation="right" stroke="#a16207" fontSize={11} width={44} label={{ value: 'W/m²', angle: 90, position: 'insideRight', fill: '#a16207', fontSize: 11 }} />}
                                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: 6, fontSize: 12 }} labelFormatter={(ts) => format(new Date(ts), 'dd/MM/yyyy HH:mm')} />
                                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                                {showIrr && <Area yAxisId="right" type="monotone" dataKey="__irr__" name="Irradiancia (W/m²)" fill="#fbbf24" fillOpacity={0.15} stroke="#fbbf24" strokeOpacity={0.5} strokeWidth={1} dot={false} connectNulls />}
                                {allSeries.map((s, idx) => (
                                    <Line key={s.id} yAxisId="left" type="monotone" dataKey={s.id} name={labelOf(s)} stroke={colorFor(idx)} strokeWidth={manySeries ? 1.3 : 2} dot={false} connectNulls />
                                ))}
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="max-h-[26rem] overflow-auto">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                            <thead className="sticky top-0 bg-slate-900"><tr className="border-b border-slate-800">
                                <th className="px-3 py-2 text-slate-400 font-bold">Tiempo</th>
                                {allSeries.map((s, idx) => <th key={s.id} className="px-3 py-2 text-right font-bold" style={{ color: colorFor(idx) }}>{labelOf(s)}</th>)}
                                {showIrr && <th className="px-3 py-2 text-right font-bold text-yellow-500">Irrad.</th>}
                            </tr></thead>
                            <tbody>
                                {chartData.map((row, i) => (
                                    <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/40">
                                        <td className="px-3 py-1.5 font-mono text-slate-400">{format(new Date(row.ts), 'dd/MM/yyyy HH:mm')}</td>
                                        {allSeries.map(s => <td key={s.id} className="px-3 py-1.5 text-right font-mono text-slate-300">{row[s.id] != null ? fmtVal(row[s.id]) : <span className="text-slate-700">-</span>}</td>)}
                                        {showIrr && <td className="px-3 py-1.5 text-right font-mono text-yellow-600/80">{row.__irr__ != null ? row.__irr__.toFixed(0) : '-'}</td>}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Panel de inteligencia */}
            {insights.length > 0 && (
                <div className="mt-4 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 mb-3"><Sparkles className="h-4 w-4 text-emerald-400" /> Análisis del periodo</h3>
                    <div className="overflow-auto max-h-72">
                        <table className="w-full text-left text-xs">
                            <thead className="text-slate-500 border-b border-slate-800">
                                <tr>
                                    <th className="px-2 py-1.5 font-bold">Serie</th>
                                    <th className="px-2 py-1.5 text-right font-bold">Pico ({varInfo.unit})</th>
                                    <th className="px-2 py-1.5 text-right font-bold">Hora pico</th>
                                    <th className="px-2 py-1.5 text-right font-bold">Promedio</th>
                                    <th className="px-2 py-1.5 text-right font-bold">Mínimo</th>
                                    {showIrr && <th className="px-2 py-1.5 text-right font-bold">Corr. sol</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {insights.map((it, idx) => {
                                    const pct = Math.round(it.corr * 100);
                                    const corrColor = isNaN(it.corr) ? 'text-slate-600' : pct >= 90 ? 'text-emerald-400' : pct >= 70 ? 'text-amber-400' : 'text-rose-400';
                                    return (
                                        <tr key={it.id} className="border-b border-slate-800/40">
                                            <td className="px-2 py-1.5 font-medium" style={{ color: colorFor(idx) }}>{it.label}</td>
                                            <td className="px-2 py-1.5 text-right font-mono text-slate-200">{it.max.toFixed(decimals)}</td>
                                            <td className="px-2 py-1.5 text-right font-mono text-slate-400">{it.maxTs ? format(new Date(it.maxTs), 'dd/MM HH:mm') : '--'}</td>
                                            <td className="px-2 py-1.5 text-right font-mono text-slate-300">{it.avg.toFixed(decimals)}</td>
                                            <td className="px-2 py-1.5 text-right font-mono text-slate-400">{it.min.toFixed(decimals)}</td>
                                            {showIrr && <td className={`px-2 py-1.5 text-right font-mono font-bold ${corrColor}`}>{isNaN(it.corr) ? '—' : `${pct}%`}</td>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {showIrr && <p className="text-[11px] text-slate-500 mt-2">Correlación con el sol: ≥90% buen seguimiento · 70–90% aceptable · &lt;70% posible bajo rendimiento (revisar suciedad/sombra/fallo).</p>}
                </div>
            )}
        </div>
    );
}
