'use client';

import { useState, useEffect } from 'react';
import { ScbData, MeteoData } from '@/app/types';

// Ojo: Este tipo es el que emite el backend por el canal SSE
export interface SsePacket {
    gateway_id: string;
    mid: number;
    inversor: number;
    scb: number;
    alarm_silenced?: boolean;
    state: {
        last_quality: "Good" | "Bad" | "Stale" | "Offline" | "Uncertain" | string;
        last_timestamp_ms: number;
        last_error: string | null;
    } | string;
    data: Partial<ScbData> & Partial<MeteoData>; // Merge the payloads
}

// Mantenemos stores globales en memoria para no saturar contextos
let globalScadaStore: Record<string, ScbData> = {};
let globalMeteoStore: Record<string, MeteoData> = {};

// Suscriptores al store
type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners() {
    listeners.forEach(l => l());
}

// Inicialización Singleton del EventSource
let sseConnection: EventSource | null = null;
let isConnecting = false;

function initSse() {
    if (sseConnection || isConnecting) return;
    isConnecting = true;

    try {
        sseConnection = new EventSource('/api/live');

        sseConnection.onmessage = (event) => {
            try {
                const packet: SsePacket = JSON.parse(event.data);

                // Mapeo del payload V2 (SSE) al formato V1 (SQLite) que espera el frontend actual
                // Esto permite que ScbCard y ReportModal sigan funcionando sin cambios masivos
                const key = `${packet.gateway_id}-${packet.inversor}-${packet.scb}`;

                // Determine timestamp and status robustly since rust might send state as string or object
                let mappedStatus = "OK";
                let isoTs = new Date().toISOString();

                if (typeof packet.state === "object" && packet.state !== null) {
                    if (packet.state.last_quality === "Offline") mappedStatus = "OFFLINE";
                    if (packet.state.last_quality === "Bad") mappedStatus = "READ_FAIL";
                    if (packet.state.last_timestamp_ms) {
                        isoTs = new Date(packet.state.last_timestamp_ms).toISOString();
                    }
                } else if (typeof packet.state === "string") {
                    if (packet.state === "Offline") mappedStatus = "OFFLINE";
                    if (packet.state === "Bad") mappedStatus = "READ_FAIL";
                }

                // Split logic for Meteo stations vs Standard SCBs
                if (packet.gateway_id.startsWith("METEO_")) {
                    const meteoKey = packet.gateway_id;
                    const meteoData: MeteoData = {
                        gateway_id: packet.gateway_id,
                        ts: isoTs,
                        ...packet.data
                    } as MeteoData;
                    
                    globalMeteoStore[meteoKey] = {
                        ...(globalMeteoStore[meteoKey] || {}),
                        ...meteoData
                    };
                    
                    // console.log(`[SSE Debug] Updated METEO Store. Count: ${Object.keys(globalMeteoStore).length}`);
                } else {
                    const key = `${packet.gateway_id}-${packet.inversor}-${packet.scb}`;
                    
                    // --- Mapeo Automático de V2 (Rust) a V1 (Legacy) ---
                    const mappedCurrents: Partial<ScbData> = {};
                    if (packet.data.currents && Array.isArray(packet.data.currents)) {
                        let sumAmps = 0;
                        packet.data.currents.forEach((val, i) => {
                            const stringKey = `s${String(i + 1).padStart(2, "0")}` as keyof ScbData;
                            (mappedCurrents as any)[stringKey] = val;
                            sumAmps += val;
                        });
                        mappedCurrents.i_total = sumAmps;
                    }
                    if (packet.data.voltage_raw !== undefined) {
                        mappedCurrents.vdc = packet.data.voltage_raw;
                    }
                    if (packet.data.temp_raw !== undefined) {
                        mappedCurrents.temp_c = packet.data.temp_raw / 10;
                    }

                    const mergedData: ScbData = {
                        power_station: packet.gateway_id,
                        inversor: packet.inversor,
                        scb: packet.scb,
                        ts: isoTs,
                        estado: mappedStatus,
                        alarm_silenced: packet.alarm_silenced, // Capture the rust curtailment override
                        ...packet.data,
                        ...mappedCurrents
                    } as ScbData;

                    globalScadaStore[key] = {
                        ...globalScadaStore[key],
                        ...mergedData
                    };
                }

                // Avisar a react
                notifyListeners();
            } catch (err) {
                console.error("Error parseando SSE:", err);
            }
        };

        sseConnection.onerror = (err) => {
            console.warn("SSE Desconectado. El navegador reintentará...", err);
            // No anulamos sseConnection porque el navegador hace auto-reconnect
        };

        sseConnection.onopen = () => {
            console.log("SSE Conectado exitosamente al driver Rust.");
        };
    } catch (error) {
        console.error("Failed to initialize SSE:", error);
    } finally {
        isConnecting = false;
    }
}

/**
 * Hook para consumir la data en vivo sin hacer polling a la base de datos local SQLite.
 * Se conecta automáticamente al Driver Rust en localhost:3030/live.
 */
export function useScadaStream() {
    const [store, setStore] = useState<Record<string, ScbData>>(globalScadaStore);
    const [meteoStore, setMeteoStore] = useState<Record<string, MeteoData>>(globalMeteoStore);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        // Iniciar conexión si no existe
        initSse();

        // Suscribirse a cambios
        const listener = () => {
            setStore({ ...globalScadaStore });
            setMeteoStore({ ...globalMeteoStore });
            setIsConnected(sseConnection?.readyState === EventSource.OPEN);
        };
        listeners.add(listener);

        // Initial check
        setIsConnected(sseConnection?.readyState === EventSource.OPEN);

        return () => {
            listeners.delete(listener);
        };
    }, []);

    return { data: store, meteoData: meteoStore, isConnected };
}
