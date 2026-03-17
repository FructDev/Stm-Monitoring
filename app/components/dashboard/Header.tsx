'use client';

import Link from 'next/link';
import { Activity, LayoutDashboard, HeartPulse } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Header({ lastUpdate }: { lastUpdate?: string }) {
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
                    <Link href="/admin/history">
                        <Button variant="outline" size="sm" className="border-slate-700 hover:bg-slate-800 hover:text-blue-400 gap-2">
                            <Activity className="h-4 w-4" />
                            <span>Historial Avanzado</span>
                        </Button>
                    </Link>
                </div>

                <div className="flex items-center gap-4">
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