import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScbData } from "@/app/types";
import { Thermometer, Zap, Activity } from "lucide-react";

interface Props {
    scb: ScbData | null;
    isOpen: boolean;
    onClose: () => void;
}

export function StringDetailDialog({ scb, isOpen, onClose }: Props) {
    if (!scb) return null;

    // --- PROTECCIÓN CONTRA NULOS (Defensive Programming) ---
    // Si la caja está offline, estos valores vienen NULL. Usamos 0.
    const safe_i_total = scb.i_total ?? 0;
    const safe_vdc = scb.vdc ?? 0;
    const safe_temp = scb.temp_c ?? 0;
    const safe_avg = scb.i_avg ?? 0;

    // Extraer valores de strings dinámicamente con protección
    const strings = Array.from({ length: 18 }, (_, i) => {
        const key = `s${String(i + 1).padStart(2, '0')}` as keyof ScbData;
        // Si el string es null, forzamos 0
        const rawVal = scb[key];
        return { id: i + 1, val: typeof rawVal === 'number' ? rawVal : 0 };
    });

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-3xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3 text-2xl">
                        <span className="font-mono text-emerald-400">SCB {scb.scb}</span>
                        <span className="text-slate-500 text-base font-normal">| Inversor {scb.inversor}</span>
                        <span className={`ml-auto px-3 py-1 rounded text-sm font-bold ${getStatusColor(scb.estado)}`}>
                            {scb.estado}
                        </span>
                    </DialogTitle>
                </DialogHeader>

                {/* Métricas Generales (Usamos las variables seguras 'safe_...') */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <MetricBox icon={<Zap className="text-yellow-500" />} label="Corriente Total" value={`${safe_i_total.toFixed(1)} A`} />
                    <MetricBox icon={<Activity className="text-blue-500" />} label="Voltaje DC" value={`${safe_vdc.toFixed(0)} V`} />
                    <MetricBox icon={<Thermometer className="text-rose-500" />} label="Temperatura" value={`${safe_temp.toFixed(1)} °C`} />
                </div>

                {/* Grid de 18 Strings */}
                <div className="space-y-2">
                    <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">Monitor de Fusibles (Strings)</h4>
                    {scb.estado === 'OFFLINE' ? (
                        <div className="p-8 text-center border border-dashed border-slate-800 rounded text-slate-500">
                            Esta caja no tiene comunicación. No hay datos de strings disponibles.
                        </div>
                    ) : (
                        <div className="grid grid-cols-6 gap-2">
                            {strings.map((s) => (
                                <div
                                    key={s.id}
                                    className={`p-2 rounded border flex flex-col items-center justify-center transition-colors ${getStringColor(s.val, safe_avg)}`}
                                >
                                    <span className="text-xs opacity-70 mb-1">S{s.id}</span>
                                    <span className="font-mono font-bold text-lg">{s.val.toFixed(1)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// Ayudantes visuales (sin cambios)
function MetricBox({ icon, label, value }: any) {
    return (
        <div className="bg-slate-900/50 border border-slate-800 p-3 rounded flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded">{icon}</div>
            <div>
                <p className="text-xs text-slate-400">{label}</p>
                <p className="text-lg font-bold">{value}</p>
            </div>
        </div>
    );
}

function getStatusColor(status: string) {
    if (status === 'OK') return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50';
    if (status === 'OFFLINE' || status === 'READ_FAIL') return 'bg-rose-500/20 text-rose-400 border border-rose-500/50';
    return 'bg-orange-500/20 text-orange-400 border border-orange-500/50';
}

function getStringColor(val: number, avg: number) {
    if (val === 0) return 'bg-rose-950/40 border-rose-900 text-rose-500'; // Fusible roto
    if (avg > 1 && val < avg * 0.7) return 'bg-orange-950/40 border-orange-900 text-orange-400'; // Sucio/Sombra
    return 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400'; // OK
}