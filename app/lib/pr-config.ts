// app/lib/pr-config.ts
// Helpers compartidos por las rutas de PR. Viven en un módulo normal (NO en un route.ts)
// para no importar entre route handlers, que Next.js no maneja bien.
import stateDb from "./stateDb";
import histDb from "./histDb";
import { DEFAULT_PR_CONFIG, PrConfig } from "./pr-engine";

/** Constantes del modelo, mezclando los defaults del Excel con lo guardado en pr_config. */
export function loadPrConfig(): PrConfig {
    const cfg: PrConfig = { ...DEFAULT_PR_CONFIG };
    try {
        const rows = stateDb.prepare("SELECT key, value FROM pr_config").all() as { key: string; value: number }[];
        for (const r of rows) {
            if (r.key in cfg && typeof r.value === "number") {
                (cfg as unknown as Record<string, number>)[r.key] = r.value;
            }
        }
    } catch { /* tabla nueva: defaults */ }
    return cfg;
}

/** Energía AC medida (manual) por día, en kWh, para el rango dado. */
export function loadAcEnergy(from: string, to: string): Record<string, number> {
    const map: Record<string, number> = {};
    try {
        const rows = stateDb
            .prepare("SELECT fecha, ac_kwh FROM pr_manual_energy WHERE fecha >= ? AND fecha <= ?")
            .all(from, to) as { fecha: string; ac_kwh: number }[];
        for (const r of rows) map[r.fecha] = r.ac_kwh;
    } catch { /* sin datos */ }
    return map;
}

/** Última fecha (local) con datos en el histórico; sirve para abrir la página donde SÍ hay datos. */
export function latestDataDate(cfg: PrConfig): string | null {
    const h = cfg.tzOffsetHours;
    const tzMod = `${h >= 0 ? "+" : "-"}${Math.abs(h)} hours`;
    try {
        const row = histDb.prepare("SELECT date(MAX(ts), ?) AS d FROM historico_5m").get(tzMod) as { d: string | null };
        return row?.d ?? null;
    } catch {
        return null;
    }
}

export function addDaysIso(iso: string, days: number): string {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
