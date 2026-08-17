import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { getDailyMetrics, getInverterMetrics } from "@/app/lib/pr-engine";
import { loadPrConfig, loadAcEnergy as acEnergyMap } from "@/app/lib/pr-config";

export const dynamic = "force-dynamic";

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "pr_template.xlsm");
const DAILY_SHEET = "Calculos PR - Corregido";
const INV_SHEET = "Sheet1";
const DAILY_FIRST_ROW = 13; // el libro tiene la tabla diaria en filas 13..17
const DAILY_LAST_ROW = 17;
const INV_FIRST_ROW = 3;    // Sheet1 B3..B30 = 28 inversores

// Genera el .xlsx CON el formato exacto del libro de gerencia, usándolo como plantilla:
// solo se escriben las celdas de datos; colores, fuentes y fórmulas del libro se conservan.
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const today = new Date();
        const to = searchParams.get("to") || today.toISOString().slice(0, 10);
        const from = searchParams.get("from") || new Date(new Date(to).getTime() - 6 * 864e5).toISOString().slice(0, 10);
        const day = searchParams.get("date") || to; // día principal para el bloque de cálculo y los inversores

        if (!fs.existsSync(TEMPLATE_PATH)) {
            return NextResponse.json({ error: "Falta la plantilla pr_template.xlsm en /templates" }, { status: 500 });
        }

        const cfg = loadPrConfig();
        const days = getDailyMetrics(from, to, cfg, acEnergyMap(from, to));
        const dayMetrics = getDailyMetrics(day, day, cfg, acEnergyMap(day, day))[0];
        const invs = getInverterMetrics(day, day, cfg);

        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(TEMPLATE_PATH);
        const ws = wb.getWorksheet(DAILY_SHEET);
        const wsi = wb.getWorksheet(INV_SHEET);

        // Escribir SOLO el valor (ExcelJS conserva el estilo previo de cada celda).
        const setVal = (sheet: ExcelJS.Worksheet | undefined, addr: string, v: number | string | Date | null) => {
            if (!sheet) return;
            if (v === null || (typeof v === "number" && !isFinite(v))) return;
            sheet.getCell(addr).value = v;
        };

        // ---- Bloque de cálculo (constantes + inputs del día principal) ----
        if (ws && dayMetrics) {
            setVal(ws, "B2", cfg.ppicoPlantMW);
            setVal(ws, "B6", cfg.tempCoefPerC);
            setVal(ws, "B8", cfg.tempStcC);
            setVal(ws, "K3", cfg.degradationRatePerYear);
            setVal(ws, "K4", cfg.yearsInOperation);
            setVal(ws, "B3", round(dayMetrics.insolationKwhM2, 2));       // insolación (horas sol pico)
            setVal(ws, "B7", dayMetrics.tempPanelC != null ? round(dayMetrics.tempPanelC, 1) : null);
            if (dayMetrics.energyAcMwh != null) setVal(ws, "B1", round(dayMetrics.energyAcMwh * 1000, 1)); // kWh

            // B11/B12 las computa una macro en el libro original (.xlsm). Como exportamos .xlsx
            // (sin VBA), las escribimos nosotros para que no queden con el valor viejo de la plantilla.
            const eAc = dayMetrics.energyAcMwh ?? dayMetrics.energyDcMwh;
            const insol = dayMetrics.insolationKwhM2;
            const ppLin = cfg.ppicoPlantMW * (1 - cfg.degradationRatePerYear * cfg.yearsInOperation);
            if (insol > 0) {
                setVal(ws, "B11", round((eAc / (dayMetrics.ppicoDegMW * insol)) * 100, 2)); // degradación exponencial
                setVal(ws, "B12", round((eAc / (ppLin * insol)) * 100, 2));                 // degradación lineal
            }
        }

        // ---- Tabla diaria (filas 13..17): los 5 días más recientes del rango ----
        if (ws) {
            const last = days.slice(-(DAILY_LAST_ROW - DAILY_FIRST_ROW + 1));
            for (let i = 0; i < (DAILY_LAST_ROW - DAILY_FIRST_ROW + 1); i++) {
                const r = DAILY_FIRST_ROW + i;
                const d = last[i];
                if (d) {
                    ws.getCell(`C${r}`).value = new Date(d.fecha + "T00:00:00");
                    setVal(ws, `D${r}`, round(d.energyEstimatedMwh, 2));
                    setVal(ws, `E${r}`, d.energyRealMwh != null ? round(d.energyRealMwh, 2) : null);
                    setVal(ws, `G${r}`, round(d.insolationKwhM2, 2));
                    setVal(ws, `H${r}`, round(((d.prDeg ?? d.prDcDeg) ?? 0) * 100, 2));
                    setVal(ws, `I${r}`, d.tempPanelC != null ? round(d.tempPanelC, 1) : null);
                } else {
                    // Fila sin datos: limpiar para no dejar valores viejos de la plantilla ni romper SUM/F.
                    for (const col of ["C", "D", "E", "F", "G", "H", "I"]) ws.getCell(`${col}${r}`).value = null;
                }
            }
        }

        // ---- Sheet1: energía DC por inversor (kWh), orden 01.1 .. 14.2 ----
        if (wsi) {
            const byCode = new Map(invs.map((v) => [v.code, v]));
            const order: string[] = [];
            for (let ps = 1; ps <= 14; ps++) for (const inv of [1, 2]) order.push(`${String(ps).padStart(2, "0")}.${inv}`);
            order.forEach((code, idx) => {
                const v = byCode.get(code);
                if (v) setVal(wsi, `B${INV_FIRST_ROW + idx}`, round(v.energyDcMwh * 1000, 2)); // kWh
            });
            setVal(wsi, "B1", day);
        }

        const buf = await wb.xlsx.writeBuffer();
        return new NextResponse(buf as ArrayBuffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="Calculo_PR_Girasol_${day}.xlsx"`,
            },
        });
    } catch (error) {
        console.error("Error en /api/pr/export:", error);
        return NextResponse.json({ error: "No se pudo generar el Excel" }, { status: 500 });
    }
}

function round(v: number, d: number): number {
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
}
