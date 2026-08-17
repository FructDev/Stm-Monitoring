import { NextResponse } from 'next/server';
import stateDb from '@/app/lib/stateDb';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        // Solo predicciones 'live': las de Shadow Mode se validan en silencio y nunca llegan al técnico.
        const stmt = stateDb.prepare(`
            SELECT id, power_station, inversor, scb, string_id, prediction_type, severity, details, created_at
            FROM ai_predictions
            WHERE is_active = 1 AND mode = 'live'
            ORDER BY
                CASE severity 
                    WHEN 'HIGH' THEN 1 
                    WHEN 'MEDIUM' THEN 2 
                    WHEN 'LOW' THEN 3 
                    ELSE 4 
                END,
                created_at DESC
        `);
        
        const predictions = stmt.all();

        return NextResponse.json(predictions);
    } catch (error) {
        console.error("❌ Error fetching predictions:", error);
        return NextResponse.json({ error: "Failed to fetch predictions" }, { status: 500 });
    }
}
