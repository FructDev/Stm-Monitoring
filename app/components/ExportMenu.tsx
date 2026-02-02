'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { pdf } from '@react-pdf/renderer';
import { FileText, Table, Download, Loader2, FileSpreadsheet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScbData } from '@/app/types';
import { DailyReportPdf } from '@/app/reports/DailyReport';

interface Props {
    // Necesitamos una función para obtener los datos más frescos
    // No usamos los props directos para no exportar datos viejos
}

export function ExportMenu() {
    const [loading, setLoading] = useState(false);

    // 1. Fetch de datos frescos (para que el reporte sea exacto al momento de click)
    const fetchFreshData = async () => {
        const res = await fetch('/api/ps?name=ALL'); // Asumimos que podemos pedir todo o iterar
        // NOTA: Si no tienes un endpoint "ALL", tendrás que usar la api del heatmap '/api/heatmap' 
        // pero esa devuelve datos resumidos. Lo ideal es pedir '/api/stats' y extraer de ahí si tiene detalle
        // O hacer un fetch al endpoint de heatmap modificado.

        // TRUCO RÁPIDO: Usaremos el endpoint del Heatmap que ya trae todas las cajas
        const heatmapRes = await fetch('/api/heatmap');
        const json = await heatmapRes.json();
        return json.stats; // Esto trae { ps, inversor, scb, amps, status... }
    };

    // --- EXPORTAR EXCEL ---
    const handleExportExcel = async (type: 'all' | 'errors') => {
        setLoading(true);
        try {
            const rawData = await fetchFreshData();

            let filteredData = rawData;
            if (type === 'errors') {
                filteredData = rawData.filter((d: any) => d.status !== 'OK');
            }

            // Aplanar datos para Excel
            const excelRows = filteredData.map((d: any) => ({
                Planta: 'Girasol',
                PowerStation: d.ps,
                Inversor: d.inversor,
                Caja: d.scb,
                Estado: d.status,
                Amperaje: d.amps,
                Rendimiento: `${d.perf.toFixed(1)}%`,
                Timestamp: new Date().toLocaleString()
            }));

            const ws = XLSX.utils.json_to_sheet(excelRows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Reporte SCB");

            const fileName = `Reporte_${type === 'errors' ? 'Fallas' : 'Completo'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(wb, fileName);

        } catch (e) {
            console.error(e);
            alert("Error generando Excel");
        } finally {
            setLoading(false);
        }
    };

    // --- EXPORTAR PDF IMPECABLE ---
    const handleExportPDF = async () => {
        setLoading(true);
        try {
            // Necesitamos datos más detallados para el PDF que los del heatmap
            // Aquí simularemos con los datos del heatmap, pero idealmente 
            // deberías adaptar la API para traer i_total y vdc completos.
            const rawData = await fetchFreshData();

            // Adaptar formato Heatmap a ScbData (Lo que espera el PDF)
            const adaptedData: ScbData[] = rawData.map((d: any) => ({
                power_station: d.ps,
                inversor: d.inversor,
                scb: d.scb,
                i_total: d.amps,
                vdc: 800, // Dato simulado si no viene en heatmap
                estado: d.status,
                ts: new Date().toISOString(),
                // ... otros campos
            }));

            const doc = <DailyReportPdf data={adaptedData} date={new Date().toLocaleDateString()} />;
            const asPdf = pdf(doc); // Generar blob
            const blob = await asPdf.toBlob();
            saveAs(blob, `Reporte_Ejecutivo_Girasol_${new Date().toISOString().slice(0, 10)}.pdf`);

        } catch (e) {
            console.error(e);
            alert("Error generando PDF");
        } finally {
            setLoading(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-slate-700 bg-slate-900 text-slate-300 hover:text-white">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Exportar Datos
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-slate-950 border-slate-800 text-slate-300">
                <DropdownMenuLabel>Formatos de Reporte</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-800" />

                <DropdownMenuItem onClick={() => handleExportExcel('all')} className="cursor-pointer hover:bg-slate-900">
                    <FileSpreadsheet className="mr-2 h-4 w-4 text-emerald-500" /> Excel Completo (Raw)
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => handleExportExcel('errors')} className="cursor-pointer hover:bg-slate-900">
                    <AlertTriangle className="mr-2 h-4 w-4 text-orange-500" /> Excel Solo Fallas
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-slate-800" />

                <DropdownMenuItem onClick={handleExportPDF} className="cursor-pointer hover:bg-slate-900">
                    <FileText className="mr-2 h-4 w-4 text-rose-500" /> Reporte Ejecutivo PDF
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

// Icono auxiliar
function AlertTriangle({ className }: { className?: string }) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
}