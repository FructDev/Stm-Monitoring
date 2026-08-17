import { NextResponse } from 'next/server';
import { runDailyAnalyticsForScb } from '@/app/lib/ml_engine/runner';
import { getLogicalScb } from '@/app/lib/scb-config';

// Este endpoint debería ser llamado por un cron job del sistema operativo
// (Windows Task Scheduler) cada 24h. La llave protege la ejecución; configúrala
// en .env como CRON_SECRET (no se versiona).
const CRON_SECRET = process.env.CRON_SECRET || 'girasol-ai-secret-key';

// Shadow Mode por defecto: la IA escribe predicciones en silencio (no visibles al
// técnico) hasta validarla. Solo pasa a 'live' cuando AI_SHADOW_MODE=false explícito.
const AI_MODE: 'shadow' | 'live' = process.env.AI_SHADOW_MODE === 'false' ? 'live' : 'shadow';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key !== CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log(`[AI Worker] Iniciando análisis predictivo diario (modo: ${AI_MODE})...`);
        const startTime = Date.now();
        let analyzed = 0;

        // Topología fija del parque: 14 plantas (PS1-PS14), cada una con 36
        // dispositivos Modbus (MID 1-36). Convertimos cada MID físico a su
        // (inversor, scb) lógico para guardar la predicción de forma coherente
        // con el resto del dashboard.
        for (let p = 1; p <= 14; p++) {
            const psName = `PS${p}`;
            for (let mid = 1; mid <= 36; mid++) {
                const { inversor, scb } = getLogicalScb(psName, mid);
                // Secuencial para no saturar Node.js ni el driver con 504 peticiones simultáneas
                await runDailyAnalyticsForScb(psName, mid, inversor, scb, AI_MODE);
                analyzed++;
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[AI Worker] Análisis completado: ${analyzed} cajas en ${duration} segundos.`);

        return NextResponse.json({
            success: true,
            message: 'Análisis predictivo completado con éxito',
            mode: AI_MODE,
            analyzed,
            duration_seconds: duration
        });
    } catch (error) {
        console.error('[AI Worker] Error fatal:', error);
        return NextResponse.json({ error: 'Error interno del AI Worker' }, { status: 500 });
    }
}
