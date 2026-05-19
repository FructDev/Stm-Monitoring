"use client";

import { AlarmTable } from "@/components/alarms/alarm-table";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertTriangle, AlertCircle, Info } from "lucide-react";
import Link from "next/link";
import { useActiveAlarms } from "@/hooks/use-alarms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AlarmsPage() {
    const { data, isLoading } = useActiveAlarms();

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
            <div className="container mx-auto max-w-6xl">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/">
                        <Button variant="ghost" className="text-slate-400 hover:text-white">
                            <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white">Centro de Operaciones de Alarmas (NOC)</h1>
                        <p className="text-slate-500 text-sm">Monitoreo y diagnóstico de fallos en tiempo real</p>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card className="bg-slate-900 border-rose-900/50">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-slate-300">Críticas (Offline)</CardTitle>
                            <AlertTriangle className="h-4 w-4 text-rose-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-rose-500">{data?.summary.critical ?? 0}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-900 border-amber-900/50">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-slate-300">Advertencias</CardTitle>
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-amber-500">{data?.summary.warning ?? 0}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-900 border-slate-800">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-slate-300">Total Activas</CardTitle>
                            <Info className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-white">{data?.summary.total ?? 0}</div>
                        </CardContent>
                    </Card>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
                    <AlarmTable alarms={data?.alarms || []} isLoading={isLoading} />
                </div>
            </div>
        </div>
    );
}
