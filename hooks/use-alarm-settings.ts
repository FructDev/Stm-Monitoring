"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "alarm-settings-muted";

export function useAlarmSettings() {
    const [isMuted, setIsMuted] = useState(false);

    useEffect(() => {
        // Inicializar desde localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            setIsMuted(JSON.parse(stored));
        }

        // Escuchar cambios en otras instancias/componentes
        const handleStorageChange = () => {
            const newVal = localStorage.getItem(STORAGE_KEY);
            setIsMuted(newVal ? JSON.parse(newVal) : false);
        };

        window.addEventListener("storage", handleStorageChange);
        window.addEventListener("alarm-mute-change", handleStorageChange);

        return () => {
            window.removeEventListener("storage", handleStorageChange);
            window.removeEventListener("alarm-mute-change", handleStorageChange);
        };
    }, []);

    const toggleMute = () => {
        const newVal = !isMuted;
        setIsMuted(newVal);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newVal));

        // Disparar evento custom para sincronizar en la misma tab
        window.dispatchEvent(new Event("alarm-mute-change"));
    };

    return { isMuted, toggleMute };
}
