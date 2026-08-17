'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, SunMedium, AlertTriangle, Hand, WifiOff } from 'lucide-react';
import { TrackerCard, TrackerData } from '@/app/components/trackers/TrackerCard';

const fetchTrackers = async () => {
    const res = await fetch('/api/trackers');
    if (!res.ok) throw new Error('Error al cargar trackers');
    return res.json() as Promise<{ trackers: TrackerData[] }>;
};

export default function TrackersPage() {
    const { data, isLoading } = useQuery({
        queryKey: ['trackers'],
        queryFn: fetchTrackers,
        refetchInterval: 4000,
    });

    const trackers = data?.trackers || [];
    const errors = trackers.filter((t) => t.has_alarm && !t.stale).length;
    const manual = trackers.filter((t) => t.mode === 1 && !t.stale).length;
    const offline = trackers.filter((t) => t.stale).length;

    // Agrupar por PS conservando el orden
    const groups: { ps: string; items: TrackerData[] }[] = [];
    for (const t of trackers) {
        let g = groups.find((x) => x.ps === t.ps);
        if (!g) { g = { ps: t.ps, items: [] }; groups.push(g); }
        g.items.push(t);
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 pb-20">
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6">
                <Link href="/">
                    <button className="text-slate-400 hover:text-white flex items-center gap-2 text-sm border border-slate-800 rounded px-3 py-1.5 hover:bg-slate-900 transition-colors">
                        <ArrowLeft className="h-4 w-4" /> Volver
                    </button>
                </Link>
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                        <SunMedium className="h-6 w-6 text-amber-400" /> Seguidores Solares
                    </h1>
                    <p className="text-slate-500 text-sm">Posición en vivo, setpoint GPS y control manual por tracker.</p>
                </div>
                <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-3 sm:gap-4 text-xs">
                    <span className="flex items-center gap-1.5 text-rose-400"><AlertTriangle className="h-4 w-4" /> {errors} en error</span>
                    <span className="flex items-center gap-1.5 text-amber-400"><Hand className="h-4 w-4" /> {manual} en manual</span>
                    <span className="flex items-center gap-1.5 text-slate-500"><WifiOff className="h-4 w-4" /> {offline} sin señal</span>
                </div>
            </div>

            {isLoading && trackers.length === 0 ? (
                <div className="text-slate-500 text-sm p-8 text-center">Cargando trackers…</div>
            ) : trackers.length === 0 ? (
                <div className="text-slate-500 text-sm p-8 text-center border border-dashed border-slate-800 rounded-xl">
                    Sin datos de trackers todavía. Verifica que el driver esté corriendo y con red a los PLCs.
                </div>
            ) : (
                <div className="space-y-8">
                    {groups.map((g) => (
                        <section key={g.ps}>
                            <h2 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                                {g.ps}
                                <span className="text-xs text-slate-600 font-normal">· {g.items.length} trackers</span>
                            </h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                {g.items.map((t) => <TrackerCard key={t.id} t={t} />)}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
