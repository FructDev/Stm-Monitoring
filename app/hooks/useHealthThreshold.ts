'use client';

import { useState, useEffect } from 'react';

// Estado global en memoria (por defecto 85%)
let globalHealthThreshold = 85;

// Suscriptores al store
type Listener = (val: number) => void;
const listeners = new Set<Listener>();

function notifyListeners() {
    listeners.forEach(l => l(globalHealthThreshold));
}

export function setGlobalHealthThreshold(value: number) {
    if (value >= 0 && value <= 100) {
        globalHealthThreshold = value;
        notifyListeners();
        // Opcional: Persistir en el navegador para que no se pierda al recargar
        if (typeof window !== 'undefined') {
            localStorage.setItem('scada_health_threshold', String(value));
        }
    }
}

export function useHealthThreshold() {
    const [threshold, setThreshold] = useState(globalHealthThreshold);

    useEffect(() => {
        // Cargar desde localStorage en el primer render del cliente
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('scada_health_threshold');
            if (stored) {
                const num = Number(stored);
                if (!isNaN(num) && num >= 0 && num <= 100) {
                    globalHealthThreshold = num;
                    setThreshold(num);
                }
            }
        }

        const listener: Listener = (val) => {
            setThreshold(val);
        };
        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
    }, []);

    return {
        threshold,
        setThreshold: setGlobalHealthThreshold
    };
}
