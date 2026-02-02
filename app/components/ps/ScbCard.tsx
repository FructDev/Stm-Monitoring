import { ScbData } from "@/app/types";
import { analyzeScb } from "@/app/lib/analytics";
import { Zap, AlertTriangle, WifiOff, ArrowDown } from "lucide-react";

interface Props {
    data: ScbData;
    onClick: (scb: ScbData) => void;
}

export function ScbCard({ data, onClick }: Props) {
    // 1. Determinamos si está muerta (Offline o Fallo de Lectura)
    const isOffline = data.estado === 'OFFLINE' || data.estado === 'READ_FAIL';

    // 2. Determinamos si tiene una Alerta Activa (Fusibles, Voltaje, Desbalance)
    const isAlert = data.estado.includes('POSIBLE') ||
        data.estado === 'BAJA_TENSION' ||
        data.estado.includes('ALERTA');

    // 3. Ejecutamos el análisis (solo será útil si NO está offline)
    const analytics = analyzeScb(data);

    // --- LÓGICA DE ESTILOS ---
    let statusClass = "border-slate-800 bg-slate-900 hover:border-slate-600"; // Default

    if (isOffline) {
        // Si está offline: Borde rojo oscuro, fondo rojizo tenue y OPACIDAD (efecto fantasma)
        statusClass = "border-rose-900/50 bg-rose-950/10 opacity-60 hover:opacity-100 hover:border-rose-500";
    }
    else if (isAlert || analytics.efficiency < 85) {
        // Si hay alerta o eficiencia baja: Naranja
        statusClass = "border-orange-900/60 bg-orange-950/10 hover:border-orange-500";
    }
    else {
        // Todo OK: Verde sutil
        statusClass = "border-emerald-900/30 bg-emerald-950/5 hover:border-emerald-500";
    }

    // --- LÓGICA DE VISUALIZACIÓN DE DATOS (EL FIX) ---
    // Si está offline, mostramos '--' para no confundir con datos viejos
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
                    isAlert ? <AlertTriangle className="h-4 w-4 text-orange-500" /> :
                        <Zap className="h-4 w-4 text-emerald-600 opacity-50" />}
            </div>

            {/* Cuerpo Principal: Amperaje */}
            <div className="flex items-end justify-between">
                <div>
                    <div className={`text-2xl font-black font-mono tracking-tighter ${isOffline ? 'text-slate-600' : 'text-white'}`}>
                        {ampsDisplay} <span className="text-xs font-normal text-slate-500">A</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                        {vdcDisplay}V | {tempDisplay}°C
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
                <div className="absolute -top-2 -right-2 bg-rose-600 text-white text-[10px] w-5 h-5 flex items-center justify-center font-bold rounded-full shadow-lg border border-slate-900 animate-pulse">
                    {analytics.deadStrings}
                </div>
            )}
        </div>
    );
}