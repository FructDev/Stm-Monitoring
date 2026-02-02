// app/lib/db.ts
import Database from 'better-sqlite3';
import path from 'path';

// NOTA: Ajusta esta ruta si tu DB está en otro lado en producción.
// En desarrollo, asume que copiaste el archivo a /data dentro del proyecto next.
const dbPath = path.join(process.cwd(), 'data', 'pv_14ps_live.db');

let db: Database.Database;

try {
    db = new Database(dbPath, { readonly: true, fileMustExist: false });
    db.pragma('journal_mode = WAL'); // Crucial para leer mientras Python escribe
} catch (error) {
    console.error("❌ Error conectando a la BD. Asegúrate que 'pv_14ps_live.db' existe en la carpeta /data.");
    console.error(error);
    // Creamos una instancia dummy para que no explote el build, pero fallará al consultar
    db = new Database(':memory:');
}

export default db;