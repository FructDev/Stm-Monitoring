export function translateAlarmMessage(code: string, rawMessage: string): string {
    // 1. Limpieza básica
    const lowerMsg = rawMessage.toLowerCase();

    // 2. Mapeos específicos por Código
    if (code === 'OFFLINE') return 'Sin Conexión';
    if (code === 'READ_FAIL') return 'Fallo de Lectura';

    // 3. Traducción basada en contenido del mensaje (Heurística)
    if (lowerMsg.includes('offline') && lowerMsg.includes('fallos')) {
        // Ej: "Offline 45 fallos seguidos" -> "Dispositivo desconectado"
        return 'Dispositivo desconectado';
    }

    if (lowerMsg.includes('baja_tension')) return 'Baja Tensión Detectada';
    if (lowerMsg.includes('alerta_0a') || lowerMsg.includes('zero current')) return 'Alerta: Corriente Cero (Posible Fusible Abierto)';
    if (lowerMsg.includes('alerta_strings')) return 'Alerta: Fallo en Strings';

    // CASOS NUEVOS
    if (code === 'DEVICE_FAILURE' || lowerMsg.includes('device_failure')) {
        return 'Fallo de Dispositivo (Error Interno del Esclavo)';
    }

    if (code === 'MANY_ZERO_STRINGS' || lowerMsg.includes('many_zero_strings')) {
        // "Muchos strings en 0 (13 >= 4)" -> Extraer el número real
        const match = rawMessage.match(/\((\d+)\s*≥\s*\d+\)/);
        const count = match ? match[1] : '?';
        return `Múltiples Strings sin corriente (${count} detectados)`;
    }

    if (lowerMsg.includes('posible')) {
        return rawMessage.replace('POSIBLE', 'Posible').replace('FUSIBLE', 'Fusible');
    }

    // 4. Fallback: Retornar mensaje original pero "Bonito" (Capitalizado)
    return rawMessage.charAt(0).toUpperCase() + rawMessage.slice(1).toLowerCase();
}

export function getSeverityLabel(severity: number): { label: string, color: string } {
    if (severity >= 3) return { label: 'Crítico', color: 'text-rose-600 border-rose-200 bg-rose-50' };
    if (severity === 2) return { label: 'Advertencia', color: 'text-amber-600 border-amber-200 bg-amber-50' };
    return { label: 'Info', color: 'text-blue-600 border-blue-200 bg-blue-50' };
}
