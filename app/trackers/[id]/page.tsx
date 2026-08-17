'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, AlertTriangle, Hand, Sun, WifiOff, Send, Link2, Clock3, CheckCircle2, XCircle } from 'lucide-react';
import { TrackerData } from '@/app/components/trackers/TrackerCard';
import { ALARM_LABELS, TRACKER_MIN_DEG, TRACKER_MAX_DEG, AlarmFlags } from '@/app/lib/tracker-config';

const clampDeg = (d: number | null) => (typeof d === 'number' ? Math.max(-52, Math.min(52, d)) : 0);

const fetchTrackers = async () => {
    const res = await fetch('/api/trackers');
    if (!res.ok) throw new Error('Error');
    return res.json() as Promise<{ trackers: TrackerData[] }>;
};

interface TrackerCommandAudit {
    id: number;
    command_type: string;
    requested_mode: number | null;
    requested_setpoint_deg: number | null;
    requested_at: string;
    status: 'SENDING' | 'ACCEPTED' | 'VERIFIED' | 'MISMATCH' | 'FAILED' | 'TIMEOUT';
    driver_message: string | null;
    observed_mode: number | null;
    observed_setpoint_deg: number | null;
    observed_at: string | null;
}

export default function TrackerDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;
    const qc = useQueryClient();

    const { data } = useQuery({ queryKey: ['trackers'], queryFn: fetchTrackers, refetchInterval: 3000 });
    const t = data?.trackers.find((x) => x.id === id);
    const { data: commandData } = useQuery({
        queryKey: ['tracker-commands', t?.gateway, t?.localIdx],
        queryFn: async () => {
            if (!t) return { commands: [] as TrackerCommandAudit[] };
            const response = await fetch(`/api/trackers/commands?gateway=${encodeURIComponent(t.gateway)}&tracker_idx=${t.localIdx}&limit=5`, { cache: 'no-store' });
            if (!response.ok) throw new Error('No se pudo leer la auditoría');
            return response.json() as Promise<{ commands: TrackerCommandAudit[] }>;
        },
        enabled: !!t,
        refetchInterval: 3000,
    });

    const [sp, setSp] = useState<number>(0);
    const [confirming, setConfirming] = useState<null | 'setpoint' | 'manual' | 'auto'>(null);
    const [busy, setBusy] = useState(false);
    const [bypassSel, setBypassSel] = useState<number | ''>('');

    if (!t) {
        return <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">Cargando tracker {id}…</div>;
    }

    const isManual = t.mode === 1;
    const pos = clampDeg(t.position);
    const gps = clampDeg(t.setpoint);
    const panelColor = t.stale ? '#475569' : t.bypass ? '#818cf8' : t.has_alarm ? '#f87171' : isManual ? '#fbbf24' : '#22c55e';
    const moving = !t.stale && t.position != null && t.setpoint != null && Math.abs(t.position - t.setpoint) > 1;

    const send = async (payload: any, okMsg: string) => {
        setBusy(true);
        try {
            const res = await fetch('/api/trackers/setpoint', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gateway: t.gateway, tracker_idx: t.localIdx, ...payload }),
            });
            const json = await res.json();
            if (res.ok && json.status === 'success') {
                toast.success(`${okMsg}. Escritura aceptada; esperando confirmación del PLC.`);
                await qc.invalidateQueries({ queryKey: ['trackers'] });
                await qc.invalidateQueries({ queryKey: ['tracker-commands', t.gateway, t.localIdx] });
            } else {
                toast.error(`Error: ${json.message || 'no se pudo enviar'}`);
            }
        } catch {
            toast.error('No se pudo contactar al driver.');
        } finally {
            setBusy(false);
            setConfirming(null);
        }
    };

    // "fuera de setpoint" no es falla (es estar moviéndose); no lo listamos como alarma roja.
    const activeAlarms = (Object.keys(t.alarms) as (keyof AlarmFlags)[]).filter((k) => t.alarms[k] && k !== 'not_at_setpoint');

    // Maestros candidatos: trackers sanos de la misma PS
    const masterOptions = (data?.trackers || [])
        .filter((x) => x.ps === t.ps && x.globalNum !== t.globalNum && !x.bypass)
        .map((x) => x.globalNum)
        .sort((a, b) => a - b);

    const setBypass = async (masterGlobalNum: number) => {
        setBusy(true);
        try {
            const res = await fetch('/api/trackers/bypass', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slave_key: `${t.ps}-${t.globalNum}`, master_key: `${t.ps}-${masterGlobalNum}` }),
            });
            if (res.ok) { toast.success(`Tracker ${t.globalNum} en bypass con T${masterGlobalNum}`); setBypassSel(''); await qc.invalidateQueries({ queryKey: ['trackers'] }); }
            else toast.error('No se pudo poner en bypass');
        } catch { toast.error('Error de red'); } finally { setBusy(false); }
    };

    const removeBypass = async () => {
        setBusy(true);
        try {
            const res = await fetch('/api/trackers/bypass', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slave_key: `${t.ps}-${t.globalNum}` }),
            });
            if (res.ok) { toast.success(`Tracker ${t.globalNum} normalizado`); await qc.invalidateQueries({ queryKey: ['trackers'] }); }
            else toast.error('No se pudo normalizar');
        } catch { toast.error('Error de red'); } finally { setBusy(false); }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6">
                {/* "Atrás" del navegador (no un Link nuevo) para restaurar la posición de scroll
                    donde estabas en la lista. Con fallback a /trackers si no hay historial (deep link). */}
                <button
                    onClick={() => {
                        if (typeof window !== 'undefined' && window.history.length > 1) router.back();
                        else router.push('/trackers');
                    }}
                    className="text-slate-400 hover:text-white flex items-center gap-2 text-sm border border-slate-800 rounded px-3 py-1.5 hover:bg-slate-900 transition-colors"
                >
                    <ArrowLeft className="h-4 w-4" /> Trackers
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                        {t.ps} · Tracker {t.globalNum}
                        {t.stale ? <span className="text-xs text-slate-500 inline-flex items-center gap-1"><WifiOff className="h-4 w-4" /> Sin señal</span>
                            : t.bypass ? <span className="text-xs text-indigo-400 inline-flex items-center gap-1"><Link2 className="h-4 w-4" /> Bypass con T{t.bypassMaster ?? '?'}</span>
                            : t.has_alarm ? <span className="text-xs text-rose-400 inline-flex items-center gap-1"><AlertTriangle className="h-4 w-4 animate-pulse" /> Error</span>
                            : isManual ? <span className="text-xs text-amber-400 inline-flex items-center gap-1"><Hand className="h-4 w-4" /> Manual</span>
                            : <span className="text-xs text-emerald-500 inline-flex items-center gap-1"><Sun className="h-4 w-4" /> Auto</span>}
                    </h1>
                    <p className="text-slate-500 text-sm">PLC {t.gateway} · índice local {t.localIdx}</p>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* Animación grande + lecturas */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                    <svg viewBox="0 0 300 200" width="100%" height="220" className={t.stale ? 'opacity-50' : ''}>
                        <path d="M 70 95 A 80 80 0 0 1 230 95" fill="none" stroke="#1e293b" strokeWidth="10" />
                        {/* Etiquetas: +52 a la izquierda, -52 a la derecha (como se ve en sitio) */}
                        <text x="66" y="110" fontSize="10" fill="#475569">+52°</text>
                        <text x="222" y="110" fontSize="10" fill="#475569">-52°</text>
                        <text x="143" y="34" fontSize="10" fill="#475569">0°</text>
                        <rect x="147" y="100" width="6" height="90" fill="#334155" />
                        {!t.stale && (
                            <g style={{ transformBox: 'view-box', transformOrigin: '150px 100px', transform: `rotate(${-gps}deg)`, transition: 'transform 0.8s ease' }}>
                                <line x1="88" y1="100" x2="212" y2="100" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="5 4" opacity="0.85" />
                            </g>
                        )}
                        <g style={{ transformBox: 'view-box', transformOrigin: '150px 100px', transform: `rotate(${-pos}deg)`, transition: 'transform 0.8s ease' }}>
                            <line x1="82" y1="100" x2="218" y2="100" stroke={panelColor} strokeWidth="8" strokeLinecap="round" />
                        </g>
                        <circle cx="150" cy="100" r="7" fill="#0f172a" stroke={t.has_alarm ? '#f87171' : '#94a3b8'} strokeWidth="2" />
                        {/* Eje/drive: hilos diagonales que corren cuando el tracker se está moviendo */}
                        <clipPath id="shaft-detail"><rect x="116" y="182" width="68" height="8" rx="4" /></clipPath>
                        <rect x="116" y="182" width="68" height="8" rx="4" fill="#0f172a" stroke="#475569" strokeWidth="1" />
                        <g clipPath="url(#shaft-detail)">
                            <g className={moving ? 'trk-shaft' : ''}>
                                {Array.from({ length: 14 }, (_, i) => 106 + i * 7).map((x) => (
                                    <line key={x} x1={x} y1="181" x2={x + 5} y2="191" stroke="#94a3b8" strokeWidth="1.5" opacity={moving ? 0.9 : 0.45} />
                                ))}
                            </g>
                        </g>
                        {moving && <text x="150" y="176" fontSize="9" fill="#34d399" textAnchor="middle">moviéndose</text>}
                    </svg>
                    <div className="flex justify-center gap-5 text-xs mt-1">
                        <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-1 bg-amber-400 rounded"></span>Real {t.position ?? '--'}°</span>
                        <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-0.5 border-t-2 border-dashed border-sky-400"></span>GPS {t.setpoint ?? '--'}°</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                        <Metric label="Posición real" value={t.position != null ? `${t.position}°` : '--'} />
                        <Metric label="Setpoint GPS" value={t.setpoint != null ? `${t.setpoint}°` : '--'} />
                        <Metric label="Setpoint manual" value={t.manual_sp != null ? `${t.manual_sp}°` : '--'} />
                        <Metric label="Modo" value={isManual ? 'Manual' : 'Auto'} />
                    </div>
                </div>

                {/* Estado/errores + control */}
                <div className="space-y-6">
                    <CommandVerification command={commandData?.commands?.[0]} />

                    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                        <h3 className="text-sm font-bold text-slate-300 mb-3">Estado y alarmas</h3>
                        {t.stale ? (
                            <p className="text-sm text-slate-500">Sin lectura reciente del PLC.</p>
                        ) : t.bypass ? (
                            <p className="text-sm text-indigo-300 flex items-center gap-2">
                                <Link2 className="h-4 w-4 text-indigo-400" />
                                En bypass/paralelo con el Tracker {t.bypassMaster ?? '?'} (encoder dañado, en espera de repuesto). Sigue su posición; alarma de encoder silenciada.
                            </p>
                        ) : activeAlarms.length === 0 ? (
                            <p className="text-sm text-emerald-400">Sin alarmas activas.</p>
                        ) : (
                            <ul className="space-y-1.5">
                                {activeAlarms.map((k) => (
                                    <li key={k} className="flex items-center gap-2 text-sm text-rose-300">
                                        <AlertTriangle className="h-4 w-4 text-rose-500" /> {ALARM_LABELS[k]}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Bypass: el control se redirige al tracker maestro */}
                    {t.bypass && (
                        <div className="bg-slate-900/60 border border-indigo-800/50 rounded-xl p-5">
                            <h3 className="text-sm font-bold text-indigo-400 mb-1 flex items-center gap-2"><Link2 className="h-4 w-4" /> Tracker en bypass</h3>
                            <p className="text-xs text-slate-400 mb-4">Encoder dañado: se mueve en paralelo con el <span className="text-indigo-300 font-bold">Tracker {t.bypassMaster}</span>. Para cambiar su posición, controlá el tracker maestro.</p>
                            {t.bypassMasterId && (
                                <Link href={`/trackers/${t.bypassMasterId}`}>
                                    <button className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-indigo-600/20 border border-indigo-600/50 text-indigo-300 hover:bg-indigo-600/30">
                                        <Hand className="h-4 w-4" /> Controlar Tracker {t.bypassMaster} (maestro)
                                    </button>
                                </Link>
                            )}
                        </div>
                    )}

                    {/* Control manual (solo si NO está en bypass) */}
                    {!t.bypass && (
                    <div className="bg-slate-900/60 border border-amber-900/40 rounded-xl p-5">
                        <h3 className="text-sm font-bold text-amber-400 mb-1 flex items-center gap-2"><Hand className="h-4 w-4" /> Control manual</h3>
                        <p className="text-xs text-slate-500 mb-4">Comanda hardware real. Rango {TRACKER_MIN_DEG}° a {TRACKER_MAX_DEG}°.</p>

                        {/* Modo */}
                        <div className="flex items-center gap-2 mb-4">
                            <button disabled={busy} onClick={() => setConfirming('manual')}
                                className={`px-3 py-1.5 text-xs rounded-lg border ${isManual ? 'bg-amber-600 text-white border-amber-500' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
                                Pasar a Manual
                            </button>
                            <button disabled={busy} onClick={() => setConfirming('auto')}
                                className={`px-3 py-1.5 text-xs rounded-lg border ${!isManual ? 'bg-emerald-600 text-white border-emerald-500' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
                                Volver a Auto
                            </button>
                        </div>

                        {/* Setpoint */}
                        <div className="flex items-center gap-3 mb-3">
                            <input type="range" min={TRACKER_MIN_DEG} max={TRACKER_MAX_DEG} step={1} value={sp}
                                onChange={(e) => setSp(Number(e.target.value))} className="flex-1 accent-amber-500" />
                            <input type="number" min={TRACKER_MIN_DEG} max={TRACKER_MAX_DEG} value={sp}
                                onChange={(e) => setSp(Math.max(TRACKER_MIN_DEG, Math.min(TRACKER_MAX_DEG, Number(e.target.value))))}
                                className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-amber-400 font-mono text-center focus:border-amber-500 outline-none" />
                            <span className="text-xs text-slate-500">grados</span>
                        </div>
                        <button disabled={busy} onClick={() => setConfirming('setpoint')}
                            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg bg-amber-600/20 border border-amber-600/50 text-amber-300 hover:bg-amber-600/30 disabled:opacity-40">
                            <Send className="h-4 w-4" /> Enviar setpoint {sp}° (modo Manual)
                        </button>

                        {/* Confirmación */}
                        {confirming && (
                            <div className="mt-4 bg-slate-950 border border-amber-700/50 rounded-lg p-3">
                                <p className="text-xs text-amber-200 mb-3">
                                    {confirming === 'setpoint' && `¿Confirmas mover el Tracker ${t.globalNum} a ${sp}° (manual)? Esto mueve el equipo físico.`}
                                    {confirming === 'manual' && `¿Pasar el Tracker ${t.globalNum} a modo MANUAL?`}
                                    {confirming === 'auto' && `¿Devolver el Tracker ${t.globalNum} a modo AUTO (seguimiento GPS)?`}
                                </p>
                                <div className="flex gap-2">
                                    <button disabled={busy} onClick={() => {
                                        if (confirming === 'setpoint') send({ mode: 1, manual_setpoint: sp }, `Tracker ${t.globalNum} → ${sp}° (manual)`);
                                        else if (confirming === 'manual') send({ mode: 1 }, `Tracker ${t.globalNum} en modo Manual`);
                                        else send({ mode: 0 }, `Tracker ${t.globalNum} en modo Auto`);
                                    }} className="px-3 py-1.5 text-xs rounded bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-40">Confirmar</button>
                                    <button disabled={busy} onClick={() => setConfirming(null)} className="px-3 py-1.5 text-xs rounded border border-slate-700 text-slate-300 hover:bg-slate-800">Cancelar</button>
                                </div>
                            </div>
                        )}
                    </div>
                    )}

                    {/* Gestión de bypass (mantenimiento, sin tocar código) */}
                    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                        <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2"><Link2 className="h-4 w-4 text-indigo-400" /> Bypass / paralelo</h3>
                        {t.bypass ? (
                            <>
                                <p className="text-xs text-slate-400 mb-3">En bypass con el <span className="text-indigo-300 font-bold">Tracker {t.bypassMaster}</span>.</p>
                                <button onClick={removeBypass} disabled={busy} className="w-full px-3 py-2 text-sm rounded-lg bg-emerald-600/20 border border-emerald-600/50 text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40">
                                    Encoder reparado → Normalizar
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-xs text-slate-400 mb-3">Si su encoder se dañó, ponelo en paralelo con un tracker sano de la misma PS.</p>
                                <div className="flex items-center gap-2">
                                    <select value={bypassSel} onChange={(e) => setBypassSel(e.target.value === '' ? '' : Number(e.target.value))}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-300 outline-none focus:border-indigo-500">
                                        <option value="">Elegir maestro…</option>
                                        {masterOptions.map((m) => <option key={m} value={m}>Tracker {m}</option>)}
                                    </select>
                                    <button onClick={() => bypassSel !== '' && setBypass(bypassSel)} disabled={busy || bypassSel === ''}
                                        className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600/20 border border-indigo-600/50 text-indigo-300 hover:bg-indigo-600/30 disabled:opacity-40">
                                        Poner en bypass
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function CommandVerification({ command }: { command?: TrackerCommandAudit }) {
    if (!command) {
        return (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-500">
                Sin comandos registrados para este tracker.
            </div>
        );
    }

    const verified = command.status === 'VERIFIED';
    const pending = command.status === 'SENDING' || command.status === 'ACCEPTED';
    const Icon = verified ? CheckCircle2 : pending ? Clock3 : XCircle;
    const color = verified ? 'text-emerald-400 border-emerald-900/50' : pending ? 'text-cyan-400 border-cyan-900/50' : 'text-rose-400 border-rose-900/50';
    const requested = command.requested_setpoint_deg !== null
        ? `Manual ${command.requested_setpoint_deg}°`
        : command.requested_mode === 1 ? 'Modo Manual' : 'Modo Auto';
    const statusLabel: Record<TrackerCommandAudit['status'], string> = {
        SENDING: 'Enviando',
        ACCEPTED: 'Aceptado · esperando lectura',
        VERIFIED: 'Verificado en PLC',
        MISMATCH: 'La lectura no coincide',
        FAILED: 'Escritura fallida',
        TIMEOUT: 'Sin confirmación',
    };

    return (
        <div className={`rounded-xl border bg-slate-900/60 p-4 ${color}`}>
            <div className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${pending ? 'animate-pulse' : ''}`} />
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide">Último comando · {statusLabel[command.status]}</p>
                    <p className="mt-1 text-sm text-slate-200">Solicitado: {requested}</p>
                    {command.observed_at && (
                        <p className="mt-1 text-xs text-slate-500">
                            Observado: modo {command.observed_mode === 1 ? 'Manual' : 'Auto'}
                            {command.observed_setpoint_deg !== null ? ` · ${command.observed_setpoint_deg}°` : ''}
                        </p>
                    )}
                    {command.driver_message && <p className="mt-1 break-words text-xs text-rose-300">{command.driver_message}</p>}
                </div>
            </div>
        </div>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800/50">
            <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
            <div className="text-lg font-bold font-mono text-slate-100">{value}</div>
        </div>
    );
}
