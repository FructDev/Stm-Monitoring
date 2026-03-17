'use client';

import { useState, useEffect } from 'react';
import { ScbData } from '@/app/types';

// Ojo: Este tipo es el que emite el backend por el canal SSE
export interface SsePacket {
    gateway_id: string;
    mid: number;
    inversor: number;
    scb: number;
    state: {
        last_quality: "Good" | "Bad" | "Stale" | "Offline" | "Uncertain";
        last_timestamp_ms: number;
        last_error: string | null;
    };
    data: Partial<ScbData>; // Todo el payload de voltajes, amperajes, s01...s18
}

// Mantenemos un "store" global en memoria para no saturar contextos
// La llave será `${ps}-${inversor}-${scb}`
let globalScadaStore: Record<string, ScbData> = {};

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
        sseConnection = new EventSource('http://localhost:3030/live');

        sseConnection.onmessage = (event) => {
            try {
                const packet: SsePacket = JSON.parse(event.data);

                // Mapeo del payload V2 (SSE) al formato V1 (SQLite) que espera el frontend actual
                // Esto permite que ScbCard y ReportModal sigan funcionando sin cambios masivos
                const key = `${packet.gateway_id}-${packet.inversor}-${packet.scb}`;

                // Traducción de Estado. 
                // El driver hace debouncing, confiamos en su "last_quality" en lugar de hacer polling
                let mappedStatus = "OK";
                if (packet.state.last_quality === "Offline") mappedStatus = "OFFLINE";
                if (packet.state.last_quality === "Bad") mappedStatus = "READ_FAIL";

                const mergedData: ScbData = {
                    power_station: packet.gateway_id,
                    inversor: packet.inversor,
                    scb: packet.scb,
                    ts: new Date(packet.state.last_timestamp_ms).toISOString(),
                    estado: mappedStatus,
                    ...packet.data // Esparce v_total como vdc, i_total, s01..s18 si el rust loggea esos alias
                } as ScbData;

                // Actualizamos el diccionario global
                globalScadaStore[key] = {
                    ...globalScadaStore[key],
                    ...mergedData
                };

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
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        // Iniciar conexión si no existe
        initSse();

        // Suscribirse a cambios
        const listener = () => {
            setStore({ ...globalScadaStore });
            setIsConnected(sseConnection?.readyState === EventSource.OPEN);
        };
        listeners.add(listener);

        // Initial check
        setIsConnected(sseConnection?.readyState === EventSource.OPEN);

        return () => {
            listeners.delete(listener);
        };
    }, []);

    return { data: store, isConnected };
}
