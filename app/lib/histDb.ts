// app/lib/histDb.ts
// Conexión de SOLO LECTURA a la base histórica que escribe el driver (rollups de 5 min).
// La usa el motor de PR/Producción. No escribe nada: el dueño de esta base es el historiador Rust.
import Database from 'better-sqlite3';
import { HISTORICAL_DB_PATH } from './data-paths';

const dbPath = HISTORICAL_DB_PATH;

export const historicalDbStatus: { available: boolean; path: string; error: string | null } = {
    available: false,
    path: dbPath,
    error: null,
};

let histDb: Database.Database;

try {
    // OJO: NO poner `pragma('journal_mode = WAL')` en una conexión readonly.
    // Cambiar el journal_mode es una ESCRITURA; si la base no está ya en WAL (la histórica no lo
    // está), el pragma lanza "attempt to write a readonly database", cae al catch y termina
    // abriendo una base :memory: VACÍA -> todas las consultas dan "no such table". Un lector
    // readonly lee una base WAL o no-WAL sin necesidad de tocar el journal_mode.
    histDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    historicalDbStatus.available = true;
} catch (error) {
    console.error("❌ Error conectando a la BD histórica ('pv_historical.db').");
    console.error(error);
    historicalDbStatus.error = error instanceof Error ? error.message : String(error);
    histDb = new Database(':memory:');
}

export default histDb;
