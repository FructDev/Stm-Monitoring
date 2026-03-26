import { ScbData } from "@/app/types";
import { analyzeScb } from "@/app/lib/analytics";
import { Zap, AlertTriangle, WifiOff, ArrowDown, Factory } from "lucide-react";

import { ActiveAlarm } from "@/app/types/alarms";
import { useHealthThreshold } from "@/app/hooks/useHealthThreshold";
import { useCurtailment } from "@/app/hooks/useCurtailment";

interface Props {
    data: ScbData;
    alarms?: ActiveAlarm[];
    onClick: (scb: ScbData) => void;
}

export function ScbCard({ data, alarms: activeAlarms, onClick }: Props) {
    const { threshold } = useHealthThreshold();
    const { isManualCurtailment } = useCurtailment();

    // Nueva Lógica Analítica de Supresión de Alarmas V2
    const effectivelySilenced = data.alarm_silenced || isManualCurtailment;
    const isCurtailment = effectivelySilenced === true;

    // 1. Determinamos si está muerta (Offline o Fallo de Lectura)
    const isOffline = data.estado === 'OFFLINE' || data.estado === 'READ_FAIL';

    // 2. Determinamos si tiene una Alerta Activa (DB legacy)
    const hasActiveAlarms = activeAlarms && activeAlarms.length > 0;
    const topSeverity = hasActiveAlarms
        ? Math.max(...activeAlarms.map(a => a.severity))
        : 0;

    // 3. Ejecutamos el análisis tradicional por si acaso (para kW perdidos)
    const analytics = analyzeScb(data);
    const score = data.health_score_pct ?? 100;

    // --- JERARQUÍA INTELIGENTE DE COLORES (SCADA ANALÍTICO) ---
    let statusClass = "border-slate-800 bg-slate-900 hover:border-slate-600";
    let isCritical = false;
    let isWarning = false;

    if (isOffline) {
        statusClass = "border-rose-900/50 bg-rose-950/10 opacity-60 hover:opacity-100 hover:border-rose-500";
    }
    else if (effectivelySilenced) {
        // Prioridad 1: Curtailment o Nubes (Ambar Neutral) SUPRIME ALARMAS FALSAS
        statusClass = "border-amber-900/60 bg-amber-950/20 hover:border-amber-500";
    }
    else if (score < threshold || topSeverity >= 3) {
        // Prioridad 2: Daño Severo (Fusible Roto)
        isCritical = true;
        statusClass = "border-rose-600 bg-rose-950/30 hover:border-rose-400";
    }
    else if (score < 95 || topSeverity === 2) {
        // Prioridad 3: Degradación Leve (Mantenimiento)
        isWarning = true;
        statusClass = "border-orange-900/60 bg-orange-950/10 hover:border-orange-500";
    }
    else {
        // Prioridad 4: Óptimo
        statusClass = "border-emerald-900/30 bg-emerald-950/5 hover:border-emerald-500";
    }

    // --- LÓGICA DE VISUALIZACIÓN DE DATOS ---
    const ampsDisplay = isOffline ? '--' : (data.i_total ?? 0).toFixed(1);
    const vdcDisplay = isOffline ? '--' : (data.vdc ?? 0).toFixed(0);
    const tempDisplay = isOffline ? '--' : (data.temp_c ?? 0).toFixed(0);

    return (
        <div
            onClick={() => { if (!isOffline) onClick(data); }}
            className={`relative p-3 rounded-lg border-2 transition-all cursor-pointer hover:shadow-lg group ${statusClass} ${isOffline ? 'cursor-not-allowed' : ''}`}
        >
            {/* Cabecera: Nombre e Icono de Estado */}
            <div className="flex justify-between items-center mb-2">
                <span className={`font-bold text-sm ${isOffline ? 'text-slate-500' : 'text-slate-300'}`}>
                    SCB {data.scb}
                </span>

                {/* Iconografía Dinámica */}
                {isOffline ? <WifiOff className="h-4 w-4 text-rose-500" /> :
                    effectivelySilenced ? <Factory className="h-4 w-4 text-amber-500 opacity-80" aria-label="Limitación SENI (Curtailment)" /> :
                    isCritical ? <AlertTriangle className="h-4 w-4 text-rose-500 animate-pulse" /> :
                    isWarning ? <AlertTriangle className="h-4 w-4 text-orange-500" /> :
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

                {/* Información Predictiva de Salud (Twins) */}
                {!isOffline && score < 100 && (
                    <div className="text-right flex flex-col items-end pt-1">
                        <div className={`text-xs font-bold font-mono tracking-tighter ${isCritical ? 'text-rose-400' : isWarning ? 'text-orange-400' : 'text-slate-400'}`}>
                            {score.toFixed(1)}%
                        </div>
                        <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Salud</div>
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