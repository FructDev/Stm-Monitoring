/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/heatmap/route.ts
import { NextResponse } from "next/server";
import db from "@/app/lib/db";
import stateDb from "@/app/lib/stateDb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Tolerancia alta a propósito (igual que /api/stats): el deadband del driver hace que una SCB
    // estable conserve un ts viejo aunque comunique. La caída real la marca el driver con estado.
    const UMBRAL_SEGUNDOS = 90000;

    // 1. CAMBIO: Usamos SELECT * para traer s01, s02... s18 y vdc
    const rawData = db
      .prepare(
        `
            SELECT *
            FROM lecturas_live
            WHERE power_station LIKE 'PS%' AND NOT (power_station = 'PS1' AND inversor = 1 AND scb > 18)
            ORDER BY length(power_station), power_station, inversor, scb
        `
      )
      .all() as any[];

    const now = new Date().getTime();
    const confirmedCards = new Map<string, number[]>();
    const reviewRows = stateDb.prepare("SELECT power_station, inversor, scb, card_id FROM scb_manual_reviews").all() as any[];
    for (const r of reviewRows) {
      const key = `${r.power_station}-${r.inversor}-${r.scb}`;
      const cards = confirmedCards.get(key) ?? [];
      cards.push(Number(r.card_id));
      confirmedCards.set(key, cards);
    }
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
    const existingFinalData = cells.map((cell: any) => {
      let performance = 0;
      // Note: cell.i_total is still raw here, need to scale for performance calc against scaled globalAvg
      const cellAmps = (cell.i_total ?? 0) / 100;

      if (cell.estado !== "OFFLINE" && globalAvg > 0) {
        performance = (cellAmps / globalAvg) * 100;
      }

      // 2. CAMBIO: Empaquetar los 18 strings en un array limpio
      // Esto es lo que leerá tu función findDeadStrings en el frontend
      const stringValues = [
        cell.s01, cell.s02, cell.s03, cell.s04, cell.s05, cell.s06,
        cell.s07, cell.s08, cell.s09, cell.s10, cell.s11, cell.s12,
        cell.s13, cell.s14, cell.s15, cell.s16, cell.s17, cell.s18,
      ].map(s => (s ?? 0) / 100); // Fix: Scale strings by 100

      // 3. CAMBIO: DETECCIÓN DE INVERSOR REAL (SCB > 18 = INV 2)
      let finalInversor = cell.inversor;
      let finalScb = cell.scb;

      // Map Rust backend representation (inv 1, scb 19-36) to logical representation (inv 2, scb 1-18)
      if (finalInversor === 1 && finalScb > 18) {
        finalInversor = 2;
        finalScb -= 18;
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
        confirmedCards: confirmedCards.get(`${cell.power_station}-${finalInversor}-${finalScb}`) ?? [],
      };
    });

    // Tercera pasada: Inyectar cajas faltantes para garantizar las 504 completas
    const finalData = [];
    const lookup = new Map(existingFinalData.map(c => [c.id, c]));

    for (let p = 1; p <= 14; p++) {
      const psName = `PS${p}`;
      for (let inv = 1; inv <= 2; inv++) {
        for (let s = 1; s <= 18; s++) {
          const id = `${psName}-${inv}-${s}`;
          if (lookup.has(id)) {
            finalData.push(lookup.get(id));
          } else {
            // Inyectar caja sintética OFFLINE si falta
            finalData.push({
              id,
              ps: psName,
              inversor: inv,
              scb: s,
              amps: 0,
              vdc: 0,
              status: "OFFLINE",
              perf: 0,
              strings: new Array(18).fill(0),
              confirmedCards: [],
            });
          }
        }
      }
    }

    return NextResponse.json({
      stats: finalData,
      global_avg: globalAvg,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Error DB" }, { status: 500 });
  }
}
