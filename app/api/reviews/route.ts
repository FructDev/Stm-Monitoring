import { NextRequest, NextResponse } from "next/server";
import stateDb from "@/app/lib/stateDb";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const rows = stateDb.prepare("SELECT * FROM scb_manual_reviews").all();
        
        // Convert array to a nested map: { [ps]: { [inversor]: { [scb]: { [cardId]: timestamp } } } }
        // To make it easy for frontend and backend analytics
        const reviewsMap: any = {};
        rows.forEach((r: any) => {
            if (!reviewsMap[r.power_station]) reviewsMap[r.power_station] = {};
            if (!reviewsMap[r.power_station][r.inversor]) reviewsMap[r.power_station][r.inversor] = {};
            if (!reviewsMap[r.power_station][r.inversor][r.scb]) reviewsMap[r.power_station][r.inversor][r.scb] = {};
            
            reviewsMap[r.power_station][r.inversor][r.scb][r.card_id] = r.last_review_ts;
        });

        return NextResponse.json(reviewsMap);
    } catch (error) {
        console.error("Error fetching reviews:", error);
        return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { power_station, inversor, scb, card_id } = body;

        if (!power_station || !inversor || !scb || !card_id) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const now = new Date().toISOString();

        stateDb.prepare(`
            INSERT INTO scb_manual_reviews (power_station, inversor, scb, card_id, last_review_ts, status)
            VALUES (?, ?, ?, ?, ?, 'OK')
            ON CONFLICT(power_station, inversor, scb, card_id) DO UPDATE SET
            last_review_ts=excluded.last_review_ts,
            status=excluded.status
        `).run(power_station, inversor, scb, card_id, now);

        return NextResponse.json({ success: true, timestamp: now });
    } catch (error) {
        console.error("Error saving review:", error);
        return NextResponse.json({ error: "Failed to save review" }, { status: 500 });
    }
}
