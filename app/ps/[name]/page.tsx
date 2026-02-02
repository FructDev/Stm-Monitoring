'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ScbData } from '@/app/types';
import { ScbCard } from '@/app/components/ps/ScbCard';
import { StringDetailDialog } from '@/app/components/ps/StringDetailDialog';
import { InverterForensics } from '@/app/components/ps/InverterForensics'; // <--- EL COMPONENTE NUEVO
import { Button } from '@/components/ui/button';

// Función Fetcher
const fetchPsData = async (name: string) => {
    const res = await fetch(`/api/ps?name=${name}`);
    if (!res.ok) throw new Error('Failed to fetch PS data');
    return res.json() as Promise<ScbData[]>;
};

export default function PsDetailPage() {
    const params = useParams();
    const router = useRouter();
    const psName = params.name as string;

    // Estado para el Modal
    const [selectedScb, setSelectedScb] = useState<ScbData | null>(null);

    // React Query
    const { data: scbs, isLoading, isError } = useQuery({
        queryKey: ['ps-data', psName],
        queryFn: () => fetchPsData(psName),
        refetchInterval: 2000,
    });

    if (isLoading) return <div className="h-screen flex items-center justify-center text-slate-500">Cargando telemetría de {psName}...</div>;
    if (isError) return <div className="h-screen flex items-center justify-center text-rose-500">Error cargando datos.</div>;

    // Separar por Inversores
    const inv1 = scbs?.filter(s => s.inversor === 1) || [];
    const inv2 = scbs?.filter(s => s.inversor === 2) || [];

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 pb-20">
            {/* Header Navegación */}
            <div className="flex items-center gap-4 mb-8">
                <Button variant="ghost" onClick={() => router.back()} className="text-slate-400 hover:text-white">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Volver
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white">{psName}</h1>
                    <p className="text-slate-500 text-sm">Análisis de Rendimiento por Inversor</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs text-emerald-500 font-mono">EN VIVO</span>
                </div>
            </div>

            {/* Grid Layout */}
            <div className="grid gap-10 xl:grid-cols-2">
                {/* COLUMNA INVERSOR 1 */}
                <section>
                    {/* Componente Forense (El WAOOO) */}
                    <InverterForensics title="Inversor 01" scbs={inv1} />

                    {/* Grid de Tarjetas */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {inv1.map((scb) => (
                            <ScbCard key={`${scb.inversor}-${scb.scb}`} data={scb} onClick={setSelectedScb} />
                        ))}
                    </div>
                </section>

                {/* COLUMNA INVERSOR 2 */}
                <section>
                    {/* Componente Forense (El WAOOO) */}
                    <InverterForensics title="Inversor 02" scbs={inv2} />

                    {/* Grid de Tarjetas */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {inv2.map((scb) => (
                            <ScbCard key={`${scb.inversor}-${scb.scb}`} data={scb} onClick={setSelectedScb} />
                        ))}
                    </div>
                </section>
            </div>

            {/* Modal de Detalle */}
            <StringDetailDialog
                scb={selectedScb}
                isOpen={!!selectedScb}
                onClose={() => setSelectedScb(null)}
            />
        </div>
    );
}