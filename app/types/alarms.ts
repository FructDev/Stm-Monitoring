export interface ActiveAlarm {
    power_station: string;
    inversor: number | null;
    scb: number | null;
    modbus_id: number | null;
    alarm_code: string;
    active: number; // 1 or 0
    severity: number; // 1=Info, 2=Warning, 3=Critical (Assumed)
    first_seen_ts: string;
    last_seen_ts: string;
    message: string;
    ack: number;
}

export interface AlarmEvent {
    id: number;
    power_station: string;
    inversor: number | null;
    scb: number | null;
    modbus_id: number | null;
    alarm_code: string;
    event_type: 'RAISED' | 'CLEARED' | 'ACKED' | string;
    severity: number;
    ts: string;
    message: string;
}

export interface AlarmSummary {
    critical: number;
    warning: number;
    info: number;
    total: number;
}
