export interface AlarmTranslation {
    title: string;
    action: string;
}

export function translateAlarmMessage(code: string, rawMessage: string): AlarmTranslation {
    const lowerMsg = rawMessage.toLowerCase();

    if (code === 'OFFLINE') return {
        title: 'Pérdida de Comunicación Modbus',
        action: 'Revisar cableado RS485 de la caja, verificar alimentación eléctrica o reiniciar el data logger.'
    };
    
    if (code === 'READ_FAIL' || code === 'DEVICE_FAILURE' || lowerMsg.includes('device_failure')) return {
        title: 'Fallo de Lectura / Dispositivo',
        action: 'El dispositivo no responde a las peticiones Modbus. Verificar interferencia o reiniciar equipo.'
    };

    if (lowerMsg.includes('offline') && lowerMsg.includes('fallos')) return {
        title: 'Dispositivo Desconectado',
        action: 'Pérdida persistente de señal. Enviar técnico para verificar estado de la caja.'
    };

    if (lowerMsg.includes('baja_tension') || code === 'BAJA_TENSION') return {
        title: 'Caída Severa de Tensión DC',
        action: 'Sombra extrema, strings desconectados masivamente o fallo en inversor central. Verificar si hay Curtailment.'
    };

    if (lowerMsg.includes('alerta_0a') || lowerMsg.includes('zero current') || code === 'FUSIBLE' || lowerMsg.includes('fusible')) return {
        title: 'Fusible Abierto o String Cortado',
        action: 'Se detectó corriente cero en plena producción. Revisar continuidad del cable y estado del fusible cilíndrico.'
    };

    if (lowerMsg.includes('alerta_strings')) return {
        title: 'Anomalía en Producción de Strings',
        action: 'Desviación térmica o degradación detectada. Sugerimos limpieza de paneles o revisión de diodos bypass.'
    };

    if (code === 'MANY_ZERO_STRINGS' || lowerMsg.includes('many_zero_strings')) {
        const match = rawMessage.match(/\((\d+)\s*≥\s*\d+\)/);
        const count = match ? match[1] : '?';
        return {
            title: `Múltiples Strings sin corriente (${count} detectados)`,
            action: 'Posible sombra severa local o fallo en los tableros de conexión de la SCB.'
        };
    }

    // Fallback
    return {
        title: rawMessage.charAt(0).toUpperCase() + rawMessage.slice(1).toLowerCase(),
        action: 'Investigar estado reportado en el registro crudo.'
    };
}

export function getSeverityLabel(severity: number): { label: string, color: string } {
    if (severity >= 3) return { label: 'Crítico', color: 'text-rose-600 border-rose-200 bg-rose-50' };
    if (severity === 2) return { label: 'Advertencia', color: 'text-amber-600 border-amber-200 bg-amber-50' };
    return { label: 'Info', color: 'text-blue-600 border-blue-200 bg-blue-50' };
}
