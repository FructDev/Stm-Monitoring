'use client';

import Link from 'next/link';
import { useState } from 'react';
import { HeartPulse, CloudRain, Activity, LayoutDashboard, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHealthThreshold } from '@/app/hooks/useHealthThreshold';
import { useCurtailment } from '@/app/hooks/useCurtailment';

export function Header({ lastUpdate }: { lastUpdate?: string }) {
    const { threshold, setThreshold } = useHealthThreshold();
    const { limitMW, setLimitMW } = useCurtailment();
    const [localMw, setLocalMw] = useState<number | string>(limitMW);

    const applyCurtailment = async () => {
        const val = Number(localMw);
        setLimitMW(val);
        try {
            const payload = val >= 120 || val === 0 ? { limit_mw: null } : { limit_mw: val };
            await fetch('/api/curtailment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            console.log("Curtailment MW sent to Backend:", payload);
        } catch (error) {
            console.error("Failed to commit Curtailment", error);
        }
    };
    
    return (
        <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur supports-[backdrop-filter]:bg-slate-900/50 sticky top-0 z-50">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between relative">
                <div className="flex items-center gap-3">
                    <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                        <LayoutDashboard className="h-6 w-6 text-emerald-500" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight">Girasol SCBs monitoring system</h1>
                        <p className="text-xs text-slate-400">v1.0</p>
                    </div>
                </div>

                {/* Centered Navigation Buttons */}
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-4">
                    <Link href="/admin/health">
                        <Button variant="outline" size="sm" className="border-slate-700 hover:bg-slate-800 hover:text-emerald-400 gap-2">
                            <HeartPulse className="h-4 w-4" />
                            <span>System Health</span>
                        </Button>
                    </Link>
                    <Link href="/admin/meteo">
                        <Button variant="outline" size="sm" className="border-slate-700 hover:bg-slate-800 hover:text-cyan-400 gap-2">
                            <CloudRain className="h-4 w-4" />
                            <span>Meteorología</span>
                        </Button>
                    </Link>
                    <Link href="/admin/history">
                        <Button variant="outline" size="sm" className="border-slate-700 hover:bg-slate-800 hover:text-blue-400 gap-2">
                            <Activity className="h-4 w-4" />
                            <span>Historial Avanzado</span>
                        </Button>
                    </Link>
                </div>

                <div className="flex items-center gap-4">
                    {/* Alarma Crítica Slider */}
                    <div className="flex flex-col items-end mr-2 hidden lg:flex bg-slate-800/40 p-1.5 rounded-md border border-slate-700/50">
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
                    <div className="flex flex-col items-center justify-center mr-4 hidden lg:flex bg-amber-500/10 p-1.5 px-3 rounded-md border border-amber-500/20">
                        <div className="text-[9px] text-amber-500/80 uppercase font-bold mb-1 tracking-wider" title="Si el límite es < 120MW, el Twin silenciará falsas alarmas de bajo amperaje">
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
        </header>
    );
}