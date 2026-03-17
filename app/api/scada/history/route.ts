import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
                const url = `http://127.0.0.1:3030/history?gateway=${gateway}&mid=${i + 1}&hours=${hours}`;
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
            const backendUrl = `http://127.0.0.1:3030/history?gateway=${gateway}&mid=${mid}&hours=${hours}`;
            const res = await fetch(backendUrl, { cache: "no-store" });

            if (!res.ok) throw new Error(`SCADA Backend Error: ${res.status}`);
            const data = await res.json();
            allData = data.data || [];
        }

        return NextResponse.json({ data: allData });

    } catch (error) {
        console.error("SCADA History Proxy Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch SCADA history", details: String(error) },
            { status: 502 }
        );
    }
}
