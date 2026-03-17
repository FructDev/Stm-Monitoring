import { useQuery } from '@tanstack/react-query';
import { ActiveAlarm, AlarmSummary, AlarmEvent } from '@/app/types/alarms';

async function fetchActiveAlarms() {
    const res = await fetch('/api/alarms/active');
    if (!res.ok) throw new Error('Network response was not ok');
    return res.json() as Promise<{ summary: AlarmSummary; alarms: ActiveAlarm[] }>;
}

async function fetchAlarmEvents() {
    const res = await fetch('/api/alarms/events');
    if (!res.ok) throw new Error('Network response was not ok');
    return res.json() as Promise<AlarmEvent[]>;
}

export function useActiveAlarms() {
    return useQuery({
        queryKey: ['activeAlarms'],
        queryFn: fetchActiveAlarms,
        refetchInterval: 5000, // Poll every 5 seconds
    });
}

export function useAlarmEvents() {
    return useQuery({
        queryKey: ['alarmEvents'],
        queryFn: fetchAlarmEvents,
        refetchInterval: 10000,
    });
}
