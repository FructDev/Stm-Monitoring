'use client';

import { Activity } from 'lucide-react';

export function Header({ lastUpdate }: { lastUpdate?: string }) {
    return (
        <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur supports-[backdrop-filter]:bg-slate-900/50 sticky top-0 z-50">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                        <Activity className="h-6 w-6 text-emerald-500" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight">Parque Solar Girasol</h1>
                        <p className="text-xs text-slate-400">SCADA Monitor System v1.0</p>
                    </div>
                </div>

                <div className="text-right">
                    <div className="text-sm font-mono text-slate-300">
                        {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : '--:--:--'}
                    </div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                        Última Sincronización
                    </div>
                </div>
            </div>
        </header>
    );
}