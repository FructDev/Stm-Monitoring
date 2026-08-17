'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { HeartPulse, CloudRain, Activity, Send, SunMedium, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHealthThreshold } from '@/app/hooks/useHealthThreshold';
import { useCurtailment, CURTAILMENT_THRESHOLD_MW } from '@/app/hooks/useCurtailment';

export function Header({ lastUpdate }: { lastUpdate?: string }) {
    const { threshold, setThreshold } = useHealthThreshold();
    const { limitMW, setLimitMW } = useCurtailment();
    const [localMw, setLocalMw] = useState<number | string>(limitMW);

    // Envía el límite al driver. silent=true para la sincronización automática al cargar
    // (sin toasts molestos); el envío manual sí notifica éxito/error.
    const sendCurtailment = async (val: number, opts?: { silent?: boolean }) => {
        const payload = (val >= CURTAILMENT_THRESHOLD_MW || val <= 0) ? { limit_mw: null } : { limit_mw: val };
        try {
            const res = await fetch('/api/curtailment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            if (!opts?.silent) {
                toast.success(
                    payload.limit_mw === null
                        ? 'Curtailment desactivado (planta a capacidad nominal).'
                        : `Límite SENI enviado al driver: ${val} MW.`
                );
            }
            return true;
        } catch (error) {
            console.error("Failed to commit Curtailment", error);
            if (!opts?.silent) {
                toast.error('No se pudo enviar el límite al driver. Verifica que el backend esté corriendo.');
            }
            return false;
        }
    };

    const applyCurtailment = async () => {
        const val = Number(localMw);
        setLimitMW(val);
        await sendCurtailment(val);
    };

    // Sincronización al cargar: si había un límite de curtailment persistido, lo reenvía al
    // driver (que pudo haberse reiniciado y perdido el valor). Silencioso para no molestar.
    useEffect(() => {
        if (limitMW > 0 && limitMW < CURTAILMENT_THRESHOLD_MW) {
            sendCurtailment(limitMW, { silent: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    const navItems = [
        { href: '/admin/health', icon: HeartPulse, label: 'System Health', hover: 'hover:text-emerald-400' },
        { href: '/admin/meteo', icon: CloudRain, label: 'Meteorología', hover: 'hover:text-cyan-400' },
        { href: '/admin/history', icon: Activity, label: 'Historial Avanzado', hover: 'hover:text-blue-400' },
        { href: '/trackers', icon: SunMedium, label: 'Trackers', hover: 'hover:text-amber-400' },
        { href: '/pr', icon: Gauge, label: 'PR / Producción', hover: 'hover:text-sky-400' },
    ];

    return (
        <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur supports-[backdrop-filter]:bg-slate-900/50 sticky top-0 z-50">
            <div className="container mx-auto px-4">
                {/* Fila superior: logo + controles */}
                <div className="h-16 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 shrink-0">
                            <SunflowerIcon className="h-6 w-6" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="font-bold text-base sm:text-lg tracking-tight truncate">Girasol SCBs monitoring system</h1>
                            <p className="text-xs text-slate-400">v2.0</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                        {/* Alarma Crítica Slider */}
                        <div className="flex-col items-end mr-2 hidden lg:flex bg-slate-800/40 p-1.5 rounded-md border border-slate-700/50">
                            <div className="text-[9px] text-slate-400 uppercase font-bold mb-1 tracking-wider">
                                Umbral Daño Severo
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min="0" max="100"
                                    value={threshold}
                                    onChange={(e) => setThreshold(Number(e.target.value))}
                                    className="w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-red-500"
                                />
                                <span className="text-[11px] font-bold text-red-400 font-mono w-8 text-right">&lt;{threshold}%</span>
                            </div>
                        </div>

                        {/* Control de Curtailment MW */}
                        <div className="flex-col items-center justify-center mr-4 hidden lg:flex bg-amber-500/10 p-1.5 px-3 rounded-md border border-amber-500/20">
                            <div className="text-[9px] text-amber-500/80 uppercase font-bold mb-1 tracking-wider" title="Si el límite es menor a 119 MW, el sistema silenciará las falsas alarmas de bajo amperaje por curtailment">
                                SENI (MW Max)
                            </div>
                            <div className="flex items-center gap-1">
                                <input
                                    type="number"
                                    min="0" max="150"
                                    value={localMw}
                                    onChange={(e) => setLocalMw(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && applyCurtailment()}
                                    className="w-14 text-[12px] font-bold font-mono text-amber-400 bg-slate-900 border border-amber-900/50 rounded px-1 text-center focus:outline-none focus:border-amber-500"
                                />
                                <button
                                    onClick={applyCurtailment}
                                    className="bg-amber-600/20 hover:bg-amber-500/40 p-1 rounded text-amber-500 transition-colors"
                                >
                                    <Send className="h-3 w-3" />
                                </button>
                            </div>
                        </div>

                        <div className="text-right hidden sm:block">
                            <div className="text-sm font-mono text-slate-300">
                                {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : '--:--:--'}
                            </div>
                            <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                                Última Sincronización
                            </div>
                        </div>
                    </div>
                </div>

                {/* Fila de navegación: centrada; hace scroll horizontal interno si no cabe (móvil). */}
                <div className="flex justify-center pb-2.5">
                    <nav className="flex items-center gap-2 max-w-full overflow-x-auto px-1 [scrollbar-width:thin] lg:flex-wrap lg:justify-center">
                        {navItems.map(({ href, icon: Icon, label, hover }) => (
                            <Link key={href} href={href} className="shrink-0">
                                <Button variant="outline" size="sm" className={`border-slate-700 hover:bg-slate-800 ${hover} gap-2 whitespace-nowrap`}>
                                    <Icon className="h-4 w-4" />
                                    <span>{label}</span>
                                </Button>
                            </Link>
                        ))}
                    </nav>
                </div>
            </div>
        </header>
    );
}

// Ícono de girasol (12 pétalos ámbar + centro). SVG propio porque lucide no trae un girasol.
function SunflowerIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Girasol">
            <g fill="#fbbf24">
                {Array.from({ length: 12 }).map((_, i) => (
                    <ellipse key={i} cx="12" cy="4.6" rx="1.5" ry="3.1" transform={`rotate(${i * 30} 12 12)`} />
                ))}
            </g>
            <circle cx="12" cy="12" r="3.6" fill="#7c2d12" />
            <circle cx="12" cy="12" r="3.6" fill="none" stroke="#fbbf24" strokeWidth="0.5" />
        </svg>
    );
}