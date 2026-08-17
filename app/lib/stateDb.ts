import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { TRACKER_BYPASS } from './tracker-config';
import { STATE_DB_PATH } from './data-paths';

const dbPath = STATE_DB_PATH;
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

export const stateDbStatus: { available: boolean; path: string; error: string | null } = {
    available: false,
    path: dbPath,
    error: null,
};

let stateDb: Database.Database;

try {
    stateDb = new Database(dbPath);
    stateDbStatus.available = true;
    stateDb.pragma('journal_mode = WAL');
    
    // Initialize Tables
    stateDb.exec(`
        CREATE TABLE IF NOT EXISTS scb_manual_reviews (
            power_station TEXT,
            inversor INTEGER,
            scb INTEGER,
            card_id INTEGER,
            last_review_ts DATETIME,
            status TEXT,
            PRIMARY KEY(power_station, inversor, scb, card_id)
        );

        CREATE TABLE IF NOT EXISTS ai_predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            power_station TEXT,
            inversor INTEGER,
            scb INTEGER,
            string_id INTEGER,
            prediction_type TEXT, -- 'SOILING', 'SHADING', 'THERMAL_FATIGUE'
            severity TEXT,        -- 'LOW', 'MEDIUM', 'HIGH'
            details TEXT,         -- JSON or string with extra info
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_active BOOLEAN DEFAULT 1,
            mode TEXT DEFAULT 'live'  -- 'shadow' = validación silenciosa (no se muestra al técnico), 'live' = visible
        );

        CREATE TABLE IF NOT EXISTS alarm_acks (
            power_station TEXT,
            inversor INTEGER,
            scb INTEGER,
            alarm_code TEXT,
            ack_ts DATETIME,  -- momento del "Reconocer"; el silencio dura una ventana fija desde aquí
            PRIMARY KEY (power_station, inversor, scb, alarm_code)
        );

        CREATE TABLE IF NOT EXISTS tracker_bypass (
            slave_key TEXT PRIMARY KEY,   -- "PS1-2" (el de encoder dañado)
            master_key TEXT NOT NULL,     -- "PS1-4" (el tracker sano que sigue)
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tracker_command_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            gateway TEXT NOT NULL,
            tracker_idx INTEGER NOT NULL,
            command_type TEXT NOT NULL,
            requested_mode INTEGER,
            requested_setpoint_deg INTEGER,
            requested_at TEXT NOT NULL,
            source_ip TEXT,
            status TEXT NOT NULL DEFAULT 'SENDING',
            driver_status TEXT,
            driver_message TEXT,
            observed_mode INTEGER,
            observed_setpoint_deg INTEGER,
            observed_at TEXT,
            verified_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_tracker_command_target
            ON tracker_command_audit(gateway, tracker_idx, requested_at DESC);

        -- Energía AC medida del medidor fiscal. ÚNICO dato manual del módulo de PR:
        -- no tenemos el medidor por Modbus, así que gerencia la carga un valor por día.
        CREATE TABLE IF NOT EXISTS pr_manual_energy (
            fecha TEXT PRIMARY KEY,       -- 'YYYY-MM-DD' (día local)
            ac_kwh REAL NOT NULL,         -- energía AC medida del día, en kWh
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Constantes del modelo de PR (Ppico, coef. temperatura, degradación, factor de planta...).
        -- Se guardan como clave/valor para poder ajustarlas sin tocar código.
        CREATE TABLE IF NOT EXISTS pr_config (
            key TEXT PRIMARY KEY,
            value REAL NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Sembrar una sola vez los bypass que ya estaban en la config (si la tabla está vacía).
    // A partir de ahí, el bypass se gestiona desde la UI (esta tabla es la fuente de verdad).
    try {
        const c = stateDb.prepare('SELECT COUNT(*) AS c FROM tracker_bypass').get() as { c: number };
        if (c.c === 0) {
            const ins = stateDb.prepare('INSERT OR IGNORE INTO tracker_bypass (slave_key, master_key) VALUES (?, ?)');
            for (const [slave, master] of Object.entries(TRACKER_BYPASS)) ins.run(slave, master);
        }
    } catch {
        /* sin problema si falla la siembra */
    }

    // Migración defensiva: añadir columna 'mode' si la tabla ai_predictions ya existía sin ella.
    // better-sqlite3 lanza si la columna ya existe; lo absorbemos.
    try {
        stateDb.exec(`ALTER TABLE ai_predictions ADD COLUMN mode TEXT DEFAULT 'live'`);
    } catch {
        /* la columna ya existe */
    }
} catch (error) {
    console.error("❌ Error conectando a la BD de estado (dashboard_state.db).");
    console.error(error);
    stateDbStatus.error = error instanceof Error ? error.message : String(error);
    stateDb = new Database(':memory:');
}

export default stateDb;
