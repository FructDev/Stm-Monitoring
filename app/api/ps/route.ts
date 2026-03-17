import { NextRequest, NextResponse } from "next/server";
import db from "@/app/lib/db";

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
      WHERE power_station = ? 
    `
      )
      .all(psName) as any[];

    const UMBRAL_SEGUNDOS = 36000000; // 15 Minutos
    const now = new Date().getTime();

    // Deduplicación vital: 
    // Como V1 insertó Inversor 1 con SCB 19-36 y V2 inserta directamente
    // Inversor 2 con SCB 1-18, si aplicamos el mapeo ambos terminan en la misma URL física.
    // Usamos un Hash Map para agrupar por (inversor-scb) físico y quedarnos solo con el más reciente.
    const uniqueMap = new Map();

    rows.forEach((row) => {
      let mappedInversor = row.inversor;
      let mappedScb = row.scb;
      const normPs = String(row.power_station).replace(/\s+/g, '').toUpperCase();

      if (mappedScb > 18) {
        mappedInversor = 2; // Mapeo legado de V1
        if (normPs === 'PS1') {
          if (mappedScb >= 27 && mappedScb <= 36) mappedScb = mappedScb - 26;
          else if (mappedScb >= 19 && mappedScb <= 26) mappedScb = mappedScb - 8;
        } else {
          mappedScb = mappedScb - 18;
        }
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

    const processedRows = Array.from(uniqueMap.values()).map((row) => {
      const rowTime = new Date(row.ts).getTime();
      const secondsDiff = (now - rowTime) / 1000;

      // Si es zombie (> 15 min), forzamos OFFLINE visual
      if (secondsDiff > UMBRAL_SEGUNDOS) {
        return {
          ...row,
          estado: "OFFLINE",
          i_total: 0,
          vdc: 0,
          fail_count: 99,
        };
      }
      return row;
    });

    // Sort manual ya que agrupar rompe el ORDER BY de SQL
    processedRows.sort((a, b) => {
      if (a.inversor !== b.inversor) return a.inversor - b.inversor;
      return a.scb - b.scb;
    });

    return NextResponse.json(processedRows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
