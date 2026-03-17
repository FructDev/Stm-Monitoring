'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Download, FileText, Loader2, FileSpreadsheet, Activity } from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { getScbCapacity } from '@/app/lib/scb-config';

// Asegúrate de que este componente exista o comenta la línea si no usas PDF aún
import { ManagementReport } from '@/app/reports/ManagementReport';

export function ReportModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Estado del Filtro
    const [scope, setScope] = useState<'global' | 'ps'>('global');
    const [selectedPs, setSelectedPs] = useState<string>('PS1');
    const [selectedInv, setSelectedInv] = useState<string>('all');

    // Obtener Datos
    const getData = async () => {
        const res = await fetch('/api/heatmap');
        const json = await res.json();
        let data = json.stats;

        // Filtros Cliente
        if (scope === 'ps') {
            data = data.filter((d: any) => d.ps === selectedPs);
            if (selectedInv !== 'all') {
                data = data.filter((d: any) => d.inversor === parseInt(selectedInv));
            }
        }
        return data;
    };

    // --- GENERAR EXCEL (ORDEN DE TRABAJO) ---
    const handleExcel = async () => {
        setLoading(true);
        try {
            const rawData = await getData();

            // Estructuras para el reporte
            const workOrderRows: any[] = [];
            const summaryMap: Record<string, { damagedStrings: number, scbCount: number, offlineCount: number }> = {};

            // 1. PROCESAMIENTO Y FILTRADO
            rawData.forEach((d: any) => {
                // Generar clave única: PS + Inversor (Ej: "PS1 - Inv 1")
                const key = `${d.ps} - Inv ${d.inversor}`;

                // Inicializar contador si no existe
                if (!summaryMap[key]) {
                    summaryMap[key] = { damagedStrings: 0, scbCount: 0, offlineCount: 0 };
                }

                // Detectar strings muertos (< 0.5A)
                // SOLO si la caja tiene amperaje suficiente (> 2A) para evitar falsos positivos
                const hasAmps = (d.amps || 0) > 2;
                const capacity = getScbCapacity(d.ps, d.inversor, d.scb);

                const deadIndices = (d.strings && hasAmps)
                    ? d.strings
                        .slice(0, capacity) // <-- FIX: Trim empty slots for 15-string inverters
                        .map((val: number, idx: number) => (val < 0.5 ? idx + 1 : null))
                        .filter((val: number) => val !== null)
                    : [];

                const isOffline = d.status === 'OFFLINE' || d.status === 'READ_FAIL' || d.status === 'FAIL';
                const hasDeadStrings = deadIndices.length > 0;

                // Solo nos interesan las cajas con problemas
                if (isOffline || hasDeadStrings) {
                    const stats = summaryMap[key];

                    if (isOffline) {
                        stats.offlineCount += 1;
                        stats.scbCount += 1;
                    } else {
                        stats.damagedStrings += deadIndices.length;
                        stats.scbCount += 1;
                    }

                    // Fila para la hoja de "Checklist Técnico"
                    const displayScb = d.scb;

                    workOrderRows.push({
                        Prioridad: isOffline ? '🔴 ALTA (OFF)' : '🟡 MEDIA',
                        Ubicacion: d.ps,
                        Equipo: `INV-${d.inversor} / SCB-${displayScb}`,
                        Problema: isOffline ? 'Sin Comunicación' : `${deadIndices.length}`,
                        Strings_Afectados: isOffline ? 'Revisar Comms' : deadIndices.join(', '),
                        Verificado: '[   ]'
                    });
                }
            });

            // 2. GENERAR HOJA 1: ESTRATEGIA (Resumen Gerencial)
            const strategyRows = Object.entries(summaryMap)
                .map(([key, data]) => {
                    const [ps, inv] = key.split(' - '); // "PS1", "Inv 1"
                    return {
                        Power_Station: ps,
                        Inversor: inv, // Nueva Columna
                        Cajas_Offline: data.offlineCount,
                        Total_Strings_Dañados: data.damagedStrings,
                        Cajas_Afectadas: data.scbCount
                    };
                })
                .sort((a, b) => {
                    const numA = parseInt(a.Power_Station.replace(/\D/g, '')) || 0;
                    const numB = parseInt(b.Power_Station.replace(/\D/g, '')) || 0;
                    if (numA !== numB) return numA - numB;
                    return a.Inversor.localeCompare(b.Inversor);
                }); // Ordenar por PS (1, 2, 3...) y luego Inversor

            // Agregar fila de Totales Globales
            const totalDamage = strategyRows.reduce((sum, row) => sum + row.Total_Strings_Dañados, 0);
            const totalOffline = strategyRows.reduce((sum, row) => sum + row.Cajas_Offline, 0);
            const totalBoxes = strategyRows.reduce((sum, row) => sum + row.Cajas_Afectadas, 0);

            strategyRows.push({
                Power_Station: 'TOTAL',
                Inversor: 'PARQUE',
                Cajas_Offline: totalOffline,
                Total_Strings_Dañados: totalDamage,
                Cajas_Afectadas: totalBoxes
            });

            if (workOrderRows.length === 0) {
                alert("¡Excelente! Todo el parque está operando al 100%. No hay fallos.");
                setLoading(false);
                return;
            }

            // 3. CREAR ARCHIVO EXCEL
            const wb = XLSX.utils.book_new();

            // Hoja 1: Estrategia
            const wsStrategy = XLSX.utils.json_to_sheet(strategyRows);
            // Ajustar ancho columnas (Added Inversor col width)
            wsStrategy['!cols'] = [{ wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 15 }];
            XLSX.utils.book_append_sheet(wb, wsStrategy, "Resumen Estratégico");

            // Hoja 2: Orden de Trabajo (Checklist)
            // Ordenamos lógicamente para facilitar el recorrido: PS -> Inversor -> Caja
            workOrderRows.sort((a, b) => {
                if (a.Ubicacion === b.Ubicacion) return a.Equipo.localeCompare(b.Equipo);
                const numA = parseInt(a.Ubicacion.replace('PS', '')) || 0;
                const numB = parseInt(b.Ubicacion.replace('PS', '')) || 0;
                return numA - numB;
            });

            const wsOrder = XLSX.utils.json_to_sheet(workOrderRows);
            wsOrder['!cols'] = [
                { wch: 15 }, // Prioridad
                { wch: 10 }, // Ubicacion
                { wch: 20 }, // Equipo
                { wch: 25 }, // Problema
                { wch: 35 }, // Strings Afectados (Ancha para ver los números)
                { wch: 10 }  // Verificado
            ];
            XLSX.utils.book_append_sheet(wb, wsOrder, "Orden de Trabajo");

            // Descargar
            const fileName = `Orden_Mantenimiento_${selectedPs === 'PS1' && scope === 'ps' ? 'PS1' : 'Global'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, fileName);
            setIsOpen(false);

        } catch (e) {
            console.error(e);
            alert("Error generando la orden de trabajo. Verifica los datos.");
        } finally {
            setLoading(false);
        }
    };

    // --- GENERAR REPORTE AVANZADO (Fallas de Comunicación y Patrones) ---
    const handleAdvancedReport = async () => {
        setLoading(true);
        try {
            const rawData = await getData();

            const commFailures: any[] = [];
            const cardFailures: any[] = [];

            rawData.forEach((d: any) => {
                // 1. DETECCIÓN DE FALLO DE COMUNICACIÓN
                const isOffline = d.status === 'OFFLINE' || d.status === 'READ_FAIL' || d.status === 'FAIL';

                if (isOffline) {
                    commFailures.push({
                        Ubicacion: d.ps,
                        Equipo: `INV-${d.inversor} / SCB-${d.scb}`,
                        Estado: d.status,
                        Ultima_Lectura: 'Hace > 15 min', // Estimado
                        Prioridad: 'ALTA'
                    });
                }

                // 2. DETECCIÓN DE PATRONES (Posible Fallo de Tarjeta)
                // Buscamos 4 strings consecutivos dañados (ej. 1-4, 5-8...)
                // Solo si la caja tiene corriente (> 2A) y no está offline
                const hasAmps = (d.amps || 0) > 2;

                if (!isOffline && hasAmps && d.strings) {
                    const capacity = getScbCapacity(d.ps, d.inversor, d.scb);
                    const strings = d.strings.slice(0, capacity); // <-- FIX: Only check valid strings

                    // Iteramos buscando bloques de ceros consecutivos
                    let consecutiveCount = 0;
                    let startIdx = -1;
                    const damagedBlocks: string[] = [];

                    for (let i = 0; i < strings.length; i++) {
                        const val = strings[i];
                        if (val < 0.5) {
                            if (consecutiveCount === 0) startIdx = i;
                            consecutiveCount++;
                        } else {
                            if (consecutiveCount >= 4) {
                                damagedBlocks.push(`Strings ${startIdx + 1}-${startIdx + consecutiveCount}`);
                            }
                            consecutiveCount = 0;
                        }
                    }
                    // Check final block
                    if (consecutiveCount >= 4) {
                        damagedBlocks.push(`Strings ${startIdx + 1}-${startIdx + consecutiveCount}`);
                    }

                    if (damagedBlocks.length > 0) {
                        cardFailures.push({
                            Ubicacion: d.ps,
                            Equipo: `INV-${d.inversor} / SCB-${d.scb}`,
                            Corriente_Caja: `${d.amps.toFixed(1)} A`,
                            Patron_Detectado: damagedBlocks.join(', '),
                            Diagnostico: 'Posible Fallo de Tarjeta/Fusibles Multiples',
                            Prioridad: 'MEDIA'
                        });
                    }
                }
            });

            if (commFailures.length === 0 && cardFailures.length === 0) {
                alert("No se detectaron fallos críticos ni patrones de tarjeta dañada.");
                setLoading(false);
                return;
            }

            // CREAR EXCEL
            const wb = XLSX.utils.book_new();

            // Hoja 1: Comunicación
            if (commFailures.length > 0) {
                const wsComm = XLSX.utils.json_to_sheet(commFailures);
                wsComm['!cols'] = [{ wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 10 }];
                XLSX.utils.book_append_sheet(wb, wsComm, "Fallo Comunicacion");
            }

            // Hoja 2: Patrones Hardware
            if (cardFailures.length > 0) {
                const wsCard = XLSX.utils.json_to_sheet(cardFailures);
                wsCard['!cols'] = [{ wch: 10 }, { wch: 20 }, { wch: 15 }, { wch: 40 }, { wch: 35 }, { wch: 10 }];
                XLSX.utils.book_append_sheet(wb, wsCard, "Posible Fallo Tarjeta");
            }

            const fileName = `Diagnostico_Avanzado_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, fileName);
            setIsOpen(false);

        } catch (e) {
            console.error(e);
            alert("Error generando reporte avanzado.");
        } finally {
            setLoading(false);
        }
    };

    // --- HANDLER PDF (Mantengo tu lógica existente si la necesitas) ---
    // Nota: Si no usas el PDF, puedes eliminar esta función y el botón correspondiente.
    const handlePdf = async () => {
        setLoading(true);
        try {
            const rawData = await getData();
            // Lógica simplificada de agregación para el PDF (Reutilizando la lógica existente o similar)
            // ... (Tu código de PDF iría aquí si lo mantienes) ...
            alert("Función PDF no modificada en este paso. Usa Excel para la Orden de Trabajo.");
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white">
                    <Download className="mr-2 h-4 w-4" /> Reportes
                </Button>
            </DialogTrigger>

            <DialogContent className="bg-slate-950 border-slate-800 text-slate-100 sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Generar Orden de Mantenimiento</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label>Alcance</Label>
                        <Select value={scope} onValueChange={(v: any) => setScope(v)}>
                            <SelectTrigger className="bg-slate-900 border-slate-700">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-700 text-slate-300">
                                <SelectItem value="global">Todo el Parque (Global)</SelectItem>
                                <SelectItem value="ps">Por Power Station</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {scope === 'ps' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>Power Station</Label>
                                <Select value={selectedPs} onValueChange={setSelectedPs}>
                                    <SelectTrigger className="bg-slate-900 border-slate-700">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700 text-slate-300 h-60">
                                        {Array.from({ length: 14 }, (_, i) => `PS${i + 1}`).map(ps => (
                                            <SelectItem key={ps} value={ps}>{ps}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>Inversor</Label>
                                <Select value={selectedInv} onValueChange={setSelectedInv}>
                                    <SelectTrigger className="bg-slate-900 border-slate-700">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-700 text-slate-300">
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="1">Inversor 1</SelectItem>
                                        <SelectItem value="2">Inversor 2</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-col gap-3 mt-4">
                    <Button
                        variant="outline"
                        onClick={handleExcel}
                        disabled={loading}
                        className="border-emerald-600/50 text-emerald-500 hover:bg-emerald-950/30 hover:text-emerald-400 w-full h-12"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileSpreadsheet className="mr-2 h-5 w-5" />}
                        Descargar Orden de Trabajo (Excel)
                    </Button>

                    <Button
                        variant="ghost"
                        onClick={handleAdvancedReport}
                        disabled={loading}
                        className="text-slate-400 hover:text-white hover:bg-slate-800 w-full h-10 text-sm"
                    >
                        {loading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Activity className="mr-2 h-4 w-4" />}
                        Diagnóstico Avanzado (Offline + Tarjetas)
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}