import { NextResponse } from 'next/server';
import db from '@/app/lib/db';
import { AlarmEvent } from '@/app/types/alarms';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = searchParams.get('limit') || '100';

        const events = db.prepare(`
      SELECT * FROM alarm_events 
      ORDER BY ts DESC 
      LIMIT ?
    `).all(limit) as AlarmEvent[];

        return NextResponse.json(events);

    } catch (error) {
        console.error("Error fetching alarm events:", error);
        return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
    }
}
