/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import db from "@/app/lib/db";
import { PsSummary } from "@/app/types";
import { getScbCapacity } from "@/app/lib/scb-config";
import stateDb from "@/app/lib/stateDb";
import { analyzeScb } from "@/app/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const UMBRAL_SEGUNDOS = 90000; // 15 minutos

    // 🔥 CAMBIO: Traemos TODAS las columnas (s01...s18) para analizar strings
    // Filtramos los registros antiguos de Python (PS1 inversor 1 scb > 18) dejando solo los vivos de Rust
    const rawData = db
      .prepare(
        `
      SELECT * FROM lecturas_live WHERE power_station LIKE 'PS%' AND NOT (power_station = 'PS1' AND inversor = 1 AND scb > 18)
    `
      )
      .all() as any[];

    // Fetch manual reviews map
    const reviewsMap: any = {};
    const reviewRows = stateDb.prepare("SELECT * FROM scb_manual_reviews").all();
    reviewRows.forEach((r: any) => {
        if (!reviewsMap[r.power_station]) reviewsMap[r.power_station] = {};
        if (!reviewsMap[r.power_station][r.inversor]) reviewsMap[r.power_station][r.inversor] = {};
        if (!reviewsMap[r.power_station][r.inversor][r.scb]) reviewsMap[r.power_station][r.inversor][r.scb] = {};
        
        reviewsMap[r.power_station][r.inversor][r.scb][r.card_id] = r.last_review_ts;
    });

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
        dead_strings_count: number;
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
          dead_strings_count: 0,
          last_ts: row.ts,
        };
      }
      const ps = stationMap[row.power_station];

      total_scbs++;
      ps.scb_count++;

      if (row.ts > ps.last_ts) ps.last_ts = row.ts;

      if (isZombie || row.estado === "OFFLINE" || row.estado === "READ_FAIL" || row.estado === "FAIL") {
        offline_scbs++;
        ps.offline_count++;
      } else {
        online_scbs++;

        // Sumar Amperaje Global
        const amps = (row.i_total || 0) / 100; // Fix: Scale by 100
        total_amps += amps;
        ps.total_amps += amps;

        if ((row.vdc || 0) > 0) {
          total_voltage_sum += row.vdc;
          voltage_count++;
        }

        // Alertas de Caja
        if (row.estado !== "OK" && row.estado !== "ONLINE" && row.estado !== "BAJA_TENSION") {
          alert_scbs++;
          ps.alert_count++;
        }

        // 🔥 NUEVA LÓGICA DE STRINGS DAÑADOS (Estadística Relativa + Fallo de Tarjetas)
        let finalInversor = row.inversor;
        let finalScb = row.scb;
        if (finalInversor === 1 && finalScb > 18) {
            finalInversor = 2;
            finalScb -= 18;
        }
        
        // Adjuntar revisiones manuales
        row.manual_reviews = reviewsMap[row.power_station]?.[finalInversor]?.[finalScb];
        
        const analysis = analyzeScb(row);
        
        total_dead_strings += analysis.deadStrings;
        ps.dead_strings_count += analysis.deadStrings;
      }
    }

    // 🔥 INYECTAR CAJAS FALTANTES PARA GARANTIZAR 504 TOTALES
    for (let p = 1; p <= 14; p++) {
      const psName = `PS${p}`;
      const ps = stationMap[psName];
      if (ps) {
        if (ps.scb_count < 36) {
          const missing = 36 - ps.scb_count;
          ps.scb_count += missing;
          ps.offline_count += missing;
          total_scbs += missing;
          offline_scbs += missing;
        }
      } else {
        stationMap[psName] = {
          total_amps: 0,
          scb_count: 36,
          offline_count: 36,
          alert_count: 0,
          dead_strings_count: 0,
          last_ts: new Date().toISOString()
        };
        total_scbs += 36;
        offline_scbs += 36;
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
        dead_strings: data.dead_strings_count,
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
