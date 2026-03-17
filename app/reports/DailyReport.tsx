import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { ScbData } from '@/app/types';

// Registramos una fuente estándar para que se vea profesional
Font.register({
    family: 'Helvetica',
    fonts: [
        { src: 'https://cdn.jsdelivr.net/npm/@canvas-fonts/helvetica@1.0.4/Helvetica.ttf' },
        { src: 'https://cdn.jsdelivr.net/npm/@canvas-fonts/helvetica@1.0.4/Helvetica-Bold.ttf', fontWeight: 'bold' },
    ],
});

const styles = StyleSheet.create({
    page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#333' },
    header: { marginBottom: 20, borderBottom: '2px solid #047857', paddingBottom: 10, flexDirection: 'row', justifyContainer: 'space-between' },
    title: { fontSize: 24, fontWeight: 'bold', color: '#047857' },
    subtitle: { fontSize: 12, color: '#666', marginTop: 5 },
    section: { marginVertical: 15 },
    sectionTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 10, color: '#065f46', backgroundColor: '#d1fae5', padding: 5 },

    // Tablas
    table: { width: 'auto', borderStyle: 'solid', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10 },
    tableRow: { margin: 'auto', flexDirection: 'row' },
    tableHeader: { backgroundColor: '#f3f4f6', fontWeight: 'bold' },
    tableCol: { width: '25%', borderStyle: 'solid', borderWidth: 1, borderColor: '#e5e7eb', padding: 5 },
    tableCell: { margin: 'auto', marginTop: 5, fontSize: 9 },

    // KPI Box
    kpiContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    kpiBox: { width: '30%', padding: 10, border: '1px solid #e5e7eb', borderRadius: 5, textAlign: 'center' },
    kpiValue: { fontSize: 18, fontWeight: 'bold', marginTop: 5 },
    kpiLabel: { fontSize: 9, color: '#666' },

    // Footer
    footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, textAlign: 'center', color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: 10 },
});

interface ReportProps {
    data: ScbData[];
    date: string;
}

export const DailyReportPdf = ({ data, date }: ReportProps) => {
    // LÓGICA DE FILTRADO
    const offlineScbs = data.filter(d => d.estado === 'OFFLINE' || d.estado === 'READ_FAIL');
    const alertScbs = data.filter(d => d.estado.includes('FUSIBLE') || d.estado === 'BAJA_TENSION' || (d.i_total ?? 0) < 0.5);

    // Cálculo de Pérdidas (Simplificado para el reporte)
    const totalAmps = data.reduce((acc, curr) => acc + ((curr.i_total ?? 0) / 100), 0);
    const avgVolts = 800; // Valor nominal aproximado si no hay lectura
    const totalPowerMW = (totalAmps * avgVolts) / 1000000;

    // Pérdida estimada (Offline + Alertas)
    const lostBoxes = offlineScbs.length + (alertScbs.length * 0.2);
    const avgBoxPower = totalPowerMW / (data.length - offlineScbs.length || 1);
    const lostMW = lostBoxes * avgBoxPower;

    return (
        <Document>
            <Page size="A4" style={styles.page}>

                {/* ENCABEZADO */}
                <View style={styles.header}>
                    <View>
                        <Text style={styles.title}>Reporte Diario de Planta</Text>
                        <Text style={styles.subtitle}>Parque Fotovoltaico Girasol | {date}</Text>
                    </View>
                </View>

                {/* RESUMEN EJECUTIVO (KPIS) */}
                <View style={styles.kpiContainer}>
                    <View style={styles.kpiBox}>
                        <Text style={styles.kpiLabel}>Disponibilidad</Text>
                        <Text style={{ ...styles.kpiValue, color: '#059669' }}>
                            {(((data.length - offlineScbs.length) / data.length) * 100).toFixed(1)}%
                        </Text>
                    </View>
                    <View style={styles.kpiBox}>
                        <Text style={styles.kpiLabel}>Cajas con Alertas</Text>
                        <Text style={{ ...styles.kpiValue, color: '#d97706' }}>{alertScbs.length}</Text>
                    </View>
                    <View style={styles.kpiBox}>
                        <Text style={styles.kpiLabel}>Pérdida Estimada</Text>
                        <Text style={{ ...styles.kpiValue, color: '#be123c' }}>{lostMW.toFixed(3)} MW</Text>
                    </View>
                </View>

                {/* SECCIÓN 1: CAJAS OFFLINE */}
                {offlineScbs.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Equipos Sin Comunicación (Offline)</Text>
                        <View style={styles.table}>
                            <View style={[styles.tableRow, styles.tableHeader]}>
                                <View style={styles.tableCol}><Text style={styles.tableCell}>Power Station</Text></View>
                                <View style={styles.tableCol}><Text style={styles.tableCell}>Inversor</Text></View>
                                <View style={styles.tableCol}><Text style={styles.tableCell}>SCB ID</Text></View>
                                <View style={styles.tableCol}><Text style={styles.tableCell}>Estado</Text></View>
                            </View>
                            {offlineScbs.slice(0, 15).map((scb, i) => ( // Limitamos a 15 para ejemplo
                                <View key={i} style={styles.tableRow}>
                                    <View style={styles.tableCol}><Text style={styles.tableCell}>{scb.power_station}</Text></View>
                                    <View style={styles.tableCol}><Text style={styles.tableCell}>{scb.inversor}</Text></View>
                                    <View style={styles.tableCol}><Text style={styles.tableCell}>{scb.scb}</Text></View>
                                    <View style={styles.tableCol}><Text style={{ ...styles.tableCell, color: 'red' }}>OFFLINE</Text></View>
                                </View>
                            ))}
                        </View>
                        {offlineScbs.length > 15 && <Text style={{ fontSize: 8, color: '#666' }}>... y {offlineScbs.length - 15} más.</Text>}
                    </View>
                )}

                {/* SECCIÓN 2: STRINGS DAÑADOS / BAJA PRODUCCIÓN */}
                {alertScbs.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Alertas de Rendimiento (Fusibles/Suciedad)</Text>
                        <View style={styles.table}>
                            <View style={[styles.tableRow, styles.tableHeader]}>
                                <View style={styles.tableCol}><Text style={styles.tableCell}>Ubicación</Text></View>
                                <View style={styles.tableCol}><Text style={styles.tableCell}>Corriente Total</Text></View>
                                <View style={styles.tableCol}><Text style={styles.tableCell}>Voltaje</Text></View>
                                <View style={styles.tableCol}><Text style={styles.tableCell}>Diagnóstico</Text></View>
                            </View>
                            {alertScbs.slice(0, 20).map((scb, i) => (
                                <View key={i} style={styles.tableRow}>
                                    <View style={styles.tableCol}><Text style={styles.tableCell}>{scb.power_station} - Inv {scb.inversor} - #{scb.scb}</Text></View>
                                    <View style={styles.tableCol}><Text style={styles.tableCell}>{((scb.i_total ?? 0) / 100).toFixed(1)} A</Text></View>
                                    <View style={styles.tableCol}><Text style={styles.tableCell}>{(scb.vdc ?? 0).toFixed(0)} V</Text></View>
                                    <View style={styles.tableCol}><Text style={styles.tableCell}>{scb.estado}</Text></View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                <Text style={styles.footer}>Generado automáticamente por el Sistema SCADA Girasol - {new Date().toLocaleString()}</Text>
            </Page>
        </Document>
    );
};