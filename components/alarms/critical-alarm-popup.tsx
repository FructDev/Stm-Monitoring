"use client";

import { useEffect, useState } from "react";
import { useActiveAlarms } from "@/hooks/use-alarms";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CriticalAlarmPopup() {
    const { data } = useActiveAlarms();
    const [open, setOpen] = useState(false);
    const [lastCriticalCount, setLastCriticalCount] = useState(0);

    useEffect(() => {
        if (data?.summary.critical && data.summary.critical > 0) {
            // Only open if critical count increased or we haven't acknowledged it
            if (data.summary.critical > lastCriticalCount) {
                setOpen(true);
            }
            setLastCriticalCount(data.summary.critical);
        }
    }, [data?.summary.critical, lastCriticalCount]);

    if (!data) return null;

    const criticalAlarms = data.alarms.filter((a) => a.severity >= 3);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="border-red-500 border-2">
                <DialogHeader>
                    <div className="flex items-center gap-2 text-red-600">
                        <ShieldAlert className="w-6 h-6" />
                        <DialogTitle>Critical Alarms Detected</DialogTitle>
                    </div>
                    <DialogDescription>
                        There are {data.summary.critical} critical alarms requiring immediate attention.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-2 mt-4 max-h-[60vh] overflow-y-auto">
                    {criticalAlarms.map((alarm, idx) => (
                        <div
                            key={idx}
                            className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-100 dark:border-red-900/20 text-sm"
                        >
                            <div className="font-bold text-red-700 dark:text-red-400">
                                {alarm.power_station} - {alarm.alarm_code}
                            </div>
                            <div className="text-zinc-600 dark:text-zinc-300">
                                {alarm.message}
                            </div>
                            <div className="text-xs text-zinc-400 mt-1">
                                {new Date(alarm.last_seen_ts).toLocaleString()}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end mt-4">
                    <Button variant="destructive" onClick={() => setOpen(false)}>
                        Acknowledge & Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
