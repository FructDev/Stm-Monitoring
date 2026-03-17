/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/heatmap/route.ts
import { NextResponse } from "next/server";
import db from "@/app/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const UMBRAL_SEGUNDOS = 90000;

    // 1. CAMBIO: Usamos SELECT * para traer s01, s02... s18 y vdc
    const rawData = db
      .prepare(
        `
            SELECT *
            FROM lecturas_live
            ORDER BY length(power_station), power_station, inversor, scb
        `
      )
      .all() as any[];

    const now = new Date().getTime();
    let globalSumAmps = 0;
    let activeCount = 0;

    // Primera pasada: Detectar Zombies y Calcular Promedios
    const cells = rawData.map((row) => {
      const rowTime = new Date(row.ts).getTime();
      const diffSeconds = (now - rowTime) / 1000;
      const isZombie = diffSeconds > UMBRAL_SEGUNDOS;

      if (isZombie) {
        // Si es zombie, forzamos OFFLINE pero mantenemos el resto de datos (...row)
        return { ...row, estado: "OFFLINE", i_total: 0, performance: 0 };
      }

      // Relaxed condition: Include any active inverter in average, not just "OK"
      // This fixes the issue where "FAIL" or "ALERTA" statuses caused 0 Global Avg
      if (row.estado !== "OFFLINE" && row.estado !== "READ_FAIL" && row.i_total > 0) {
        globalSumAmps += (row.i_total / 100); // Fix: Scale to Amps
        activeCount++;
      }

      return row;
    });

    const globalAvg = activeCount > 0 ? globalSumAmps / activeCount : 0;

    // Segunda pasada: Formatear para el Frontend
    const finalData = cells.map((cell: any) => {
      let performance = 0;
      // Note: cell.i_total is still raw here, need to scale for performance calc against scaled globalAvg
      const cellAmps = (cell.i_total ?? 0) / 100;

      if (cell.estado !== "OFFLINE" && globalAvg > 0) {
        performance = (cellAmps / globalAvg) * 100;
      }

      // 2. CAMBIO: Empaquetar los 18 strings en un array limpio
      // Esto es lo que leerá tu función findDeadStrings en el frontend
      const stringValues = [
        cell.s01,
        cell.s02,
        cell.s03,
        cell.s04,
        cell.s05,
        cell.s06,
        cell.s07,
        cell.s08,
        cell.s09,
        cell.s10,
        cell.s11,
        cell.s12,
        cell.s13,
        cell.s14,
        cell.s15,
        cell.s16,
        cell.s17,
        cell.s18,
      ].map(s => (s ?? 0) / 100); // Fix: Scale strings by 100

      // 3. CAMBIO: DETECCIÓN DE INVERSOR REAL (SCB > 18 = INV 2)
      // El backend reporta todo como Inv 1, pero sabemos que SCB 19-36 son Inv 2.
      let finalInversor = cell.inversor;
      let finalScb = cell.scb;

      if (cell.scb > 18) {
        finalInversor = 2;
        finalScb = cell.scb; // Mantenemos el número original (19-36)
      }

      return {
        id: `${cell.power_station}-${finalInversor}-${finalScb}`, // Update ID
        ps: cell.power_station,
        inversor: finalInversor, // Use corrected Inverter
        scb: finalScb,           // Use corrected SCB Number
        amps: cellAmps, // Return scaled amps
        vdc: cell.vdc, // Importante para diagnóstico
        status: cell.estado === 'FAIL' ? 'READ_FAIL' : cell.estado, // Fix: Normalize 'FAIL' to 'READ_FAIL'
        perf: performance,
        strings: stringValues, // <--- AQUÍ ESTÁ LA DATA PARA EL EXCEL
      };
    });

    return NextResponse.json({
      stats: finalData,
      global_avg: globalAvg,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Error DB" }, { status: 500 });
  }
}
