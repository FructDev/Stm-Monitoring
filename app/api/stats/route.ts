/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import db from "@/app/lib/db";
import { PsSummary } from "@/app/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const UMBRAL_SEGUNDOS = 36000000; // 15 minutos

    // 🔥 CAMBIO: Traemos TODAS las columnas (s01...s18) para analizar strings
    const rawData = db
      .prepare(
        `
      SELECT * FROM lecturas_live
    `
      )
      .all() as any[];

    const now = new Date().getTime();

    let total_amps = 0;
    let total_voltage_sum = 0;
    let voltage_count = 0;

    let total_scbs = 0;
    let online_scbs = 0;
    let offline_scbs = 0;
    let alert_scbs = 0;

    // 🔥 NUEVO CONTADOR
    let total_dead_strings = 0;

    const stationMap: Record<
      string,
      {
        total_amps: number;
        scb_count: number;
        offline_count: number;
        alert_count: number;
        last_ts: string;
      }
    > = {};

    // Lista de claves de strings para iterar rápido
    const stringKeys = Array.from(
      { length: 18 },
      (_, i) => `s${String(i + 1).padStart(2, "0")}`
    );

    for (const row of rawData) {
      const rowDate = new Date(row.ts);
      const diffSeconds = (now - rowDate.getTime()) / 1000;
      const isZombie = diffSeconds > UMBRAL_SEGUNDOS;

      if (!stationMap[row.power_station]) {
        stationMap[row.power_station] = {
          total_amps: 0,
          scb_count: 0,
          offline_count: 0,
          alert_count: 0,
          last_ts: row.ts,
        };
      }
      const ps = stationMap[row.power_station];

      total_scbs++;
      ps.scb_count++;

      if (row.ts > ps.last_ts) ps.last_ts = row.ts;

      if (isZombie || row.estado === "OFFLINE" || row.estado === "READ_FAIL") {
        offline_scbs++;
        ps.offline_count++;
      } else {
        online_scbs++;

        // Sumar Amperaje Global
        const amps = row.i_total || 0;
        total_amps += amps;
        ps.total_amps += amps;

        if ((row.vdc || 0) > 0) {
          total_voltage_sum += row.vdc;
          voltage_count++;
        }

        // Alertas de Caja
        if (row.estado !== "OK" && row.estado !== "BAJA_TENSION") {
          alert_scbs++;
          ps.alert_count++;
        }

        // 🔥 CÁLCULO DE STRINGS DAÑADOS
        // Solo contamos si la caja tiene corriente (> 2A) para evitar falsos positivos de noche
        if (amps > 2) {
          let deadInBox = 0;
          for (const key of stringKeys) {
            const val = row[key];
            // Si es menor a 0.5A, lo consideramos muerto (Fusible abierto)
            if (val !== null && val < 0.5) {
              deadInBox++;
            }
          }
          total_dead_strings += deadInBox;
        }
      }
    }

    const stationNames = Object.keys(stationMap).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    );

    const stations: PsSummary[] = stationNames.map((name) => {
      const data = stationMap[name];
      let status: PsSummary["status"] = "healthy";

      if (data.offline_count >= data.scb_count) status = "critical";
      else if (data.offline_count > data.scb_count / 2) status = "critical";
      else if (data.offline_count > 0 || data.alert_count > 0)
        status = "warning";

      return {
        name,
        total_amps: data.total_amps,
        scb_count: data.scb_count,
        status,
      };
    });

    const avg_voltage =
      voltage_count > 0 ? total_voltage_sum / voltage_count : 0;

    return NextResponse.json({
      total_amps,
      avg_voltage,
      total_scbs,
      online_scbs,
      offline_scbs,
      alert_scbs,
      total_dead_strings, // <--- Enviamos el nuevo dato
      last_update: new Date().toISOString(),
      stations,
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Error DB" }, { status: 500 });
  }
}
