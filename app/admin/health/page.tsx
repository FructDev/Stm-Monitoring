import { HealthKPIs } from "@/app/components/scada/HealthKPIs";
import { GatewayGrid } from "@/app/components/scada/GatewayGrid";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ScadaHealthPage() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
            <div className="mb-8 flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                        <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
                        Estado del Sistema SCADA
                    </h1>
                    <p className="text-slate-500 mt-2">
                        Monitoreo en tiempo real de la conectividad y salud de la infraestructura OT.
                    </p>
                </div>
                <Link href="/">
                    <Button variant="outline" className="border-slate-700 hover:bg-slate-800 text-slate-300 gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Volver al Dashboard
                    </Button>
                </Link>
            </div>

            {/* KPIs Globales */}
            <HealthKPIs />

            {/* Grid de Gateways */}
            <GatewayGrid />
        </div>
    );
}
