import path from 'path';

function resolveConfiguredPath(value: string | undefined, fallback: string): string {
    return path.resolve(value?.trim() || fallback);
}

export const DATA_DIR = resolveConfiguredPath(
    process.env.SCADA_DATA_DIR,
    path.join(process.cwd(), 'data'),
);

export const LIVE_DB_PATH = resolveConfiguredPath(
    process.env.SCADA_LIVE_DB_PATH,
    path.join(DATA_DIR, 'pv_14ps_live.db'),
);

export const HISTORICAL_DB_PATH = resolveConfiguredPath(
    process.env.SCADA_HISTORICAL_DB_PATH,
    path.join(DATA_DIR, 'pv_historical.db'),
);

export const STATE_DB_PATH = resolveConfiguredPath(
    process.env.SCADA_STATE_DB_PATH,
    path.join(DATA_DIR, 'dashboard_state.db'),
);

export const AI_SHADOW_LOG_PATH = resolveConfiguredPath(
    process.env.SCADA_AI_SHADOW_LOG_PATH,
    path.join(DATA_DIR, 'ai_shadow_log.jsonl'),
);
