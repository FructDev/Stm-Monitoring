'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import {
    ArrowLeft, Gauge, Sun, Thermometer, Zap, TrendingDown, Download, Scissors, CalendarDays,
} from 'lucide-react';
import { HourlyChart } from '@/app/components/pr/HourlyChart';

interface PrInverter {
    ps: string; inverter: number; code: string;
    energyDcMwh: number; clipEnergyMwh: number; insolationKwhM2: number; tempPanelC: number | null;
    prDcDeg: number | null; prDcDegTemp: number | null; prDcRaw: number | null; prDcRawTemp: number | null;
    hasInsolation: boolean;
}
interface PrDay {
    fecha: string; completeness: number; spanHours: number; partialDay: boolean;
    insolationKwhM2: number; tempPanelC: number | null; cTemp: number;
    energyDcMwh: number; energyAcMwh: number | null;
    ppicoDegMW: number; eTeoRawMwh: number; eTeoDegMwh: number;
    prRaw: number | null; prRawTemp: number | null; prDeg: number | null; prDegTemp: number | null;
    prDcRaw: number; prDcRawTemp: number; prDcDeg: number; prDcDegTemp: number;
    energyEstimatedMwh: number; energyRealMwh: number | null; realIsDcProxy: boolean; lossPct: number | null;
}
interface PrLossBreakdown {
    estimatedMwh: number; realMwh: number; totalLossMwh: number;
    clippingMwh: number; offlineMwh: number; deadStringsMwh: number; curtailmentMwh: number;
    reliable: boolean;
}
interface PrResponse {
    from: string; to: string; latestDataDate: string;
    days: PrDay[]; inverters: PrInverter[]; config: Record<string, number>;
    lossBreakdown: PrLossBreakdown;
}

const pct = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);
const num = (v: number | null | undefined, d = 2) => (v == null ? '—' : v.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d }));
const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

type Preset = '1d' | '7d' | '30d' | 'custom';

export default function PrPage() {
    const qc = useQueryClient();
    const [preset, setPreset] = useState<Preset>('7d');
    const [range, setRange] = useState<{ from: string; to: string } | null>(null);
    const [invSort, setInvSort] = useState<'pr' | 'code' | 'clip'>('pr');

    const qs = range ? `?from=${range.from}&to=${range.to}` : '';
    const { data, isLoading } = useQuery({
        queryKey: ['pr', qs],
        queryFn: async () => {
            const res = await fetch(`/api/pr${qs}`);
            if (!res.ok) throw new Error('Error al cargar PR');
            return res.json() as Promise<PrResponse>;
        },
    });

    // Ancla = última fecha con datos (la aprende de la respuesta). Los presets se calculan sobre ella.
    const anchor = data?.latestDataDate || data?.to || new Date().toISOString().slice(0, 10);
    const from = range?.from ?? data?.from ?? '';
    const to = range?.to ?? data?.to ?? '';

    const applyPreset = (p: Preset) => {
        setPreset(p);
        if (p === '1d') setRange({ from: anchor, to: anchor });
        else if (p === '7d') setRange({ from: addDays(anchor, -6), to: anchor });
        else if (p === '30d') setRange({ from: addDays(anchor, -29), to: anchor });
        // 'custom' no cambia el rango; se edita con los inputs
    };

    const days = data?.days || [];
    const inverters = data?.inverters || [];
    const cfg = data?.config;

    // Resumen del período (sobre las totales, no promedios ingenuos)
    const summary = useMemo(() => {
        const s = { real: 0, dc: 0, insol: 0, eTeoDeg: 0, eTeoDegTemp: 0, estim: 0, tempW: 0, tempWden: 0, hasAc: false };
        for (const d of days) {
            // En días parciales la energía AC (24 h) no es comparable con la insolación capturada:
            // usamos la DC, que sale de la misma ventana. Así el resumen no se dispara.
            const real = (d.partialDay || d.energyAcMwh == null) ? d.energyDcMwh : d.energyAcMwh;
            s.real += real; s.dc += d.energyDcMwh; s.insol += d.insolationKwhM2;
            s.eTeoDeg += d.eTeoDegMwh; s.eTeoDegTemp += d.eTeoDegMwh * d.cTemp; s.estim += d.energyEstimatedMwh;
            if (d.energyAcMwh != null && !d.partialDay) s.hasAc = true;
            if (d.tempPanelC != null) { s.tempW += d.tempPanelC * d.insolationKwhM2; s.tempWden += d.insolationKwhM2; }
        }
        return {
            energyReal: s.real, energyDc: s.dc, insol: s.insol, estim: s.estim, hasAc: s.hasAc,
            temp: s.tempWden > 0 ? s.tempW / s.tempWden : null,
            pr: s.eTeoDeg > 0 ? s.real / s.eTeoDeg : null,
            prTemp: s.eTeoDegTemp > 0 ? s.real / s.eTeoDegTemp : null,
            loss: s.estim > 0 ? 1 - s.real / s.estim : null,
            clip: inverters.reduce((a, i) => a + i.clipEnergyMwh, 0),
        };
    }, [days, inverters]);

    const invSorted = useMemo(() => [...inverters].sort((a, b) => {
        if (invSort === 'code') return a.code.localeCompare(b.code);
        if (invSort === 'clip') return b.clipEnergyMwh - a.clipEnergyMwh;
        return (a.prDcDegTemp ?? 9) - (b.prDcDegTemp ?? 9);
    }), [inverters, invSort]);

    const saveEnergy = async (fecha: string, raw: string, prev: number | null) => {
        const kwh = Number(raw.replace(/[, ]/g, ''));
        if (!raw.trim() || !isFinite(kwh) || kwh < 0) return;
        if (prev != null && Math.round(prev * 1000) === Math.round(kwh)) return;
        try {
            const res = await fetch('/api/pr/energy', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fecha, ac_kwh: kwh }),
            });
            if (!res.ok) throw new Error();
            toast.success(`Energía del ${fecha} guardada`);
            await qc.invalidateQueries({ queryKey: ['pr'] });
        } catch { toast.error('No se pudo guardar'); }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 pb-20">
            {/* ---------- Cabecera ---------- */}
            <div className="flex items-center gap-3 mb-1">
                <Link href="/">
                    <button className="text-slate-400 hover:text-white flex items-center gap-1.5 text-sm rounded-lg px-2.5 py-1.5 hover:bg-slate-800/70 transition-colors">
                        <ArrowLeft className="h-4 w-4" /> Volver
                    </button>
                </Link>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                    <Gauge className="h-6 w-6 text-sky-400" /> PR / Producción
                </h1>
            </div>
            <p className="text-slate-500 text-sm mb-5 sm:ml-[4.5rem]">
                Performance Ratio, energía e insolación calculados del histórico.
                {cfg && <span className="ml-1 text-slate-600">
                    · Base {cfg.ppicoPlantMW} MWp · degradada {(cfg.ppicoPlantMW * Math.pow(1 - cfg.degradationRatePerYear, cfg.yearsInOperation)).toFixed(1)} MW ({cfg.yearsInOperation} años) · k {cfg.plantFactorK}
                </span>}
            </p>

            {/* ---------- Barra de rango (presets + custom + descarga) ---------- */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="inline-flex rounded-lg bg-slate-900 border border-slate-800 p-1">
                    {([['1d', 'Último día'], ['7d', '7 días'], ['30d', '30 días'], ['custom', 'Personalizado']] as [Preset, string][]).map(([p, label]) => (
                        <button key={p} onClick={() => applyPreset(p)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${preset === p ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {preset === 'custom' && (
                    <div className="flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
                        <CalendarDays className="h-4 w-4 text-slate-500" />
                        <input type="date" value={from} max={to} onChange={(e) => setRange({ from: e.target.value, to })}
                            className="bg-transparent text-slate-200 outline-none [color-scheme:dark]" />
                        <span className="text-slate-600">→</span>
                        <input type="date" value={to} min={from} max={anchor} onChange={(e) => setRange({ from, to: e.target.value })}
                            className="bg-transparent text-slate-200 outline-none [color-scheme:dark]" />
                    </div>
                )}

                <div className="text-xs text-slate-500 hidden sm:block">
                    {from && to ? (from === to ? from : `${from} → ${to}`) : ''}
                </div>

                <a href={`/api/pr/export?from=${from}&to=${to}`}
                    className="ml-auto inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors shadow">
                    <Download className="h-4 w-4" /> Descargar Excel
                </a>
            </div>

            {isLoading && !data ? (
                <div className="py-20 text-center text-slate-500">Calculando métricas…</div>
            ) : days.length === 0 ? (
                <EmptyState anchor={anchor} />
            ) : (
                <>
                    {/* ---------- Tarjetas de resumen ---------- */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
                        <StatCard highlight icon={<Gauge className="h-4 w-4" />} tone="sky" label="PR degrad. + temp."
                            value={pct(summary.prTemp)} sub={summary.hasAc ? '% · sobre energía AC medida' : '% · sobre energía DC*'} />
                        <StatCard icon={<Gauge className="h-4 w-4" />} tone="slate" label="PR c/degradación"
                            value={pct(summary.pr)} sub="% · sin corrección de temp." />
                        <StatCard icon={<Zap className="h-4 w-4" />} tone="emerald" label="Energía generada"
                            value={num(summary.energyReal, 1)} sub="MWh en el período" />
                        <StatCard icon={<Sun className="h-4 w-4" />} tone="amber" label="Insolación acumulada"
                            value={num(summary.insol, 2)} sub="kWh/m² en el período" />
                        <StatCard icon={<TrendingDown className="h-4 w-4" />} tone="rose" label="Pérdida vs estimada"
                            value={pct(summary.loss)} sub="% de la energía esperada" />
                        <StatCard icon={<Scissors className="h-4 w-4" />} tone="violet" label="Clipping estimado"
                            value={num(summary.clip, 1)} sub="MWh perdidos por diseño" />
                    </div>

                    {/* ---------- Desglose de pérdidas: ¿de quién es la culpa? ---------- */}
                    {data?.lossBreakdown && data.lossBreakdown.totalLossMwh > 0 && (
                        <div className="mb-8">
                            <SectionTitle icon={<TrendingDown className="h-5 w-5 text-rose-400" />} title="¿A qué se debe la pérdida?">
                                <span className="text-xs text-slate-500">
                                    Pérdida total del período: <b className="text-rose-400">{num(data.lossBreakdown.totalLossMwh, 1)} MWh</b>
                                </span>
                            </SectionTitle>
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                                <LossCard color="violet" label="Clipping (por diseño)" mwh={data.lossBreakdown.clippingMwh}
                                    total={data.lossBreakdown.totalLossMwh}
                                    hint={`Potencia DC del inversor por encima de su nominal de ${cfg?.inverterNominalAcMW ?? 3.8} MW AC. Es esperado: hay más paneles que inversores.`} />
                                <LossCard color="slate" label="Equipos fuera" mwh={data.lossBreakdown.offlineMwh}
                                    total={data.lossBreakdown.totalLossMwh}
                                    hint="Cajas SCB que no reportaron, estimadas con el rendimiento de las que sí lo hicieron." />
                                <LossCard color="rose" label="Strings caídos" mwh={data.lossBreakdown.deadStringsMwh}
                                    total={data.lossBreakdown.totalLossMwh}
                                    hint="Strings en ~0 A, valorizados con lo que rinde un string sano de la misma caja." />
                                <LossCard color="sky" label="Curtailment (estimado)" mwh={data.lossBreakdown.curtailmentMwh}
                                    total={data.lossBreakdown.totalLossMwh}
                                    hint="RESIDUAL: lo que no explican las otras tres causas. No se mide (no tenemos el registro), se infiere por descarte." />
                            </div>
                            {!data.lossBreakdown.reliable && (
                                <p className="text-[11px] text-amber-400/90 mt-2">
                                    ⚠ El rango tiene días de captura parcial — este desglose no es confiable. Necesita días completos del driver.
                                </p>
                            )}
                        </div>
                    )}

                    {/* ---------- Tabla diaria ---------- */}
                    <SectionTitle icon={<CalendarDays className="h-5 w-5 text-sky-400" />} title="Detalle diario">
                        <span className="text-xs text-slate-500">Cargá la energía AC medida en la última columna</span>
                    </SectionTitle>
                    <div className="border border-slate-800 rounded-xl overflow-hidden mb-2">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs whitespace-nowrap">
                                <thead className="bg-slate-900/80 text-slate-400">
                                    <tr>
                                        <Th className="text-left">Fecha</Th>
                                        <Th>Insolación<Unit>kWh/m²</Unit></Th>
                                        <Th>Temp. panel<Unit>°C</Unit></Th>
                                        <Th>Energía estimada<Unit>MWh</Unit></Th>
                                        <Th>Energía real<Unit>MWh</Unit></Th>
                                        <Th>Pérdida<Unit>%</Unit></Th>
                                        <Th className="border-l border-slate-800">PR base<Unit>%</Unit></Th>
                                        <Th>PR corr. temp.<Unit>%</Unit></Th>
                                        <Th>PR c/degradación<Unit>%</Unit></Th>
                                        <Th className="text-sky-300">PR degrad.+temp.<Unit>%</Unit></Th>
                                        <Th className="border-l border-slate-800 text-right">Energía AC medida<Unit>kWh — cargar</Unit></Th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {days.map((d) => {
                                        // En día parcial el PR AC no es comparable -> usamos el DC (misma ventana).
                                        const noAc = d.energyAcMwh == null || d.partialDay;
                                        return (
                                            <tr key={d.fecha} className="border-t border-slate-800/60 hover:bg-slate-900/40">
                                                <td className="px-3 py-2 font-mono text-slate-300 whitespace-nowrap">
                                                    {d.fecha}
                                                    {d.partialDay && (
                                                        <span title={`El driver solo capturó ${d.spanHours.toFixed(1)} h de este día. La energía AC de 24 h no es comparable con una insolación parcial, así que se muestra el PR DC.`}
                                                            className="ml-1.5 text-[9px] font-bold uppercase text-amber-400 bg-amber-950/40 border border-amber-800/50 rounded px-1 py-0.5 align-middle">
                                                            parcial {d.spanHours.toFixed(1)}h
                                                        </span>
                                                    )}
                                                </td>
                                                <Td className="text-amber-400">{num(d.insolationKwhM2)}</Td>
                                                <Td className="text-slate-400">{num(d.tempPanelC, 1)}</Td>
                                                <Td className="text-slate-300">{num(d.energyEstimatedMwh, 1)}</Td>
                                                <Td className={d.realIsDcProxy ? 'text-slate-500 italic' : 'text-emerald-400'}>{num(d.energyRealMwh, 1)}{d.realIsDcProxy && '*'}</Td>
                                                <Td className={(d.lossPct ?? 0) > 0.15 ? 'text-rose-400' : 'text-slate-300'}>{pct(d.lossPct)}</Td>
                                                <Td className="text-slate-300 border-l border-slate-800/60">{pct(noAc ? d.prDcRaw : d.prRaw)}</Td>
                                                <Td className="text-slate-300">{pct(noAc ? d.prDcRawTemp : d.prRawTemp)}</Td>
                                                <Td className="text-sky-300">{pct(noAc ? d.prDcDeg : d.prDeg)}</Td>
                                                <Td className="text-sky-400 font-bold">{pct(noAc ? d.prDcDegTemp : d.prDegTemp)}</Td>
                                                <td className="px-3 py-1.5 text-right border-l border-slate-800/60">
                                                    <input type="text" inputMode="decimal"
                                                        placeholder="—"
                                                        defaultValue={d.energyAcMwh != null ? String(Math.round(d.energyAcMwh * 1000)) : ''}
                                                        onBlur={(e) => saveEnergy(d.fecha, e.target.value, d.energyAcMwh)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                        className="w-28 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-right font-mono text-slate-200 focus:border-sky-600 outline-none" />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-600 mb-8">
                        * Sin energía AC cargada, "Real" y los PR usan la <b>energía DC reconstruida</b>.
                        La etiqueta <b className="text-amber-400">parcial</b> marca días donde el driver no cubrió la jornada completa:
                        ahí la energía AC (24 h) <b>no</b> es comparable con una insolación de solo unas horas, así que se muestra el <b>PR DC</b>
                        (energía e insolación de la misma ventana). Para un PR AC válido, el driver debe correr el día entero.
                    </p>

                    {/* ---------- PR por inversor ---------- */}
                    <SectionTitle icon={<Zap className="h-5 w-5 text-sky-400" />} title={`PR por inversor (${inverters.length})`}>
                        <div className="flex items-center gap-2 text-xs ml-auto">
                            {summary.clip > 0.05 && <span className="text-violet-400">Clipping: <b>{num(summary.clip, 1)} MWh</b></span>}
                            <select value={invSort} onChange={(e) => setInvSort(e.target.value as typeof invSort)}
                                className="bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-slate-200 outline-none">
                                <option value="pr">Peor PR primero</option>
                                <option value="code">Por código</option>
                                <option value="clip">Más clipping</option>
                            </select>
                        </div>
                    </SectionTitle>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 mb-2">
                        {invSorted.map((v) => {
                            const pr = v.prDcDegTemp;
                            const tone = pr == null ? 'bg-slate-700' : pr >= 0.7 ? 'bg-emerald-500' : pr >= 0.55 ? 'bg-amber-500' : 'bg-rose-500';
                            return (
                                <div key={v.code} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 min-w-0">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="font-mono font-bold text-slate-200 text-sm truncate">Inv {v.code}</span>
                                        <span className={`font-mono font-bold text-sm shrink-0 ${pr == null ? 'text-slate-500' : pr >= 0.7 ? 'text-emerald-400' : pr >= 0.55 ? 'text-amber-400' : 'text-rose-400'}`}>
                                            {v.hasInsolation ? pct(pr) : 'N/D'}
                                        </span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mb-2.5">
                                        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, (pr ?? 0) * 100)}%` }} />
                                    </div>
                                    <div className="flex justify-between gap-2 text-[10px] text-slate-500 font-mono">
                                        <span className="truncate">{num(v.energyDcMwh, 1)} MWh DC</span>
                                        {v.clipEnergyMwh > 0.05 && <span className="text-violet-400 shrink-0">clip {num(v.clipEnergyMwh, 1)}</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-slate-600 mb-8">
                        PR por inversor sobre <b>energía DC</b> (no hay medidor AC por inversor). "N/D" = falta irradiancia de esa PS. Clipping = <b>estimado</b>.
                    </p>

                    {/* ---------- Curva horaria ---------- */}
                    <HourlyChart defaultDate={to} />
                </>
            )}
        </div>
    );
}

/* ---------- Subcomponentes ---------- */

function StatCard({ icon, label, value, sub, tone, highlight }: {
    icon: React.ReactNode; label: string; value: string; sub?: string;
    tone: 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate'; highlight?: boolean;
}) {
    const tones: Record<string, string> = {
        sky: 'text-sky-400', emerald: 'text-emerald-400', amber: 'text-amber-400',
        rose: 'text-rose-400', violet: 'text-violet-400', slate: 'text-slate-300',
    };
    return (
        <div className={`rounded-xl border p-4 min-w-0 ${highlight ? 'border-sky-700/50 bg-sky-950/20' : 'border-slate-800 bg-slate-900/50'}`}>
            <div className={`flex items-start gap-1.5 text-[10px] uppercase font-bold mb-2 ${tones[tone]}`}>
                <span className="shrink-0 mt-px">{icon}</span>
                <span className="text-slate-400 leading-tight break-words min-w-0">{label}</span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-white leading-tight break-words">{value}</div>
            {sub && <div className="text-[10px] text-slate-500 mt-1.5 leading-snug break-words">{sub}</div>}
        </div>
    );
}

function LossCard({ color, label, mwh, total, hint }: {
    color: 'violet' | 'slate' | 'rose' | 'sky'; label: string; mwh: number; total: number; hint: string;
}) {
    const pctOfTotal = total > 0 ? (mwh / total) * 100 : 0;
    const tone: Record<string, { text: string; bar: string; border: string }> = {
        violet: { text: 'text-violet-400', bar: 'bg-violet-500', border: 'border-violet-800/40' },
        slate: { text: 'text-slate-300', bar: 'bg-slate-500', border: 'border-slate-700/50' },
        rose: { text: 'text-rose-400', bar: 'bg-rose-500', border: 'border-rose-800/40' },
        sky: { text: 'text-sky-400', bar: 'bg-sky-500', border: 'border-sky-800/40' },
    };
    const t = tone[color];
    return (
        <div className={`rounded-xl border ${t.border} bg-slate-900/50 p-4 min-w-0`} title={hint}>
            <div className="text-[10px] uppercase font-bold text-slate-400 mb-2 leading-tight break-words">{label}</div>
            <div className={`text-xl sm:text-2xl font-black font-mono ${t.text} leading-tight break-words`}>
                {mwh.toLocaleString('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <span className="text-xs font-normal text-slate-500 ml-1">MWh</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden my-2.5">
                <div className={`h-full ${t.bar}`} style={{ width: `${Math.min(100, pctOfTotal)}%` }} />
            </div>
            <div className="text-[10px] text-slate-500 leading-snug">{pctOfTotal.toFixed(0)}% de la pérdida total</div>
        </div>
    );
}

function SectionTitle({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">{icon}{title}</h2>
            {children}
        </div>
    );
}

function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
    return <th className={`px-3 py-2.5 font-semibold text-right align-bottom ${className}`}>{children}</th>;
}
/** Unidad de medida bajo el nombre de la columna. */
function Unit({ children }: { children: React.ReactNode }) {
    return <><br /><span className="font-normal text-[9px] text-slate-500 normal-case">{children}</span></>;
}
function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
    return <td className={`px-3 py-2 text-right font-mono ${className}`}>{children}</td>;
}

function EmptyState({ anchor }: { anchor: string }) {
    return (
        <div className="border border-dashed border-slate-800 rounded-xl py-16 px-6 text-center">
            <Sun className="h-10 w-10 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-300 font-semibold mb-1">Sin datos en este rango</p>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
                El último día con datos es <b className="text-slate-300 font-mono">{anchor}</b>. Elegí un rango que lo incluya,
                o verificá que el driver esté historizando (la insolación viene de <code className="text-slate-400">meteo_historico_5m</code>).
            </p>
        </div>
    );
}
