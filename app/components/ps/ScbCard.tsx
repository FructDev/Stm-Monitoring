import { ScbData } from "@/app/types";
import { analyzeScb } from "@/app/lib/analytics";
import { Zap, AlertTriangle, WifiOff, ArrowDown } from "lucide-react";

import { ActiveAlarm } from "@/app/types/alarms";

interface Props {
    data: ScbData;
    alarms?: ActiveAlarm[];
    onClick: (scb: ScbData) => void;
}

export function ScbCard({ data, alarms, onClick }: Props) {
    // 1. Determinamos si está muerta (Offline o Fallo de Lectura)
    const isOffline = data.estado === 'OFFLINE' || data.estado === 'READ_FAIL';

    // 2. Determinamos si tiene una Alerta Activa (DB Alarms system priority)
    const hasActiveAlarms = alarms && alarms.length > 0;
    const topSeverity = hasActiveAlarms
        ? Math.max(...alarms.map(a => a.severity))
        : 0;

    // 3. Ejecutamos el análisis (solo será útil si NO está offline)
    const analytics = analyzeScb(data);

    // Existing alert logic as fallback or combined? 
    // Let's treat topSeverity >= 2 as critical/warning override
    const isLegacyAlert = data.estado.includes('POSIBLE') ||
        data.estado === 'BAJA_TENSION' ||
        data.estado.includes('ALERTA');

    // REFINAMIENTO DE ALERTA:
    // Priorizamos el análisis en tiempo real sobre el estado heredado (legacy).
    // Si no hay strings muertos (fusibles rotos), ignoramos las alertas de strings de la DB.
    // Antes revisábamos también 'lowPerfStrings', pero la DB suele marcar 'ALERTA' por fusibles,
    // así que si deadStrings es 0, asumimos que es un falso positivo del sistema viejo.
    let isRealAlert = isLegacyAlert;

    if (analytics.deadStrings === 0) {
        if (data.estado.includes('ALERTA') || data.estado.includes('POSIBLE') || data.estado === 'BAJA_TENSION') {
            isRealAlert = false;
        }
    }

    const isAlert = isRealAlert || hasActiveAlarms;
    let statusClass = "border-slate-800 bg-slate-900 hover:border-slate-600"; // Default

    if (isOffline) {
        // Red ghost
        statusClass = "border-rose-900/50 bg-rose-950/10 opacity-60 hover:opacity-100 hover:border-rose-500";
    }
    else if (topSeverity >= 3) {
        // Critical Alarm (Red Solid)
        statusClass = "border-rose-600 bg-rose-950/30 hover:border-rose-400";
    }
    else if (isAlert || analytics.efficiency < 80 || topSeverity === 2) {
        // Warning (Orange)
        statusClass = "border-orange-900/60 bg-orange-950/10 hover:border-orange-500";
    }
    else {
        // OK
        statusClass = "border-emerald-900/30 bg-emerald-950/5 hover:border-emerald-500";
    }

    // --- LÓGICA DE VISUALIZACIÓN DE DATOS ---
    const ampsDisplay = isOffline ? '--' : (data.i_total ?? 0).toFixed(1);
    const vdcDisplay = isOffline ? '--' : (data.vdc ?? 0).toFixed(0);
    const tempDisplay = isOffline ? '--' : (data.temp_c ?? 0).toFixed(0);

    return (
        <div
            onClick={() => onClick(data)}
            className={`relative p-3 rounded-lg border-2 transition-all cursor-pointer hover:shadow-lg group ${statusClass}`}
        >
            {/* Cabecera: Nombre e Icono de Estado */}
            <div className="flex justify-between items-center mb-2">
                <span className={`font-bold text-sm ${isOffline ? 'text-slate-500' : 'text-slate-300'}`}>
                    SCB {data.scb}
                </span>

                {/* Iconografía Dinámica */}
                {isOffline ? <WifiOff className="h-4 w-4 text-rose-500" /> :
                    (topSeverity >= 3) ? <AlertTriangle className="h-4 w-4 text-rose-500 animate-pulse" /> :
                        isAlert ? <AlertTriangle className="h-4 w-4 text-orange-500" /> :
                            <Zap className="h-4 w-4 text-emerald-600 opacity-50" />}
            </div>

            {/* Cuerpo Principal: Amperaje */}
            <div className="flex items-end justify-between">
                <div>
                    <div className={`text-2xl font-black font-mono tracking-tighter ${isOffline ? 'text-slate-600' : 'text-white'}`}>
                        {/* Fix: Corriente SCB / 100 y a 1 decimal */}
                        {isOffline ? '--' : (Number(data.i_total ?? 0) / 100).toFixed(1)} <span className="text-xs font-normal text-slate-500">A</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                        {/* Fix: Voltaje y Temp a 0 decimales */}
                        {isOffline ? '--' : Number(data.vdc ?? 0).toFixed(0)}V | {isOffline ? '--' : Number(data.temp_c ?? 0).toFixed(0)}°C
                    </div>
                </div>

                {/* Información de Pérdidas (Solo si está ONLINE y hay pérdidas reales) */}
                {!isOffline && analytics.lostPowerKW > 0.5 && (
                    <div className="text-right">
                        <div className="text-xs text-rose-400 font-bold flex items-center justify-end">
                            <ArrowDown className="h-3 w-3" />
                            {analytics.lostPowerKW.toFixed(1)} kW
                        </div>
                        <div className="text-[10px] text-slate-500">Perdidos</div>
                    </div>
                )}
            </div>



            {/* Indicador Flotante de Strings Muertos (Solo si ONLINE) */}
            {analytics.deadStrings > 0 && !isOffline && (
                <div className="absolute -top-2 -right-2 bg-rose-600 text-white text-[10px] w-5 h-5 flex items-center justify-center font-bold rounded-full shadow-lg border border-slate-900 animate-pulse z-10">
                    {analytics.deadStrings}
                </div>
            )}
        </div>
    );
}