import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { ScbData } from '@/app/types';

// Registramos fuentes para que se vea nítido
Font.register({
    family: 'Roboto',
    fonts: [
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-light-webfont.ttf', fontWeight: 300 },
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 400 },
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-medium-webfont.ttf', fontWeight: 500 },
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 700 },
    ],
});

const styles = StyleSheet.create({
    page: { padding: 30, fontFamily: 'Roboto', fontSize: 10, color: '#1e293b' },

    // Header Corporativo
    headerContainer: { backgroundColor: '#0f172a', padding: 20, marginBottom: 20, borderRadius: 4 },
    headerTitle: { fontSize: 22, color: '#ffffff', fontWeight: 700, textTransform: 'uppercase' },
    headerSub: { fontSize: 10, color: '#94a3b8', marginTop: 4 },

    // Resumen Ejecutivo (KPI Cards)
    kpiRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
    kpiCard: { width: '32%', padding: 15, borderRadius: 4, backgroundColor: '#f8fafc', borderLeftWidth: 4 },
    kpiLabel: { fontSize: 9, color: '#64748b', textTransform: 'uppercase', marginBottom: 5 },
    kpiValue: { fontSize: 18, fontWeight: 700 },

    // Secciones
    sectionTitle: { fontSize: 14, fontWeight: 700, color: '#0f172a', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 5, marginBottom: 10, marginTop: 15 },

    // Tablas Pro
    table: { width: 'auto', marginBottom: 15 },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', alignItems: 'center', height: 24 },
    tableHeader: { backgroundColor: '#f1f5f9', borderBottomColor: '#cbd5e1', height: 28 },
    headerCell: { fontSize: 9, fontWeight: 700, color: '#475569' },
    cell: { fontSize: 9, color: '#334155' },

    // Columnas (Ajuste manual de anchos)
    col1: { width: '25%', paddingLeft: 5 }, // Ubicación
    col2: { width: '25%', paddingLeft: 5 }, // Estado
    col3: { width: '20%', paddingLeft: 5 }, // Valores
    col4: { width: '30%', paddingLeft: 5 }, // Diagnóstico

    // Footer
    footer: { position: 'absolute', bottom: 30, left: 30, right: 30, textAlign: 'center', fontSize: 8, color: '#94a3b8', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 10 }
});

interface Props {
    data: any[];
    filterName: string; // "Todo el Parque", "PS1", "PS1 - Inv 2"
}

export const ProfessionalReport = ({ data, filterName }: Props) => {
    // 1. Filtrar Data
    const offline = data.filter(d => d.status === 'OFFLINE' || d.status === 'READ_FAIL');
    const alerts = data.filter(d => d.status !== 'OK' && d.status !== 'OFFLINE' && d.status !== 'READ_FAIL');

    // 2. Cálculos de Impacto
    const totalAmps = data.reduce((acc, curr) => acc + (curr.amps || 0), 0);
    // Estimación de pérdida: Offline=100%, Alerta=20%
    const avgBoxPowerKW = (totalAmps * 800) / 1000 / (data.length - offline.length || 1);
    const lostKW_Offline = offline.length * avgBoxPowerKW;
    const lostKW_Alerts = alerts.length * (avgBoxPowerKW * 0.2);
    const totalLostMW = (lostKW_Offline + lostKW_Alerts) / 1000;

    return (
        <Document>
            <Page size="A4" style={styles.page}>

                {/* ENCABEZADO PREMIUM */}
                <View style={styles.headerContainer}>
                    <Text style={styles.headerTitle}>Informe Técnico de Operaciones</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                        <View>
                            <Text style={{ color: '#cbd5e1', fontSize: 9 }}>PLANTA</Text>
                            <Text style={{ color: 'white', fontSize: 10 }}>PS Girasol</Text>
                        </View>
                        <View>
                            <Text style={{ color: '#cbd5e1', fontSize: 9 }}>ALCANCE</Text>
                            <Text style={{ color: 'white', fontSize: 10 }}>{filterName}</Text>
                        </View>
                        <View>
                            <Text style={{ color: '#cbd5e1', fontSize: 9 }}>FECHA EMISIÓN</Text>
                            <Text style={{ color: 'white', fontSize: 10 }}>{new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</Text>
                        </View>
                    </View>
                </View>

                {/* RESUMEN EJECUTIVO (GRID DE TARJETAS) */}
                <View style={styles.kpiRow}>
                    {/* Tarjeta Disponibilidad */}
                    <View style={[styles.kpiCard, { borderLeftColor: '#10b981' }]}>
                        <Text style={styles.kpiLabel}>Disponibilidad Comms</Text>
                        <Text style={[styles.kpiValue, { color: '#059669' }]}>
                            {(((data.length - offline.length) / data.length) * 100).toFixed(1)}%
                        </Text>
                        <Text style={{ fontSize: 8, color: '#94a3b8' }}>{data.length - offline.length} / {data.length} SCBs Online</Text>
                    </View>

                    {/* Tarjeta Fallos Activos */}
                    <View style={[styles.kpiCard, { borderLeftColor: '#f59e0b' }]}>
                        <Text style={styles.kpiLabel}>Cajas con Alertas</Text>
                        <Text style={[styles.kpiValue, { color: '#d97706' }]}>{alerts.length}</Text>
                        <Text style={{ fontSize: 8, color: '#94a3b8' }}>Strings dañados o bajo rend.</Text>
                    </View>

                    {/* Tarjeta Impacto (MW Perdidos) */}
                    <View style={[styles.kpiCard, { borderLeftColor: '#ef4444' }]}>
                        <Text style={styles.kpiLabel}>Lucro Cesante Est.</Text>
                        <Text style={[styles.kpiValue, { color: '#dc2626' }]}>{totalLostMW.toFixed(3)} MW</Text>
                        <Text style={{ fontSize: 8, color: '#94a3b8' }}>Potencia no inyectada</Text>
                    </View>
                </View>

                {/* SECCIÓN 1: INCIDENCIAS CRÍTICAS (OFFLINE) */}
                {offline.length > 0 && (
                    <View wrap={false}>
                        <Text style={styles.sectionTitle}>Equipos Fuera de Línea (Offline)</Text>
                        <View style={styles.table}>
                            <View style={[styles.tableRow, styles.tableHeader]}>
                                <Text style={[styles.headerCell, styles.col1]}>Ubicación</Text>
                                <Text style={[styles.headerCell, styles.col2]}>Estado</Text>
                                <Text style={[styles.headerCell, styles.col3]}>Último Dato</Text>
                                <Text style={[styles.headerCell, styles.col4]}>Acción Recomendada</Text>
                            </View>
                            {offline.map((row, i) => (
                                <View key={i} style={[styles.tableRow, { backgroundColor: i % 2 === 0 ? 'white' : '#f8fafc' }]}>
                                    <Text style={[styles.cell, styles.col1]}>{row.ps} - Inv {row.inversor} - #{row.scb}</Text>
                                    <Text style={[styles.cell, styles.col2, { color: '#dc2626', fontWeight: 700 }]}>SIN COMUNICACIÓN</Text>
                                    <Text style={[styles.cell, styles.col3]}>--</Text>
                                    <Text style={[styles.cell, styles.col4]}>Verificar Gateway / Cableado RS485</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* SECCIÓN 2: AVERÍAS DE STRINGS (ALERTAS) */}
                {alerts.length > 0 && (
                    <View wrap={false}>
                        <Text style={styles.sectionTitle}>Anomalías de Rendimiento (Strings/Fusibles)</Text>
                        <View style={styles.table}>
                            <View style={[styles.tableRow, styles.tableHeader]}>
                                <Text style={[styles.headerCell, styles.col1]}>Ubicación</Text>
                                <Text style={[styles.headerCell, styles.col2]}>Diagnóstico</Text>
                                <Text style={[styles.headerCell, styles.col3]}>Telemetría</Text>
                                <Text style={[styles.headerCell, styles.col4]}>Detalle Técnico</Text>
                            </View>
                            {alerts.map((row, i) => (
                                <View key={i} style={[styles.tableRow, { backgroundColor: i % 2 === 0 ? 'white' : '#f8fafc' }]}>
                                    <Text style={[styles.cell, styles.col1]}>{row.ps} - Inv {row.inversor} - #{row.scb}</Text>
                                    <Text style={[styles.cell, styles.col2, { color: '#d97706', fontWeight: 700 }]}>
                                        {row.status.replace('ALERTA_', '').replace('_', ' ')}
                                    </Text>
                                    <Text style={[styles.cell, styles.col3]}>{row.amps.toFixed(1)} A</Text>
                                    <Text style={[styles.cell, styles.col4]}>
                                        {row.perf < 60 ? `Eficiencia Crítica (${row.perf.toFixed(0)}%)` : 'Posible Fusible Abierto'}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {offline.length === 0 && alerts.length === 0 && (
                    <View style={{ marginTop: 50, alignItems: 'center' }}>
                        <Text style={{ color: '#10b981', fontSize: 14, fontWeight: 700 }}>Sin incidencias reportadas en el alcance seleccionado.</Text>
                    </View>
                )}

                <Text style={styles.footer}>
                    Sistema de Gestión Girasol | Reporte generado automáticamente | Página <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
                </Text>
            </Page>
        </Document>
    );
};