import { NextResponse } from "next/server";
import fs from "fs";
import { liveDbStatus } from "@/app/lib/db";
import { historicalDbStatus } from "@/app/lib/histDb";
import { stateDbStatus } from "@/app/lib/stateDb";

export const dynamic = "force-dynamic";

function describe(source: { available: boolean; path: string; error: string | null }) {
    let sizeBytes: number | null = null;
    let modifiedAt: string | null = null;
    try {
        const stat = fs.statSync(source.path);
        sizeBytes = stat.size;
        modifiedAt = stat.mtime.toISOString();
    } catch {
        // La disponibilidad y el error de apertura ya están registrados por el conector.
    }
    return { ...source, sizeBytes, modifiedAt };
}

export async function GET() {
    const sources = {
        live: describe(liveDbStatus),
        historical: describe(historicalDbStatus),
        state: describe(stateDbStatus),
    };
    const allAvailable = Object.values(sources).every((source) => source.available);

    return NextResponse.json({
        status: allAvailable ? "available" : "degraded",
        message: allAvailable
            ? "Las tres fuentes SQLite están disponibles."
            : "Una o más fuentes SQLite no están disponibles; una base temporal no debe interpretarse como ausencia real de datos.",
        sources,
    }, { status: allAvailable ? 200 : 503 });
}
