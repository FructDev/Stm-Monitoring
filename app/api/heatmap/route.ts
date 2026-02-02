/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/heatmap/route.ts
import { NextResponse } from "next/server";
import db from "@/app/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const UMBRAL_SEGUNDOS = 36000000;

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

      if (row.estado === "OK" && row.i_total > 0) {
        globalSumAmps += row.i_total;
        activeCount++;
      }

      return row;
    });

    const globalAvg = activeCount > 0 ? globalSumAmps / activeCount : 0;

    // Segunda pasada: Formatear para el Frontend
    const finalData = cells.map((cell: any) => {
      let performance = 0;
      if (cell.estado !== "OFFLINE" && globalAvg > 0) {
        performance = (cell.i_total / globalAvg) * 100;
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
      ];

      return {
        id: `${cell.power_station}-${cell.inversor}-${cell.scb}`,
        ps: cell.power_station,
        inversor: cell.inversor,
        scb: cell.scb,
        amps: cell.i_total,
        vdc: cell.vdc, // Importante para diagnóstico
        status: cell.estado,
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
