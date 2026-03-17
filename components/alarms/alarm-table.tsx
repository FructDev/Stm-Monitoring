"use client";

import { useActiveAlarms } from "@/hooks/use-alarms";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/app/lib/utils";
import { translateAlarmMessage, getSeverityLabel } from "@/app/lib/alarm-translator";

export function AlarmTable() {
    const { data, isLoading } = useActiveAlarms();

    if (isLoading) return <div>Loading alarms...</div>;
    if (!data) return null;
    if (data.alarms.length === 0) return <div className="text-zinc-500 p-4">No active alarms.</div>;

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[100px]">Severity</TableHead>
                        <TableHead>Asset</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead className="text-right">Last Seen</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.alarms.map((alarm, idx) => {
                        const sevInfo = getSeverityLabel(alarm.severity);
                        return (
                            <TableRow key={idx}>
                                <TableCell>
                                    <div
                                        className={cn(
                                            "w-3 h-3 rounded-full",
                                            alarm.severity >= 3 ? "bg-rose-500" :
                                                alarm.severity === 2 ? "bg-amber-500" : "bg-blue-500"
                                        )}
                                        title={sevInfo.label}
                                    />
                                </TableCell>
                                <TableCell className="font-medium">
                                    {alarm.power_station}
                                    {alarm.scb ? ` / SCB ${alarm.scb}` : ''}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-slate-500">{alarm.alarm_code}</TableCell>
                                <TableCell className="font-medium text-slate-700 dark:text-slate-300">
                                    {translateAlarmMessage(alarm.alarm_code, alarm.message)}
                                </TableCell>
                                <TableCell className="text-right text-xs text-muted-foreground">
                                    {new Date(alarm.last_seen_ts).toLocaleString()}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
