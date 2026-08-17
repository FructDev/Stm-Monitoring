import { NextResponse } from "next/server";
import { calculateExpectedPower } from "@/app/lib/ml_engine/digitalTwin";
import { driverUrl } from "@/app/lib/driver-url";

export const dynamic = "force-dynamic";

// Enriquece cada fila con la corriente esperada del Gemelo Digital, usando la
// irradiancia real (irradiance_avg) que entrega el driver. Alimenta la línea
// "Corriente Favorable" del HistoricalChart.
// NOTA: la magnitud absoluta depende de la calibración de nominalPowerSCB (Fase 3);
// aquí dejamos la fórmula física y la escala se afina con los datos reales del Shadow Mode.
function withExpectedCurrent(rows: any[]): any[] {
    return rows.map((row) => {
        const irr = typeof row.irradiance_avg === "number" ? row.irradiance_avg : null;
        const v = typeof row.v_avg === "number" ? row.v_avg : 0;
        if (irr === null || irr <= 0 || v <= 0) return row;
        const expectedKw = calculateExpectedPower(irr, row.temp_avg ?? 25);
        return { ...row, expected_current: (expectedKw * 1000) / v };
    });
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const gateway = searchParams.get("gateway");
        const mid = searchParams.get("mid");
        const hours = searchParams.get("hours") || "24";

        if (!gateway || !mid) {
            return NextResponse.json({ error: "gateway and mid are required parameters" }, { status: 400 });
        }

        let allData: any[] = [];

        if (mid === 'ALL') {
            // Fetch para las 18 cajas de esta Power Station en paralelo
            const promises = Array.from({ length: 18 }, (_, i) => {
                const url = driverUrl(`/history?gateway=${encodeURIComponent(gateway)}&mid=${i + 1}&hours=${encodeURIComponent(hours)}`);
                return fetch(url, { cache: "no-store" })
                    .then(r => r.ok ? r.json() : { data: [] })
                    .catch(() => ({ data: [] }));
            });
            const results = await Promise.all(promises);
            results.forEach(res => {
                if (res.data && Array.isArray(res.data)) {
                    allData = allData.concat(res.data);
                }
            });
        } else {
            // Fetch normal para un solo dispositivo
            const backendUrl = driverUrl(`/history?gateway=${encodeURIComponent(gateway)}&mid=${encodeURIComponent(mid)}&hours=${encodeURIComponent(hours)}`);
            const res = await fetch(backendUrl, { cache: "no-store" });

            if (!res.ok) throw new Error(`SCADA Backend Error: ${res.status}`);
            const data = await res.json();
            allData = data.data || [];
        }

        return NextResponse.json({ data: withExpectedCurrent(allData) });

    } catch (error) {
        console.error("SCADA History Proxy Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch SCADA history", details: String(error) },
            { status: 502 }
        );
    }
}
