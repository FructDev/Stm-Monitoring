import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        // Proxy to local SCADA backend
        const res = await fetch("http://127.0.0.1:3030/snapshot", {
            cache: "no-store",
            next: { revalidate: 0 },
        });

        if (!res.ok) {
            throw new Error(`SCADA Backend Error: ${res.status}`);
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error("SCADA Snapshot Proxy Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch SCADA snapshot", details: String(error) },
            { status: 502 }
        );
    }
}
