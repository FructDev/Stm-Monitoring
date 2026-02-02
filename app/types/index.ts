// app/types/index.ts

export interface ScbData {
    power_station: string;
    inversor: number;
    scb: number;
    modbus_id: number;
    ts: string;          // Timestamp
    temp_c: number;
    vdc: number;
    i_avg: number;
    i_total: number;
    zeros: number;
    estado: 'OK' | 'BAJA_TENSION' | 'ALERTA_0A' | 'ALERTA_STRINGS' | 'OFFLINE' | 'READ_FAIL' | 'UNKNOWN' | string;
    fail_count: number;
    last_error: string | null;
    // Strings individuales (s01...s18)
    s01: number; s02: number; s03: number; s04: number; s05: number; s06: number;
    s07: number; s08: number; s09: number; s10: number; s11: number; s12: number;
    s13: number; s14: number; s15: number; s16: number; s17: number; s18: number;
}

export interface ParkStats {
    total_amps: number;
    avg_voltage: number;
    total_scbs: number;
    online_scbs: number;
    offline_scbs: number;
    alert_scbs: number;
    total_dead_strings: number; // <--- AGREGAR ESTO
    last_update: string;
}

export interface PsSummary {
    name: string;      // "PS1"
    total_amps: number;
    scb_count: number;
    status: 'healthy' | 'warning' | 'critical';
}