"use client";

import { AlarmTable } from "@/components/alarms/alarm-table";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function AlarmsPage() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
            <div className="container mx-auto max-w-5xl">
                <div className="flex items-center gap-4 mb-8">
                    <Link href="/">
                        <Button variant="ghost" className="text-slate-400 hover:text-white">
                            <ArrowLeft className="mr-2 h-4 w-4" /> Dashboard
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white">System Alarms</h1>
                        <p className="text-slate-500 text-sm">Real-time alerts and operating status</p>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
                    <AlarmTable />
                </div>
            </div>
        </div>
    );
}
