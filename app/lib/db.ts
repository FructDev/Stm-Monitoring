// app/lib/db.ts
import Database from 'better-sqlite3';
import { LIVE_DB_PATH } from './data-paths';

// NOTA: Ajusta esta ruta si tu DB está en otro lado en producción.
// En desarrollo, asume que copiaste el archivo a /data dentro del proyecto next.
const dbPath = LIVE_DB_PATH;

export const liveDbStatus: { available: boolean; path: string; error: string | null } = {
    available: false,
    path: dbPath,
    error: null,
};

let db: Database.Database;

try {
    // Lector readonly: NO seteamos journal_mode aquí. Cambiarlo es una escritura y, si la base no
    // estuviera en WAL, lanzaría "attempt to write a readonly database" y caeríamos a :memory: vacía.
    // Un lector readonly lee una base WAL igual sin tocar el pragma (el WAL lo activa el driver escritor).
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    liveDbStatus.available = true;
} catch (error) {
    console.error("❌ Error conectando a la BD. Asegúrate que 'pv_14ps_live.db' existe en la carpeta /data.");
    console.error(error);
    liveDbStatus.error = error instanceof Error ? error.message : String(error);
    // Creamos una instancia dummy para que no explote el build, pero fallará al consultar
    db = new Database(':memory:');
}

export default db;
