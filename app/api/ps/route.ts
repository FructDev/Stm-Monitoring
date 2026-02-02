/* eslint-disable @typescript-eslint/no-explicit-any */
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
      ORDER BY inversor ASC, scb ASC
    `
      )
      .all(psName) as any[];

    const UMBRAL_SEGUNDOS = 36000000; // 15 Minutos
    const now = new Date().getTime();

    const processedRows = rows.map((row) => {
      // CORRECCIÓN: Parseamos la fecha tal cual viene de la DB (Hora Local)
      // Sin agregarle 'Z' ni cosas raras.
      const rowTime = new Date(row.ts).getTime();

      // Calculamos diferencia
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

    return NextResponse.json(processedRows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
