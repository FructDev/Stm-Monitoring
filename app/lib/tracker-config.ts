// app/lib/tracker-config.ts
// Topología de seguidores solares: qué PLCs pertenecen a cada Power Station y su numeración global.
// Donde la distribución es conocida se fija `count`; donde no, se deriva de los datos en vivo.

export const TRACKER_MIN_DEG = -52;
export const TRACKER_MAX_DEG = 52;

// Antigüedad máxima (ms) antes de considerar la lectura "desactualizada".
export const TRACKER_STALE_MS = 5 * 60 * 1000;

export interface PlcDef {
    gateway: string; // nombre del gateway en el driver (ej "TRK_PS4B")
    ip: string;
    count?: number;  // nº de trackers si se conoce; si no, se usa lo que haya en datos
}
export interface PsTrackers {
    ps: string;
    plcs: PlcDef[];
}

export const TRACKER_TOPOLOGY: PsTrackers[] = [
    { ps: 'PS1', plcs: [{ gateway: 'TRK_PS1', ip: '192.168.123.161', count: 6 }] },
    { ps: 'PS2', plcs: [{ gateway: 'TRK_PS2A', ip: '192.168.123.162', count: 4 }, { gateway: 'TRK_PS2B', ip: '192.168.123.163', count: 6 }] },
    { ps: 'PS3', plcs: [{ gateway: 'TRK_PS3', ip: '192.168.123.164', count: 6 }] },
    { ps: 'PS4', plcs: [{ gateway: 'TRK_PS4A', ip: '192.168.123.165', count: 3 }, { gateway: 'TRK_PS4B', ip: '192.168.123.166', count: 6 }] },
    { ps: 'PS5', plcs: [{ gateway: 'TRK_PS5A', ip: '192.168.123.167', count: 3 }, { gateway: 'TRK_PS5B', ip: '192.168.123.168', count: 6 }] },
    { ps: 'PS6', plcs: [{ gateway: 'TRK_PS6', ip: '192.168.123.169', count: 6 }] },
    { ps: 'PS7', plcs: [{ gateway: 'TRK_PS7', ip: '192.168.123.170', count: 6 }] },
    { ps: 'PS8', plcs: [{ gateway: 'TRK_PS8', ip: '192.168.123.171', count: 6 }] },
    { ps: 'PS9', plcs: [{ gateway: 'TRK_PS9', ip: '192.168.123.172', count: 6 }] },
    { ps: 'PS10', plcs: [{ gateway: 'TRK_PS10A', ip: '192.168.123.173', count: 4 }, { gateway: 'TRK_PS10B', ip: '192.168.123.174', count: 4 }] },
    { ps: 'PS11', plcs: [{ gateway: 'TRK_PS11', ip: '192.168.123.175', count: 6 }] },
    { ps: 'PS12', plcs: [{ gateway: 'TRK_PS12A', ip: '192.168.123.176', count: 5 }, { gateway: 'TRK_PS12B', ip: '192.168.123.177', count: 4 }] },
    { ps: 'PS13', plcs: [{ gateway: 'TRK_PS13A', ip: '192.168.123.178', count: 4 }, { gateway: 'TRK_PS13B', ip: '192.168.123.179', count: 4 }] },
    { ps: 'PS14', plcs: [{ gateway: 'TRK_PS14', ip: '192.168.123.180', count: 6 }] },
];

// gateway -> { ps, orden del PLC dentro de la PS }
export const GATEWAY_TO_PS: Record<string, { ps: string; plcOrder: number; count?: number }> = (() => {
    const m: Record<string, { ps: string; plcOrder: number; count?: number }> = {};
    for (const t of TRACKER_TOPOLOGY) {
        t.plcs.forEach((plc, i) => { m[plc.gateway] = { ps: t.ps, plcOrder: i, count: plc.count }; });
    }
    return m;
})();

// Trackers en BYPASS/paralelo: el de encoder dañado está cableado en paralelo con un "maestro"
// sano, así que se mueve con él y está en la posición correcta. Se muestra su posición = la del
// maestro y se relaja la alarma de encoder (es una condición conocida, no un fallo a despachar).
// Clave y valor en formato "PS#-<nº global de tracker>".  Agrega aquí los pares confirmados.
export const TRACKER_BYPASS: Record<string, string> = {
    'PS1-2': 'PS1-4',
    'PS1-3': 'PS1-5',
};

export interface AlarmFlags {
    not_at_setpoint: boolean;
    encoder_error: boolean;
    motor_lockout: boolean;
    motor_on_too_long: boolean;
}

export function decodeAlarms(raw: number): AlarmFlags {
    return {
        not_at_setpoint: (raw & 1) !== 0,
        encoder_error: (raw & 2) !== 0,
        motor_lockout: (raw & 4) !== 0,
        motor_on_too_long: (raw & 256) !== 0,
    };
}

export const ALARM_LABELS: Record<keyof AlarmFlags, string> = {
    not_at_setpoint: 'Fuera de setpoint',
    encoder_error: 'Error de encoder',
    motor_lockout: 'Bloqueo de motor',
    motor_on_too_long: 'Motor encendido demasiado',
};
