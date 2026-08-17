'use client';

import Link from 'next/link';
import { AlertTriangle, WifiOff, Hand, Sun, Link2 } from 'lucide-react';
import { AlarmFlags } from '@/app/lib/tracker-config';

export interface TrackerData {
    id: string;
    ps: string;
    gateway: string;
    localIdx: number;
    globalNum: number;
    setpoint: number | null;
    position: number | null;
    manual_sp: number | null;
    mode: number | null; // 0=Auto, 1=Manual
    alarm_raw: number;
    alarms: AlarmFlags;
    has_alarm: boolean;
    ts: string | null;
    stale: boolean;
    online: boolean;
    bypass: boolean;
    bypassMaster: number | null;
    bypassMasterId: string | null;
}

const clampDeg = (d: number | null) => (typeof d === 'number' ? Math.max(-52, Math.min(52, d)) : 0);

export function TrackerCard({ t }: { t: TrackerData }) {
    const isManual = t.mode === 1;
    const pos = clampDeg(t.position);
    const sp = clampDeg(t.setpoint);
    // Se está moviendo si aún no alcanzó el setpoint (los trackers solo se mueven cada tanto).
    const moving = !t.stale && t.position != null && t.setpoint != null && Math.abs(t.position - t.setpoint) > 1;

    const stateColor = t.stale ? 'border-slate-800 bg-slate-900/40'
        : t.bypass ? 'border-indigo-700/60 bg-indigo-950/10'
        : t.has_alarm ? 'border-rose-700 bg-rose-950/20'
        : isManual ? 'border-amber-700/60 bg-amber-950/10'
        : 'border-slate-800 bg-slate-900/60 hover:border-emerald-700/60';

    // Color del panel: verde=OK(auto), amarillo=manual, rojo=error, índigo=bypass, gris=sin señal
    const panelColor = t.stale ? '#475569'
        : t.bypass ? '#818cf8'
        : t.has_alarm ? '#f87171'
        : isManual ? '#fbbf24'
        : '#22c55e';

    return (
        <Link href={`/trackers/${t.id}`}>
            <div className={`rounded-xl border p-3 transition-colors cursor-pointer ${stateColor}`}>
                {/* Cabecera */}
                <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-sm text-slate-200">Tracker {t.globalNum}</span>
                    {t.stale ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500"><WifiOff className="h-3 w-3" /> Sin señal</span>
                    ) : t.bypass ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-indigo-400"><Link2 className="h-3 w-3" /> Bypass T{t.bypassMaster ?? '?'}</span>
                    ) : t.has_alarm ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-rose-400"><AlertTriangle className="h-3 w-3 animate-pulse" /> Error</span>
                    ) : isManual ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400"><Hand className="h-3 w-3" /> Manual</span>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500"><Sun className="h-3 w-3" /> Auto</span>
                    )}
                </div>

                {/* Animación */}
                <svg viewBox="0 0 200 150" width="100%" height="118" className={t.stale ? 'opacity-50' : ''}>
                    {/* Arco de recorrido (-52 a la derecha, +52 a la izquierda) */}
                    <path d="M 53 64 A 55 55 0 0 1 147 64" fill="none" stroke="#1e293b" strokeWidth="9" />
                    {/* Pylon */}
                    <rect x="98" y="70" width="4" height="70" fill="#334155" />
                    {/* Objetivo GPS (punteado) — rotación invertida */}
                    {!t.stale && (
                        <g style={{ transformBox: 'view-box', transformOrigin: '100px 70px', transform: `rotate(${-sp}deg)`, transition: 'transform 0.8s ease' }}>
                            <line x1="62" y1="70" x2="138" y2="70" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 3" opacity="0.85" />
                        </g>
                    )}
                    {/* Posición real (sólido) — rotación invertida */}
                    <g style={{ transformBox: 'view-box', transformOrigin: '100px 70px', transform: `rotate(${-pos}deg)`, transition: 'transform 0.8s ease' }}>
                        <line x1="58" y1="70" x2="142" y2="70" stroke={panelColor} strokeWidth="6" strokeLinecap="round" />
                    </g>
                    {/* Pivote */}
                    <circle cx="100" cy="70" r="5" fill="#0f172a" stroke={t.has_alarm ? '#f87171' : '#94a3b8'} strokeWidth="1.5" />
                    {/* Eje/drive: hilos diagonales que corren cuando el tracker se está moviendo */}
                    <clipPath id={`shaft-${t.id}`}><rect x="76" y="135.5" width="48" height="7" rx="3.5" /></clipPath>
                    <rect x="76" y="135.5" width="48" height="7" rx="3.5" fill="#0f172a" stroke="#475569" strokeWidth="1" />
                    <g clipPath={`url(#shaft-${t.id})`}>
                        <g className={moving ? 'trk-shaft' : ''}>
                            {Array.from({ length: 12 }, (_, i) => 66 + i * 7).map((x) => (
                                <line key={x} x1={x} y1="135" x2={x + 4} y2="143" stroke="#94a3b8" strokeWidth="1.3" opacity={moving ? 0.9 : 0.45} />
                            ))}
                        </g>
                    </g>
                </svg>

                {/* Lecturas */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] mt-1">
                    <div className="text-slate-500">Real <span className="font-mono font-bold" style={{ color: panelColor }}>{t.position ?? '--'}°</span></div>
                    <div className="text-slate-500">GPS <span className="font-mono font-bold text-sky-400">{t.setpoint ?? '--'}°</span></div>
                    <div className="text-slate-500">Manual <span className="font-mono text-slate-400">{isManual && t.manual_sp != null ? `${t.manual_sp}°` : '— off'}</span></div>
                    <div className="text-slate-500">PLC <span className="font-mono text-slate-500">{t.gateway.replace('TRK_', '')}</span></div>
                </div>
            </div>
        </Link>
    );
}
