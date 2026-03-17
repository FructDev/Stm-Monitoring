'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { format, differenceInHours } from 'date-fns';
import {
    Calendar, Plus, Settings, Monitor, Box, Database, LineChart,
    Trash2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
    List, BarChart2, AlertCircle, Maximize, Search, Save, Download, Filter
} from 'lucide-react';
import {
    LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

// --- CONSTANTS ---
const STATIONS = [{ id: 'ALL', label: 'Todas las Power Stations' }, ...Array.from({ length: 14 }, (_, i) => ({ id: `PS${i + 1}`, label: `Power Station ${i + 1}` }))];
const ELEMENT_TYPES = ['Inversores', 'Cajas (SCB)', 'Strings'];
const VARIABLES = [
    { label: 'Corriente DC (A)', key: 'i_total_avg' },
    { label: 'Voltaje (V)', key: 'v_avg' },
    { label: 'Potencia (kW)', key: 'power_kw_avg' },
    { label: 'Temperatura (°C)', key: 'temp_avg' }
];

const YEARS = ['2023', '2024', '2025', '2026', '2027'];
const MONTHS = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'));
const DAYS = Array.from({ length: 31 }, (_, i) => (i + 1).toString().padStart(2, '0'));
const HOURS = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

// --- INTERFACES ---
interface HistoryPoint {
    ts: string;
    gateway: string;
    inversor: number;
    scb: number;
    v_avg: number;
    i_total_avg: number;
    power_kw_avg: number;
    temp_avg: number;
    [key: string]: any;
}

interface QueryParam {
    id: string;
    gateway: string;
    elementType: string;
    elementId: string;
    scbId?: string;
    variableName: string;
    variableKey: string;
    rawKey: string;
    labelInfo: string;
}

// --- MAIN COMPONENT ---
export default function HistoryPage() {
    // 1. STATE: Periodo Separado por Dropdowns
    const [startYear, setStartYear] = useState(format(new Date(Date.now() - 86400000), "yyyy"));
    const [startMonth, setStartMonth] = useState(format(new Date(Date.now() - 86400000), "MM"));
    const [startDay, setStartDay] = useState(format(new Date(Date.now() - 86400000), "dd"));
    const [startHour, setStartHour] = useState("00");
    const [startMin, setStartMin] = useState("00");

    const [endYear, setEndYear] = useState(format(new Date(), "yyyy"));
    const [endMonth, setEndMonth] = useState(format(new Date(), "MM"));
    const [endDay, setEndDay] = useState(format(new Date(), "dd"));
    const [endHour, setEndHour] = useState("23");
    const [endMin, setEndMin] = useState("59");

    const [periodTrigger, setPeriodTrigger] = useState(0);

    // 2. STATE: Añadir Parámetros (Cascading)
    const [selPlanta, setSelPlanta] = useState(STATIONS[0].id);
    const [selType, setSelType] = useState(ELEMENT_TYPES[0]);
    const [selElements, setSelElements] = useState<string[]>([]);
    const [selVariables, setSelVariables] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    // 3. STATE: Parámetros Activos (Tabla Inferior)
    const [activeParams, setActiveParams] = useState<QueryParam[]>([]);

    // 4. STATE: Data Engine & UI Errors
    const [rawData, setRawData] = useState<HistoryPoint[]>([]);
    const [loading, setLoading] = useState(false);
    const [uiError, setUiError] = useState<string | null>(null);

    // 5. STATE: UI Views
    const [activeTab, setActiveTab] = useState<'DATOS' | 'GRAFICO'>('DATOS');
    const [itemsPerPage, setItemsPerPage] = useState('50');

    const [selScb, setSelScb] = useState('1');

    // --- CASCADING LOGIC ---
    const availableElements = useMemo(() => {
        if (selType === 'Inversores') return [{ id: 'Todos', label: 'Todos' }, { id: '1', label: '01' }, { id: '2', label: '02' }];
        if (selType === 'Cajas (SCB)') return [{ id: 'Todas', label: 'Todas las SCB' }, ...Array.from({ length: 18 }, (_, i) => ({ id: String(i + 1), label: `SCB ${String(i + 1)}` }))];
        if (selType === 'Strings') return [{ id: 'Todos', label: `Todos los Strings (SCB ${selScb})` }, ...Array.from({ length: 18 }, (_, i) => {
            const num = i + 1;
            const scbNum = Number(selScb);
            const inv = scbNum <= 9 ? 1 : 2; // SCBs 1-9 = Inv 1, 10-18 = Inv 2
            return { id: String(num).padStart(2, '0'), label: `String ${String(num).padStart(2, '0')} (SCB ${selScb}, Inv ${inv})` };
        })];
        return [];
    }, [selType, selScb]);

    useEffect(() => {
        setSelElements([]);
        setSelVariables([]);
    }, [selType]);

    const filteredVariables = useMemo(() => {
        return VARIABLES.filter(v => v.label.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [searchTerm]);

    // --- ACTIONS: Añadir Parámetros ---
    const handleAddParam = () => {
        setUiError(null);
        if (selPlanta === 'ALL' || selVariables.length === 0 || selElements.length === 0) {
            setUiError("Selecciona una Power Station, al menos un Elemento y una Variable.");
            setTimeout(() => setUiError(null), 3000);
            return;
        }

        const newParams: QueryParam[] = [];
        selVariables.forEach(varKey => {
            const varObj = VARIABLES.find(v => v.key === varKey);
            if (!varObj) return;

            const elementsToAdd = (selElements.includes('Todos') || selElements.includes('Todas'))
                ? availableElements.filter(e => e.id !== 'Todos' && e.id !== 'Todas')
                : availableElements.filter(e => selElements.includes(e.id));

            elementsToAdd.forEach(elObj => {
                const id = `${selPlanta}-${selType}-${selType === 'Strings' ? selScb : 'N'}-${elObj.id}-${varKey}-${Date.now()}`;
                const rawKey = selType === 'Strings'
                    ? `${selPlanta}_STR_S${selScb}_E${elObj.id}_${varKey}`
                    : `${selPlanta}_T${selType.charAt(0)}_E${elObj.id}_${varKey}`;

                newParams.push({
                    id,
                    gateway: selPlanta,
                    elementType: selType,
                    elementId: elObj.id,
                    scbId: selType === 'Strings' ? selScb : undefined,
                    variableName: varObj.label,
                    variableKey: varKey,
                    rawKey,
                    labelInfo: elObj.label
                });
            });
        });

        setActiveParams(prev => {
            const next = [...prev];
            newParams.forEach(np => {
                if (!next.some(p => p.rawKey === np.rawKey)) next.push(np);
            });
            return next;
        });

        setSelVariables([]);
        setSelElements([]);
    };

    const removeParam = (id: string) => {
        setActiveParams(prev => prev.filter(p => p.id !== id));
    };

    // --- ACTIONS: Engine Fetcher ---
    const executeSearch = async () => {
        setUiError(null);
        if (activeParams.length === 0) {
            setUiError("Añade al menos un parámetro primero.");
            setTimeout(() => setUiError(null), 3000);
            return;
        }

        setLoading(true);

        const uniqueGateways = Array.from(new Set(activeParams.map(p => p.gateway)));

        // Construct TS robustly without UTC offset glitches
        const startTs = new Date(Number(startYear), Number(startMonth) - 1, Number(startDay), Number(startHour), Number(startMin), 0);
        const endTs = new Date(Number(endYear), Number(endMonth) - 1, Number(endDay), Number(endHour), Number(endMin), 59);

        const hours = (differenceInHours(new Date(), startTs) > 0) ? differenceInHours(new Date(), startTs) + 1 : 24;

        try {
            const promises = uniqueGateways.map(async (g) => {
                // Si la cantidad de horas es demasiado grande, el driver limitará la busqueda
                const res = await fetch(`/api/scada/history?gateway=${g}&mid=ALL&hours=${hours}`);
                if (!res.ok) return [];
                const json = await res.json();
                return json.data || [];
            });

            const resultsMatrix = await Promise.all(promises);
            const flatData = resultsMatrix.flat();

            const filteredData = flatData
                .filter(d => {
                    const ts = new Date(d.ts).getTime();
                    return ts >= startTs.getTime() && ts <= endTs.getTime();
                })
                .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

            setRawData(filteredData);
            setPeriodTrigger(prev => prev + 1);
            if (activeTab !== 'GRAFICO') setActiveTab('DATOS');

        } catch (err: any) {
            setUiError("Fallo de red.");
            setTimeout(() => setUiError(null), 3000);
        } finally {
            setLoading(false);
        }
    };

    // --- DATA PIVOTING: Time Series Grid ---
    const timeGridData = useMemo(() => {
        if (rawData.length === 0 || activeParams.length === 0) return [];

        const timeMap = new Map<string, any>();

        rawData.forEach(row => {
            const tsStr = row.ts;
            if (!timeMap.has(tsStr)) {
                timeMap.set(tsStr, { ts: tsStr });
            }
            const timeObj = timeMap.get(tsStr);

            activeParams.forEach(p => {
                if (row.gateway === p.gateway) {
                    let val: number | undefined = undefined;

                    if (p.elementType === 'Inversores' && row.inversor === Number(p.elementId)) {
                        val = row[p.variableKey];
                    }
                    else if (p.elementType === 'Cajas (SCB)' && row.scb === Number(p.elementId)) {
                        val = row[p.variableKey];
                    }
                    else if (p.elementType === 'Strings') {
                        if (row.scb === Number(p.scbId)) {
                            const stringIndex = parseInt(p.elementId, 10) - 1;
                            const stringRaw = Array.isArray(row.currents) ? row.currents[stringIndex] : undefined;

                            if (stringRaw !== undefined) {
                                if (p.variableKey === 'i_total_avg') val = stringRaw;
                                if (p.variableKey === 'power_kw_avg') val = (stringRaw * row.v_avg) / 1000;
                                if (p.variableKey === 'v_avg') val = row.v_avg;
                                if (p.variableKey === 'temp_avg') val = row.temp_avg;
                            } else {
                                if (row.scb === 1) val = (row[p.variableKey] || 0) / 18;
                            }
                        }
                    }

                    if (val !== undefined) {
                        timeObj[p.rawKey] = val;
                    }
                }
            });
        });

        return Array.from(timeMap.values()).sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    }, [rawData, activeParams]);


    // --- MAIN LAYOUT RENDER ---
    return (
        <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-slate-950 text-slate-300 font-sans text-xs">

            {/* ====== LEFT PANEL: FILTERS (Fixed Width Sidebar) ====== */}
            <div className="w-[305px] flex-shrink-0 flex flex-col border-r border-slate-800 bg-slate-900 overflow-y-auto">

                {/* Error Banner */}
                {uiError && (
                    <div className="bg-rose-950/80 border-b border-rose-900 p-2 text-rose-400 flex items-start gap-2 text-[10px] sticky top-0 z-50">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{uiError}</span>
                    </div>
                )}

                {/* --- A) BLOQUE PERIODO --- */}
                <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                    <h3 className="font-bold text-slate-100 uppercase tracking-wider text-[11px] mb-4 flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-blue-500" /> Período Temporal
                    </h3>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-slate-500 font-semibold uppercase">Granularidad</label>
                            <select className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 outline-none text-slate-300 focus:border-blue-500 transition-colors">
                                <option>Default (5 min)</option>
                                <option>15 Minutos</option>
                                <option>1 Hora</option>
                                <option>Diario</option>
                            </select>
                        </div>

                        {/* DESDE - Dropdowns manuales */}
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-slate-500 font-semibold uppercase">Límite Inicial (Desde)</label>
                            <div className="flex gap-1 justify-between">
                                <select value={startDay} onChange={e => setStartDay(e.target.value)} className="bg-slate-950 border border-slate-700 rounded p-1 outline-none text-slate-300 focus:border-blue-500 text-xs text-center flex-1 cursor-pointer hover:bg-slate-800">
                                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                                <select value={startMonth} onChange={e => setStartMonth(e.target.value)} className="bg-slate-950 border border-slate-700 rounded p-1 outline-none text-slate-300 focus:border-blue-500 text-xs text-center flex-1 cursor-pointer hover:bg-slate-800">
                                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select value={startYear} onChange={e => setStartYear(e.target.value)} className="bg-slate-950 border border-slate-700 rounded p-1 outline-none text-slate-300 focus:border-blue-500 text-xs text-center w-[50px] cursor-pointer hover:bg-slate-800">
                                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <span className="text-slate-600 font-bold px-0.5 self-center">-</span>
                                <select value={startHour} onChange={e => setStartHour(e.target.value)} className="bg-slate-950 border border-slate-700 rounded p-1 outline-none text-slate-300 focus:border-blue-500 text-xs text-center w-[36px] cursor-pointer hover:bg-slate-800">
                                    {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <span className="text-slate-600 font-bold self-center">:</span>
                                <select value={startMin} onChange={e => setStartMin(e.target.value)} className="bg-slate-950 border border-slate-700 rounded p-1 outline-none text-slate-300 focus:border-blue-500 text-xs text-center w-[36px] cursor-pointer hover:bg-slate-800">
                                    {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* HASTA - Dropdowns manuales */}
                        <div className="space-y-1.5 pt-1">
                            <label className="text-[10px] text-slate-500 font-semibold uppercase">Límite Final (Hasta)</label>
                            <div className="flex gap-1 justify-between">
                                <select value={endDay} onChange={e => setEndDay(e.target.value)} className="bg-slate-950 border border-slate-700 rounded p-1 outline-none text-slate-300 focus:border-blue-500 text-xs text-center flex-1 cursor-pointer hover:bg-slate-800">
                                    {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                                <select value={endMonth} onChange={e => setEndMonth(e.target.value)} className="bg-slate-950 border border-slate-700 rounded p-1 outline-none text-slate-300 focus:border-blue-500 text-xs text-center flex-1 cursor-pointer hover:bg-slate-800">
                                    {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select value={endYear} onChange={e => setEndYear(e.target.value)} className="bg-slate-950 border border-slate-700 rounded p-1 outline-none text-slate-300 focus:border-blue-500 text-xs text-center w-[50px] cursor-pointer hover:bg-slate-800">
                                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                </select>
                                <span className="text-slate-600 font-bold px-0.5 self-center">-</span>
                                <select value={endHour} onChange={e => setEndHour(e.target.value)} className="bg-slate-950 border border-slate-700 rounded p-1 outline-none text-slate-300 focus:border-blue-500 text-xs text-center w-[36px] cursor-pointer hover:bg-slate-800">
                                    {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <span className="text-slate-600 font-bold self-center">:</span>
                                <select value={endMin} onChange={e => setEndMin(e.target.value)} className="bg-slate-950 border border-slate-700 rounded p-1 outline-none text-slate-300 focus:border-blue-500 text-xs text-center w-[36px] cursor-pointer hover:bg-slate-800">
                                    {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                            <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 accent-blue-600 cursor-pointer" />
                            <span className="text-[11px] text-slate-400">Ver en paralelo</span>
                        </div>

                        <button onClick={executeSearch} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 text-white rounded py-2 text-[11px] font-bold transition-all flex items-center justify-center gap-2 mt-2 shadow-[0_0_10px_rgba(37,99,235,0.15)]">
                            {loading ? <span className="animate-spin">⧗</span> : "Aplicar Búsqueda"}
                        </button>
                    </div>
                </div>

                {/* --- B) BLOQUE AÑADIR PARÁMETROS --- */}
                <div className="p-4 flex flex-col flex-1 min-h-0">
                    <h3 className="font-bold text-slate-100 uppercase tracking-wider text-[11px] mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Plus className="h-3.5 w-3.5 text-emerald-500" /> Añadir Parámetros
                        </div>
                        <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[9px]">{activeParams.length} Activos</span>
                    </h3>

                    <div className="space-y-4 flex-1 flex flex-col">
                        <div className="space-y-1.5">
                            <label className="text-[10px] text-slate-500 font-semibold uppercase">Power Station</label>
                            <select value={selPlanta} onChange={e => setSelPlanta(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 outline-none text-slate-300 focus:border-emerald-500 cursor-pointer hover:bg-slate-900 transition-colors">
                                {STATIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] text-slate-500 font-semibold uppercase">Categoría</label>
                            <select value={selType} onChange={e => setSelType(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 outline-none text-slate-300 focus:border-emerald-500 cursor-pointer hover:bg-slate-900 transition-colors">
                                {ELEMENT_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
                            </select>
                        </div>

                        {selType === 'Strings' && (
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-slate-500 font-semibold uppercase">SCB Padre</label>
                                <select value={selScb} onChange={e => setSelScb(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 outline-none text-slate-300 focus:border-emerald-500 cursor-pointer hover:bg-slate-900 transition-colors">
                                    {Array.from({ length: 18 }, (_, i) => <option key={i + 1} value={String(i + 1)}>SCB {i + 1}</option>)}
                                </select>
                            </div>
                        )}

                        {/* Multi-Select Físico de Elementos */}
                        <div className="flex flex-col pt-1">
                            <label className="text-[10px] text-slate-500 font-semibold uppercase mb-2 flex justify-between">
                                Elementos Físicos
                                <span className="bg-emerald-950/50 text-emerald-500 px-1.5 rounded">{selElements.length}</span>
                            </label>
                            <div className="flex-1 bg-slate-950 border border-slate-800 rounded overflow-y-auto max-h-[140px] custom-scrollbar shadow-inner">
                                {availableElements.map(e => (
                                    <label key={e.id} className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-800/30 hover:bg-slate-900 cursor-pointer transition-colors group">
                                        <input
                                            type="checkbox"
                                            checked={selElements.includes(e.id)}
                                            onChange={(ev) => {
                                                if (ev.target.checked) {
                                                    if (e.id === 'Todos' || e.id === 'Todas') setSelElements([e.id]);
                                                    else setSelElements(prev => [...prev.filter(x => x !== 'Todos' && x !== 'Todas'), e.id]);
                                                } else {
                                                    setSelElements(prev => prev.filter(k => k !== e.id));
                                                }
                                            }}
                                            className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 accent-emerald-500 cursor-pointer"
                                        />
                                        <span className="text-[10px] text-slate-300 font-semibold group-hover:text-emerald-400 transition-colors">{e.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Variables Selector */}
                        <div className="flex flex-col flex-1 pt-1">
                            <label className="text-[10px] text-slate-500 font-semibold uppercase mb-2 flex justify-between">
                                Señales Analíticas
                                <span className="bg-emerald-950/50 text-emerald-500 px-1.5 rounded">{selVariables.length}</span>
                            </label>

                            <div className="relative mb-2">
                                <Search className="absolute left-2.5 top-[5px] h-3.5 w-3.5 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded pl-8 pr-2 py-1 text-[11px] text-slate-300 outline-none focus:border-emerald-500"
                                />
                            </div>

                            <div className="flex-1 bg-slate-950 border border-slate-800 rounded overflow-y-auto max-h-[140px] custom-scrollbar shadow-inner">
                                {filteredVariables.map(v => (
                                    <label key={v.key} className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-800/30 hover:bg-slate-900 cursor-pointer transition-colors group">
                                        <input
                                            type="checkbox"
                                            checked={selVariables.includes(v.key)}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelVariables(prev => [...prev, v.key]);
                                                else setSelVariables(prev => prev.filter(k => k !== v.key));
                                            }}
                                            className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 accent-emerald-500 cursor-pointer"
                                        />
                                        <span className="text-[10px] text-slate-300 font-semibold group-hover:text-emerald-400 transition-colors">{v.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <button onClick={handleAddParam} className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded py-2 text-[11px] font-bold transition-colors mt-2 text-emerald-400 hover:text-emerald-300">
                            Construir Tabla
                        </button>
                    </div>
                </div>
            </div>

            {/* ====== RIGHT PANEL: RESULTS & DATA ====== */}
            <div className="flex-1 flex flex-col min-w-0 bg-slate-950">

                {/* --- BARRA SUPERIOR (Paginación / Exportar) --- */}
                <div className="h-12 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-4 flex-shrink-0">

                    {/* Controles de Vista de Tabla */}
                    <div className="flex items-center gap-4 text-slate-400">
                        <div className="flex items-center gap-2">
                            <span className="hidden sm:inline">Resultados por pág.</span>
                            <span className="sm:hidden">Filas</span>
                            <select value={itemsPerPage} onChange={e => setItemsPerPage(e.target.value)} className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 outline-none text-slate-300 focus:border-blue-500">
                                <option>25</option>
                                <option>50</option>
                                <option>100</option>
                                <option>250</option>
                            </select>
                        </div>

                        <div className="h-4 w-px bg-slate-700 mx-1"></div>

                        <div className="flex items-center gap-2">
                            <div className="flex items-center bg-slate-950 border border-slate-700 rounded divide-x divide-slate-700">
                                <button className="px-1.5 py-1 hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"><ChevronsLeft className="h-3.5 w-3.5" /></button>
                                <button className="px-1.5 py-1 hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"><ChevronLeft className="h-3.5 w-3.5" /></button>
                            </div>
                            <span className="px-2 py-0.5 font-bold text-slate-200 bg-slate-800 rounded border border-slate-700 text-[10px]">1</span>
                            <div className="flex items-center bg-slate-950 border border-slate-700 rounded divide-x divide-slate-700">
                                <button className="px-1.5 py-1 hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"><ChevronRight className="h-3.5 w-3.5" /></button>
                                <button className="px-1.5 py-1 hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"><ChevronsRight className="h-3.5 w-3.5" /></button>
                            </div>
                        </div>

                        <span className="text-[10px] hidden md:inline ml-2 border border-slate-800 bg-slate-950 px-2 py-0.5 rounded-full">
                            Página 1 de 1
                            <span className="text-slate-600 ml-1">({timeGridData.length} registros)</span>
                        </span>
                    </div>

                    {/* Acciones e Iconos */}
                    <div className="flex items-center gap-1.5 sm:gap-3 text-slate-400">
                        <button title="Exportar CSV" className="p-1.5 hover:text-emerald-400 hover:bg-slate-800 rounded transition-all"><Download className="h-4 w-4" /></button>
                        <button title="Guardar Preset" className="p-1.5 hover:text-blue-400 hover:bg-slate-800 rounded transition-all"><Save className="h-4 w-4" /></button>

                        <div className="h-4 w-px bg-slate-700 mx-1"></div>

                        <button
                            onClick={() => setActiveTab(activeTab === 'DATOS' ? 'GRAFICO' : 'DATOS')}
                            title={activeTab === 'DATOS' ? "Ver Gráfica" : "Ver Tabla"}
                            className={`p-1.5 rounded transition-all flex items-center gap-1.5 border border-transparent ${activeTab === 'GRAFICO' ? 'text-amber-400 bg-amber-950/30 border-amber-900/50' : 'hover:text-amber-400 hover:bg-slate-800'}`}
                        >
                            {activeTab === 'DATOS' ? <LineChart className="h-4 w-4" /> : <List className="h-4 w-4" />}
                            <span className="hidden lg:inline text-[10px] font-bold uppercase tracking-wide">
                                {activeTab === 'DATOS' ? 'Gráfica' : 'Datos'}
                            </span>
                        </button>

                        <div className="h-4 w-px bg-slate-700 mx-1"></div>

                        <button title="Configuración" className="p-1.5 hover:text-slate-200 hover:bg-slate-800 rounded transition-all"><Settings className="h-4 w-4" /></button>
                        <button title="Pantalla Completa" className="p-1.5 hover:text-slate-200 hover:bg-slate-800 rounded transition-all"><Maximize className="h-4 w-4" /></button>
                    </div>
                </div>

                {/* --- CONTENIDO PRINCIPAL (Tabla o Gráfica) --- */}
                <div className="flex-1 overflow-hidden relative">

                    {/* EMPTY STATE */}
                    {activeParams.length === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 bg-slate-950/50">
                            <Box className="h-16 w-16 mb-4 opacity-10" />
                            <h3 className="font-bold text-slate-400 text-base">Constructor de Consultas Vacío</h3>
                            <p className="text-xs mt-2 max-w-sm text-center">Utiliza el panel izquierdo para seleccionar los elementos físicos y las variables que deseas analizar.</p>
                        </div>
                    )}

                    {/* VISTA: TABLA DATOS */}
                    {activeParams.length > 0 && activeTab === 'DATOS' && (
                        <div className="h-full overflow-auto relative custom-scrollbar bg-slate-950">
                            <table className="w-full text-left whitespace-nowrap border-collapse">
                                <thead className="bg-slate-900 sticky top-0 z-10 shadow-md">
                                    <tr>
                                        <th className="px-4 py-3 border-b border-r border-slate-800 min-w-[160px] font-bold text-[11px] text-slate-300 bg-slate-900">
                                            <div className="flex items-center justify-between">
                                                Tiempo <FilterIcon />
                                            </div>
                                        </th>
                                        {activeParams.map(p => (
                                            <th key={p.id} className="px-4 py-2 border-b border-r border-slate-800 hover:bg-slate-800/80 transition-colors group min-w-[180px] bg-slate-900">
                                                <div className="flex justify-between items-start mb-1">
                                                    <span className="text-[9px] uppercase tracking-wider text-blue-400 font-bold bg-blue-950/30 px-1 py-0.5 rounded">
                                                        {p.gateway}
                                                    </span>
                                                    <button onClick={() => removeParam(p.id)} title="Remover" className="opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-opacity">
                                                        <Trash2 className="h-3 w-3" />
                                                    </button>
                                                </div>
                                                <div className="text-[11px] font-semibold text-slate-200 truncate" title={`${p.labelInfo} - ${p.variableName}`}>
                                                    {p.labelInfo}
                                                </div>
                                                <div className="text-[10px] text-slate-400 flex items-center justify-between mt-0.5">
                                                    <span className="truncate text-emerald-500">{p.variableName}</span>
                                                    <FilterIcon className="opacity-0 group-hover:opacity-100 h-2.5 w-2.5 ml-1 flex-shrink-0" />
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {periodTrigger > 0 && timeGridData.length === 0 ? (
                                        <tr><td colSpan={100} className="text-center py-12 text-slate-500 font-mono text-xs">Sin registros para el rango temporal.</td></tr>
                                    ) : (
                                        timeGridData.map((row, i) => (
                                            <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/50 transition-colors">
                                                <td className="px-4 py-2 border-r border-slate-800/30 font-mono text-[11px] text-slate-400 bg-slate-900/30">
                                                    {format(new Date(row.ts), 'dd/MM/yyyy HH:mm:ss')}
                                                </td>
                                                {activeParams.map(p => {
                                                    const val = row[p.rawKey];
                                                    return (
                                                        <td key={p.id} className="px-4 py-2 border-r border-slate-800/30 font-mono text-[11px] text-right text-slate-300">
                                                            {val !== undefined ? val.toFixed(4) : <span className="text-slate-700">-</span>}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))
                                    )}
                                    {/* Empty filler rows if no data searched yet */}
                                    {periodTrigger === 0 && Array.from({ length: 15 }).map((_, i) => (
                                        <tr key={`empty-${i}`} className="border-b border-slate-800/10">
                                            <td className="px-4 py-3 border-r border-slate-800/10 text-slate-800">--</td>
                                            {activeParams.map(p => <td key={`e-${p.id}`} className="px-4 py-3 border-r border-slate-800/10 text-slate-800">--</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* VISTA: GRÁFICO */}
                    {activeParams.length > 0 && activeTab === 'GRAFICO' && (
                        <div className="p-4 h-full bg-slate-950 flex flex-col">
                            {periodTrigger === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                                    <LineChart className="h-12 w-12 mb-4 opacity-20" />
                                    <h3 className="text-sm">Aplica un rango temporal para renderizar el gráfico multiparamétrico.</h3>
                                </div>
                            ) : timeGridData.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                                    <span className="font-mono text-xs">Sin registros para graficar.</span>
                                </div>
                            ) : (
                                <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded p-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RechartsLineChart data={timeGridData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                                            <XAxis dataKey="ts" stroke="#475569" fontSize={10} tickFormatter={(val) => format(new Date(val), 'HH:mm')} minTickGap={40} tick={{ fill: '#64748b' }} />
                                            <YAxis stroke="#475569" fontSize={10} domain={['auto', 'auto']} tick={{ fill: '#64748b' }} width={40} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '4px', fontSize: '11px', color: '#f8fafc' }}
                                                labelFormatter={(ts) => format(new Date(ts), 'dd/MM/yyyy HH:mm:ss')}
                                                itemStyle={{ padding: '2px 0' }}
                                            />
                                            <Legend wrapperStyle={{ paddingTop: '15px', fontSize: '11px' }} />
                                            {activeParams.map((p, i) => (
                                                <Line
                                                    key={p.rawKey}
                                                    type="monotone"
                                                    dataKey={p.rawKey}
                                                    name={`${p.gateway} | ${p.labelInfo} | ${p.variableKey.split('_')[0]}`}
                                                    stroke={`hsl(${(i * 137.5) % 360}, 80%, 65%)`}
                                                    strokeWidth={2}
                                                    dot={false}
                                                    activeDot={{ r: 4, strokeWidth: 0 }}
                                                />
                                            ))}
                                        </RechartsLineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>

            {/* Custom scrollbar styles global o local en Next.js */}
            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(15, 23, 42, 1);
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(51, 65, 85, 1);
                    border-radius: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(71, 85, 105, 1);
                }
            `}</style>
        </div>
    );
}

// Helper icon
function FilterIcon({ className = "" }: { className?: string }) {
    return (
        <svg className={`h-3 w-3 inline cursor-pointer text-slate-500 hover:text-blue-400 transition-colors ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
    );
}
