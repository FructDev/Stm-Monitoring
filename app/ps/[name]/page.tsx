'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { ScbData } from '@/app/types';
import { useActiveAlarms } from "@/hooks/use-alarms";
import { useScadaStream } from "@/app/hooks/useScadaStream";
import { ActiveAlarm } from "@/app/types/alarms";
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

    // React Query (Carga Inicial Estática)
    const { data: staticScbs, isLoading, isError } = useQuery({
        queryKey: ['ps-data', psName],
        queryFn: () => fetchPsData(psName),
        refetchOnWindowFocus: false, // Menos polling
    });

    // 2. Fetch Active Alarms (DB based still)
    const { data: alarmData } = useActiveAlarms();

    // 3. Conexión en vivo Fase 1 & 2 (SSE)
    const { data: liveData, isConnected } = useScadaStream();

    if (isLoading) return <div className="h-screen flex items-center justify-center text-slate-500">Cargando telemetría de {psName}...</div>;
    if (isError) return <div className="h-screen flex items-center justify-center text-rose-500">Error cargando datos.</div>;

    // Fusión de Datos: Tomamos la base y la sobrescribimos con los paquetes en vivo de RAM
    const scbs = staticScbs?.map(scb => {
        const key = `${scb.power_station}-${scb.inversor}-${scb.scb}`;
        if (liveData[key]) {
            return { ...scb, ...liveData[key] };
        }
        return scb;
    }) || [];

    // Separar por Inversores (Agrupación normal basada en la columna 'inversor' del driver V2)
    const inv1 = scbs.filter(s => s.inversor === 1);
    const inv2 = scbs.filter(s => s.inversor === 2);

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
                    <span className={`flex h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                    <span className={`text-xs font-mono ${isConnected ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {isConnected ? 'EN VIVO (SSE)' : 'DESCONECTADO'}
                    </span>
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
                        {inv1.map((scb) => {
                            const scbAlarms = alarmData?.alarms.filter(a =>
                                a.power_station === psName &&
                                a.inversor === scb.inversor &&
                                a.scb === scb.scb
                            );
                            return (
                                <ScbCard
                                    key={`${scb.inversor}-${scb.scb}`}
                                    data={scb}
                                    alarms={scbAlarms}
                                    onClick={setSelectedScb}
                                />
                            );
                        })}
                    </div>
                </section>

                {/* COLUMNA INVERSOR 2 */}
                <section>
                    {/* Componente Forense (El WAOOO) */}
                    <InverterForensics title="Inversor 02" scbs={inv2} />

                    {/* Grid de Tarjetas */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {inv2.map((scb) => {
                            const scbAlarms = alarmData?.alarms.filter(a =>
                                a.power_station === psName &&
                                a.inversor === scb.inversor &&
                                a.scb === scb.scb
                            );

                            return (
                                <ScbCard
                                    key={`${scb.inversor}-${scb.scb}`}
                                    data={scb}
                                    alarms={scbAlarms}
                                    onClick={setSelectedScb}
                                />
                            );
                        })}
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