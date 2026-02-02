'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PsSummary } from '@/app/types';
import { cn } from '@/app/lib/utils'; // Utilidad de Shadcn para clases condicionales

export function PsGrid({ stations }: { stations: PsSummary[] }) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            {stations.map((ps) => (
                <Link href={`/ps/${ps.name}`} key={ps.name} className="block group">
                    <Card className={cn(
                        "transition-all duration-200 hover:border-slate-600 hover:shadow-lg bg-slate-900 border-slate-800",
                        // Borde coloreado según estado
                        ps.status === 'critical' && "border-rose-900/50 bg-rose-950/10",
                        ps.status === 'warning' && "border-orange-900/50 bg-orange-950/10"
                    )}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-lg font-bold text-slate-200 group-hover:text-white">
                                {ps.name}
                            </CardTitle>
                            {/* Badge de Estado */}
                            <StatusBadge status={ps.status} />
                        </CardHeader>

                        <CardContent>
                            <div className="mt-2 space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-400">Corriente:</span>
                                    <span className="font-mono font-bold text-emerald-400">{ps.total_amps.toFixed(1)} A</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-400">Cajas:</span>
                                    <span className="font-mono text-slate-300">{ps.scb_count}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </Link>
            ))}
        </div>
    );
}

function StatusBadge({ status }: { status: PsSummary['status'] }) {
    if (status === 'critical') {
        return <Badge variant="destructive" className="animate-pulse">OFFLINE</Badge>;
    }
    if (status === 'warning') {
        return <Badge className="bg-orange-500 hover:bg-orange-600">ALERTA</Badge>;
    }
    return <Badge className="bg-emerald-600 hover:bg-emerald-700">OK</Badge>;
}