import { ScbData } from "@/app/types";
import { analyzeScb } from "@/app/lib/analytics";
import { AlertOctagon, TrendingDown, ZapOff, Moon, WifiOff, Activity } from "lucide-react";

export function InverterForensics({ scbs, title }: { scbs: ScbData[], title: string }) {
    if (!scbs || scbs.length === 0) return null;

    const analysis = scbs.map(analyzeScb);

    // Sumatorias
    const totalDeadStrings = analysis.reduce((acc, curr) => acc + curr.deadStrings, 0);
    const totalLostKW = analysis.reduce((acc, curr) => acc + curr.lostPowerKW, 0);
    const totalDailyMWhLost = analysis.reduce((acc, curr) => acc + curr.dailyLostMWh, 0);

    const totalPotential = analysis.reduce((acc, curr) => acc + curr.potentialPowerKW, 0);
    const totalActual = analysis.reduce((acc, curr) => acc + curr.actualPowerKW, 0);

    // 🔥 NUEVO: Calculamos la corriente total bruta para desempatar (Divided by 100)
    const totalRawAmps = scbs.reduce((acc, curr) => acc + ((curr.i_total ?? 0) / 100), 0);

    // --- LÓGICA DE ESTADO SUPERIOR ---

    const offlineCount = scbs.filter(s => s.estado === 'OFFLINE' || s.estado === 'READ_FAIL').length;
    const isTotalOffline = offlineCount === scbs.length;

    let inverterEfficiency = 0;
    let statusMode: 'ACTIVE' | 'IDLE' | 'OFFLINE' | 'WARN_VOLTAGE' = 'ACTIVE';

    if (isTotalOffline) {
        statusMode = 'OFFLINE';
    }
    // CORRECCIÓN AQUÍ: Solo es IDLE si hay poca potencia Y ADEMÁS poca corriente (< 5A)
    else if (totalPotential <= 0.1 && totalRawAmps < 5) {
        statusMode = 'IDLE';
    }
    else {
        // Estamos activos. Calculamos eficiencia.
        // Si el voltaje es 0 pero hay amperios, totalPotential será 0. Evitamos división por cero.
        if (totalPotential > 0) {
            inverterEfficiency = (totalActual / totalPotential) * 100;
        } else {
            // Caso raro: Tenemos Amperios pero Voltaje 0. 
            // El equipo funciona pero falta dato de voltaje.
            inverterEfficiency = 0;
            statusMode = 'WARN_VOLTAGE'; // Nuevo estado para depurar
        }
    }

    // --- COLORES Y DISEÑO SEGÚN MODO ---
    let circleColor = 'text-emerald-500';
    let statusText = `${inverterEfficiency.toFixed(0)}%`;
    let statusIcon = null;
    let statusLabel = "Rendimiento Strings";

    if (statusMode === 'OFFLINE') {
        circleColor = 'text-rose-600';
        statusText = "OFF";
        statusLabel = "Sin Comunicación";
        statusIcon = <WifiOff className="h-3 w-3 text-rose-500" />;
    }
    else if (statusMode === 'IDLE') {
        circleColor = 'text-slate-600';
        statusText = "IDLE";
        statusLabel = "En Espera / Noche";
        statusIcon = <Moon className="h-3 w-3 text-slate-500" />;
    }
    else if (statusMode === 'WARN_VOLTAGE') {
        circleColor = 'text-yellow-500';
        statusText = "ERR";
        statusLabel = "Fallo Voltaje (Amps OK)";
        statusIcon = <Activity className="h-3 w-3 text-yellow-500" />;
    }
    else {
        // Activo Normal
        if (inverterEfficiency < 80) circleColor = 'text-rose-500';
        else if (inverterEfficiency < 95) circleColor = 'text-orange-500';
    }

    return (
        <div className={`border rounded-xl p-5 mb-6 shadow-lg transition-colors ${statusMode === 'OFFLINE' ? 'bg-rose-950/10 border-rose-900/50' : 'bg-slate-900/80 border-slate-800'}`}>
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">

                {/* Título y Gráfico Circular */}
                <div className="flex items-center gap-4">
                    <div className="relative w-16 h-16 flex items-center justify-center">
                        <svg className="absolute w-full h-full text-slate-800" viewBox="0 0 36 36">
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                        </svg>

                        {statusMode !== 'IDLE' && statusMode !== 'OFFLINE' && (
                            <svg className={`absolute w-full h-full ${circleColor} rotate-[-90deg]`} viewBox="0 0 36 36">
                                <path
                                    strokeDasharray={`${inverterEfficiency}, 100`}
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none" stroke="currentColor" strokeWidth="3"
                                    strokeLinecap="round"
                                />
                            </svg>
                        )}

                        <span className={`text-sm font-bold ${statusMode === 'ACTIVE' ? 'text-white' : circleColor}`}>
                            {statusText}
                        </span>
                    </div>

                    <div>
                        <h3 className="text-xl font-bold text-white">{title}</h3>
                        <p className="text-sm text-slate-400 flex items-center gap-2">
                            {statusIcon} {statusLabel}
                        </p>
                    </div>
                </div>

                <div className="hidden md:block w-px h-12 bg-slate-800"></div>

                {/* Métricas */}
                <div className={`grid grid-cols-3 gap-8 text-center md:text-left ${statusMode === 'OFFLINE' ? 'opacity-30 grayscale' : ''}`}>

                    <div>
                        <div className="flex items-center gap-2 justify-center md:justify-start text-slate-400 text-[10px] uppercase font-bold mb-1">
                            <AlertOctagon className="h-3 w-3 text-rose-500" />
                            Strings Off
                        </div>
                        <div className={`text-2xl font-mono font-bold ${totalDeadStrings > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                            {totalDeadStrings}
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center gap-2 justify-center md:justify-start text-slate-400 text-[10px] uppercase font-bold mb-1">
                            <ZapOff className="h-3 w-3 text-orange-500" />
                            Fuga Actual
                        </div>
                        <div className="text-2xl font-mono font-bold text-white">
                            {totalLostKW.toFixed(2)} <span className="text-xs text-slate-500 font-normal">kW</span>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center gap-2 justify-center md:justify-start text-slate-400 text-[10px] uppercase font-bold mb-1">
                            <TrendingDown className="h-3 w-3 text-blue-400" />
                            Pérdida/Día
                        </div>
                        <div className="text-2xl font-mono font-bold text-white">
                            {totalDailyMWhLost.toFixed(3)} <span className="text-xs text-slate-500 font-normal">MWh</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}