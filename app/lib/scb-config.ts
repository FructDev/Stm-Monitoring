// app/lib/scb-config.ts

// Definición de Cajas de 15 Strings (Excepción)
// Formato: 'PS#-INV#-SCB#'
// Nota: Usamos la numeración lógica del usuario:
// - PS: 'PS1', 'PS2'...
// - Inversor: 1 o 2 (Donde 2 incluye las cajas de 19-36 del API)
// - SCB: 1 a 18 (Para Inversor 2, SCB 19 es 1)

const FIFTEEN_STRING_SCBS = new Set([
    'PS1-2-8', 'PS1-2-9',
    'PS2-2-1', 'PS2-2-4',
    'PS3-2-15', 'PS3-2-18',
    'PS4-2-17', 'PS4-2-18',
    'PS5-1-14', 'PS5-2-1',
    'PS6-1-9', 'PS6-2-1',
    'PS7-1-9', 'PS7-2-1',
    'PS8-1-12', 'PS8-2-1', 'PS8-2-2', 'PS8-2-12',
    'PS9-1-6', 'PS9-2-1', 'PS9-2-17', 'PS9-2-18',
    'PS10-1-1', 'PS10-1-2', 'PS10-1-3', 'PS10-2-9',
    'PS11-1-1', 'PS11-2-1', 'PS11-2-11', 'PS11-2-12',
    'PS12-1-11', 'PS12-2-1', 'PS12-2-4', 'PS12-2-5',
    'PS13-1-13', 'PS13-2-1', 'PS13-2-13', 'PS13-2-14',
    'PS14-1-13', 'PS14-1-14', 'PS14-1-15', 'PS14-1-18', 'PS14-2-12', 'PS14-2-18'
]);

/**
 * Verifica si una SCB específica tiene configuración de 15 strings.
 * @param ps Identificador de la PS (ej: 'PS1')
 * @param inversor Número de inversor (1 o 2)
 * @param scb Número de SCB FÍSICO (1-18) entregado por el Backend V2
 * @returns true si es de 15 strings, false si es de 18 (por defecto)
 */
export function is15StringScb(ps: string, inversor: number, scb: number): boolean {
    // Normalizar Inputs (Robustez)
    const normPs = ps.replace(/\s+/g, '').toUpperCase(); // "PS 2" -> "PS2"
    let detectInv = Number(inversor);
    let detectScb = Number(scb);

    const key = `${normPs}-${detectInv}-${detectScb}`;
    return FIFTEEN_STRING_SCBS.has(key);
}

/**
 * Obtiene el total de strings esperados para una SCB
 */
export function getScbCapacity(ps: string, inversor: number, scb: number): number {
    return is15StringScb(ps, inversor, scb) ? 15 : 18;
}
