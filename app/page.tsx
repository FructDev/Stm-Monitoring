/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";

// Componentes existentes
import { Header } from "./components/dashboard/Header";
import { StatsOverview } from "./components/dashboard/StatsOverview";
import { PsGrid } from "./components/dashboard/PsGrid";
import { ParkStats, PsSummary } from "./types";
import { ReportModal } from "./components/ReportModal";

// 1. IMPORTAMOS EL HOOK DE ALERTAS
import { useScadaAlerts } from "@/hooks/useScadaAlerts";

// Función para pedir datos al API
const fetchStats = async () => {
  const res = await fetch("/api/stats");
  if (!res.ok) throw new Error("Error fetching stats");
  return res.json() as Promise<ParkStats & { stations: PsSummary[] }>;
};

export default function DashboardPage() {
  // Hook de React Query (Mantiene el refresco cada 2s)
  const { data, error, isLoading } = useQuery({
    queryKey: ["park-stats"],
    queryFn: fetchStats,
    refetchInterval: 2000,
  });

  // 2. PREPARAR DATOS PARA ALERTAS (Aplanamos la estructura jerárquica)
  // Convertimos: Stations -> SCBs[] a una lista plana para el hook
  const flatDeviceList =
    data?.stations.flatMap((station: any) =>
      (station.scbs || []).map((scb: any) => ({
        ps: station.name, // "PS1"
        inversor: scb.inversor, // 1
        scb: scb.id, // 5
        status: scb.status, // "OK", "OFFLINE", "READ_FAIL"
      }))
    ) || [];

  // 3. ACTIVAR EL SISTEMA DE ALERTAS
  // El hook monitorea cambios en esta lista y lanza el Toast si algo cambia de OK a ERROR
  useScadaAlerts(flatDeviceList);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen msg={error.message} />;

  return (
    <div className="min-h-screen bg-slate-950 pb-20">
      <Header lastUpdate={data?.last_update} />

      <main className="container mx-auto px-4 py-8">
        {/* KPI CARDS */}
        {data && <StatsOverview stats={data} />}

        {/* BARRA DE HERRAMIENTAS DEL GRID */}
        <div className="mt-8 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Estado del Parque
            </h2>

            {/* Botón Mapa Térmico */}
            <Link href="/heatmap">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800"
              >
                <LayoutGrid className="mr-2 h-4 w-4" />
                Ver Mapa Térmico
              </Button>
            </Link>

            {/* Modal de Reportes / Orden de Trabajo */}
            <ReportModal />
          </div>

          <div className="flex gap-2 text-sm text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>{" "}
              Normal
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>{" "}
              Alerta
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span> Crítico
            </span>
          </div>
        </div>

        {/* GRID DE GATEWAYS */}
        {data && <PsGrid stations={data.stations} />}
      </main>
    </div>
  );
}

// Pantalla de Carga Simple
function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-slate-400 animate-pulse">
          Cargando datos del parque...
        </p>
      </div>
    </div>
  );
}

// Pantalla de Error
function ErrorScreen({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-rose-500">
      <div className="text-center">
        <h2 className="text-xl font-bold">Error de Conexión</h2>
        <p>{msg}</p>
        <p className="text-sm text-slate-500 mt-2">
          Verifique que el backend API esté corriendo.
        </p>
      </div>
    </div>
  );
}
