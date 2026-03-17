"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useActiveAlarms } from "@/hooks/use-alarms";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { translateAlarmMessage } from "@/app/lib/alarm-translator";
import { useAlarmSettings } from "@/hooks/use-alarm-settings";

export function AlarmToastController() {
    const { data } = useActiveAlarms();
    const { isMuted } = useAlarmSettings();
    const router = useRouter();

    // Refs for interval access to prevent stale closures without re-triggering effect
    const dataRef = useRef(data);
    const isMutedRef = useRef(isMuted);
    const lastShownRef = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        dataRef.current = data;
        isMutedRef.current = isMuted;
    }, [data, isMuted]);

    useEffect(() => {
        const checkAlarms = () => {
            if (!dataRef.current || isMutedRef.current) return;

            const currentAlarms = dataRef.current.alarms;
            // Filter for Critical/Severe alarms (Severity >= 3)
            const currentCriticals = currentAlarms.filter(a => a.severity >= 3);

            const lastShown = lastShownRef.current;
            const now = Date.now();

            const CYCLE_INTERVAL = 15000; // Alarms reappear every 15s
            const TOAST_DURATION = 10000; // Toast stays visible for 10s

            // 1. Identify Candidates
            const candidates: any[] = [];
            currentCriticals.forEach(alarm => {
                const uniqueKey = `${alarm.power_station}-${alarm.scb || '0'}-${alarm.alarm_code}`;
                const lastTime = lastShown.get(uniqueKey) || 0;

                if (now - lastTime > CYCLE_INTERVAL) {
                    candidates.push({ alarm, uniqueKey, lastTime });
                }
            });

            if (candidates.length === 0) return;

            // 2. Prioritize: 
            // - Severity Descending (Criticals [4] first, then High [3])
            // - Staleness Ascending (Oldest seen first)
            candidates.sort((a, b) => {
                const sevDiff = b.alarm.severity - a.alarm.severity;
                if (sevDiff !== 0) return sevDiff;
                return a.lastTime - b.lastTime;
            });

            // 3. Throttle: Process ONLY ONE per tick to create smooth flow
            // This prevents "bursts" where 5 alarms pop at once, causing UI jitter
            const target = candidates[0];
            const { alarm, uniqueKey } = target;

            // 4. Display Toast
            const friendlyMsg = translateAlarmMessage(alarm.alarm_code, alarm.message);

            let deviceLocation = "";
            if (alarm.inversor) deviceLocation += `Inv ${alarm.inversor}`;
            if (alarm.scb) deviceLocation += (deviceLocation ? " - " : "") + `SCB ${alarm.scb}`;
            if (!deviceLocation) deviceLocation = "General";

            const title = `Alarma: ${alarm.power_station} [${deviceLocation}]`;

            toast.error(title, {
                id: uniqueKey, // Use ID to prevent duplicates/stacking of same alarm
                description: friendlyMsg,
                duration: TOAST_DURATION,
                icon: <ShieldAlert className="w-5 h-5 text-red-600" />,
                action: {
                    label: "Ver Detalles",
                    onClick: () => router.push("/alarms"),
                },
            });

            // 5. Update Timestamp
            lastShown.set(uniqueKey, now);

            // 6. Cleanup Old Keys (Lazy)
            // We only clean up if map grows too large to prevent flickering data from resetting the timer.
            if (lastShown.size > currentCriticals.length + 50) {
                const activeKeySet = new Set(currentCriticals.map(a =>
                    `${a.power_station}-${a.scb || '0'}-${a.alarm_code}`
                ));
                for (const key of lastShown.keys()) {
                    if (!activeKeySet.has(key)) lastShown.delete(key);
                }
            }
        };

        // Check every 2.5 seconds for a slower pace
        const intervalId = setInterval(checkAlarms, 2500);
        checkAlarms(); // Initial check

        return () => clearInterval(intervalId);
    }, []);

    return null;
}
