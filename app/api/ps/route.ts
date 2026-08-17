import { NextRequest, NextResponse } from "next/server";
import db from "@/app/lib/db";
import stateDb from "@/app/lib/stateDb";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const psName = searchParams.get("name");

  if (!psName)
    return NextResponse.json({ error: "Missing name" }, { status: 400 });

  try {
    const rows = db
      .prepare(
        `
      SELECT * FROM lecturas_live 
      WHERE power_station = ? AND NOT (power_station = 'PS1' AND inversor = 1 AND scb > 18)
    `
      )
      .all(psName) as any[];

    // Fetch manual reviews map
    const reviewsMap: any = {};
    const reviewRows = stateDb.prepare("SELECT * FROM scb_manual_reviews WHERE power_station = ?").all(psName);
    reviewRows.forEach((r: any) => {
        if (!reviewsMap[r.inversor]) reviewsMap[r.inversor] = {};
        if (!reviewsMap[r.inversor][r.scb]) reviewsMap[r.inversor][r.scb] = {};
        reviewsMap[r.inversor][r.scb][r.card_id] = r.last_review_ts;
    });

    // Tolerancia alta: el deadband del driver hace que una SCB estable conserve un ts viejo aunque
    // comunique. La caída real la marca el driver con estado OFFLINE/FAIL.
    const UMBRAL_SEGUNDOS = 90000;
    const now = new Date().getTime();

    // Usamos un Hash Map para agrupar por (inversor-scb) físico y quedarnos solo con el más reciente.
    const uniqueMap = new Map();

    rows.forEach((row) => {
      let mappedInversor = row.inversor;
      let mappedScb = row.scb;

      // Mapear la representación de Rust (inv 1, scb 19-36) a representación lógica (inv 2, scb 1-18)
      // Esto aplica para todas las PS excepto la PS1 (porque Rust ya manda inv 2 para la PS1)
      if (mappedInversor === 1 && mappedScb > 18) {
        mappedInversor = 2;
        mappedScb -= 18;
      }

      const key = `${mappedInversor}-${mappedScb}`;
      const existing = uniqueMap.get(key);
      const rowTime = new Date(row.ts).getTime();

      if (!existing || rowTime > new Date(existing.ts).getTime()) {
        uniqueMap.set(key, {
          ...row,
          inversor: mappedInversor,
          scb: mappedScb
        });
      }
    });

    // Garantizar la matriz completa de 36 cajas (Inv 1 y 2, SCB 1 a 18)
    const finalRows = [];
    for (let inv = 1; inv <= 2; inv++) {
      for (let s = 1; s <= 18; s++) {
        const key = `${inv}-${s}`;
        const existingRow = uniqueMap.get(key);
        
        if (existingRow) {
          const rowTime = new Date(existingRow.ts).getTime();
          const secondsDiff = (now - rowTime) / 1000;
          
          if (secondsDiff > UMBRAL_SEGUNDOS) {
            finalRows.push({
              ...existingRow,
              estado: "OFFLINE",
              i_total: 0,
              vdc: 0,
              fail_count: 99,
            });
          } else {
            finalRows.push(existingRow);
          }
        } else {
          // Inyectar caja sintética OFFLINE si falta por completo en SQLite (ej. Rust la omitió)
          finalRows.push({
            power_station: psName,
            inversor: inv,
            scb: s,
            estado: "OFFLINE",
            i_total: 0,
            vdc: 0,
            ts: new Date().toISOString(),
            fail_count: 99,
            manual_reviews: reviewsMap[inv]?.[s]
          });
        }
      }
    }
    
    // Attach reviews to existing rows too
    finalRows.forEach(r => {
      r.manual_reviews = reviewsMap[r.inversor]?.[r.scb];
    });

    return NextResponse.json(finalRows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
