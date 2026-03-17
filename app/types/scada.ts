export interface QualityCounts {
    bad: number;
    good: number;
    offline: number;
    stale: number;
    timeouts: number;
    uncertain: number;
}

export interface ScadaMetrics {
    quality_counts: QualityCounts;
    total_devices: number;
}

export interface ScadaDeviceStatus {
    consecutive_failures: number;
    last_error: string | null;
    last_quality: "Good" | "Bad" | "Offline" | "Stale" | "Uncertain";
    last_seen_ts: number;
    latency_ms: number;
}

// Mapa de "InverterID" -> Status (ej. "1": { ... })
export interface GatewaySnapshot {
    [deviceId: string]: ScadaDeviceStatus;
}

// Mapa de "PowerStation" -> GatewaySnapshot (ej. "PS1": { ... })
export interface GlobalSnapshot {
    [powerStation: string]: GatewaySnapshot;
}
