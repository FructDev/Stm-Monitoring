"use client";

import { useActiveAlarms } from "@/hooks/use-alarms";
import { AlertTriangle, Info, CheckCircle, ShieldAlert, Bell, BellOff, XCircle } from "lucide-react";
import { cn } from "@/app/lib/utils";
import Link from "next/link";
import { useAlarmSettings } from "@/hooks/use-alarm-settings";
import { toast } from "sonner";

export function AlarmBanner() {
    const { data, isLoading } = useActiveAlarms();
    const { isMuted, toggleMute } = useAlarmSettings();

    if (isLoading || !data) return null;

    const { summary } = data;
    if (summary.total === 0) return null;

    return (
        <div className="w-full bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 p-2 px-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4 text-sm font-medium">
                <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                    <span className="font-bold">System Status:</span>
                </div>

                {summary.critical > 0 && (
                    <div className="flex items-center gap-1.5 text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-md">
                        <ShieldAlert className="w-4 h-4" />
                        <span>{summary.critical} Critical</span>
                    </div>
                )}

                {summary.warning > 0 && (
                    <div className="flex items-center gap-1.5 text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-md">
                        <AlertTriangle className="w-4 h-4" />
                        <span>{summary.warning} Warnings</span>
                    </div>
                )}

                {summary.info > 0 && (
                    <div className="flex items-center gap-1.5 text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded-md">
                        <Info className="w-4 h-4" />
                        <span>{summary.info} Info</span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-4">
                {/* Mute / Dismiss Controls */}
                <div className="flex items-center gap-2 border-r border-zinc-200 dark:border-zinc-700 pr-4 mr-2">
                    <button
                        onClick={() => toast.dismiss()}
                        className="p-1.5 text-zinc-500 hover:text-red-500 transition-colors"
                        title="Dismiss All Popups (Limpiar Pantalla)"
                    >
                        <XCircle className="w-4 h-4" />
                    </button>

                    <button
                        onClick={toggleMute}
                        className={cn("p-1.5 transition-colors", isMuted ? "text-red-500" : "text-zinc-500 hover:text-blue-500")}
                        title={isMuted ? "Unmute Popups" : "Mute Popups"}
                    >
                        {isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                    </button>
                </div>

                {summary.total > 0 && (
                    <Link href="/alarms" className="text-xs text-blue-500 hover:text-blue-400 underline font-medium">
                        Ver {summary.total} Alarmas Activas &rarr;
                    </Link>
                )}
            </div>
        </div>
    );
}
