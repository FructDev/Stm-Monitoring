import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// Fuentes
Font.register({
    family: 'Roboto',
    fonts: [
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 400 },
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 700 },
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-black-webfont.ttf', fontWeight: 900 },
    ],
});

const styles = StyleSheet.create({
    page: { padding: 30, fontFamily: 'Roboto', fontSize: 10, color: '#334155', backgroundColor: '#ffffff' },

    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30, borderBottomWidth: 2, borderBottomColor: '#0f172a', paddingBottom: 10 },
    brand: { fontSize: 26, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase' },
    dateBox: { textAlign: 'right' },
    dateLabel: { fontSize: 8, color: '#94a3b8' },
    dateValue: { fontSize: 10, fontWeight: 700 },

    // KPI Section
    kpiContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30, backgroundColor: '#f8fafc', padding: 15, borderRadius: 8 },
    kpiBox: { alignItems: 'center', width: '30%' },
    kpiLabel: { fontSize: 9, color: '#64748b', textTransform: 'uppercase', marginBottom: 4, fontWeight: 700 },
    kpiValue: { fontSize: 24, fontWeight: 900 },
    kpiSub: { fontSize: 8, color: '#94a3b8', marginTop: 2 },

    // Charts Section
    sectionTitle: { fontSize: 14, fontWeight: 900, color: '#0f172a', marginBottom: 15, textTransform: 'uppercase' },
    chartContainer: { marginBottom: 30 },
    chartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    chartLabel: { width: 40, fontSize: 9, fontWeight: 700, color: '#475569' },
    chartBarBg: { flex: 1, height: 12, backgroundColor: '#f1f5f9', borderRadius: 4, marginHorizontal: 8, position: 'relative' },
    chartBarFill: { height: '100%', borderRadius: 4 },
    chartValue: { width: 60, fontSize: 9, textAlign: 'right', fontWeight: 700 },

    // Table
    table: { marginTop: 10 },
    tableHeader: { flexDirection: 'row', backgroundColor: '#0f172a', padding: 8, borderRadius: 4 },
    headerCell: { color: 'white', fontSize: 9, fontWeight: 700 },
    tableRow: { flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
    cell: { fontSize: 9, color: '#334155' },

    // Table Columns
    col1: { width: '15%' }, // PS
    col2: { width: '20%', textAlign: 'center' }, // Offline
    col3: { width: '20%', textAlign: 'center' }, // Alertas
    col4: { width: '25%', textAlign: 'center' }, // Strings Est.
    col5: { width: '20%', textAlign: 'right' },  // MW Loss

    footer: { position: 'absolute', bottom: 30, left: 30, right: 30, textAlign: 'center', fontSize: 8, color: '#cbd5e1' }
});

interface AggregatedPS {
    name: string;
    totalBoxes: number;
    offlineCount: number;
    alertCount: number;
    lostMW: number;
}

interface Props {
    data: AggregatedPS[];
    globalStats: {
        totalLostMW: number;
        availability: number;
        totalAlerts: number;
    };
}

export const ManagementReport = ({ data, globalStats }: Props) => {
    // Encontrar el valor máximo de pérdida para escalar el gráfico (100% width)
    const maxLoss = Math.max(...data.map(d => d.lostMW), 0.001);

    return (
        <Document>
            <Page size="A4" style={styles.page}>

                {/* 1. ENCABEZADO GERENCIAL */}
                <View style={styles.header}>
                    <Text style={styles.brand}>Informe Ejecutivo</Text>
                    <View style={styles.dateBox}>
                        <Text style={styles.dateLabel}>FECHA DE REPORTE</Text>
                        <Text style={styles.dateValue}>{new Date().toLocaleDateString()}</Text>
                        <Text style={styles.dateLabel}>HORA: {new Date().toLocaleTimeString()}</Text>
                    </View>
                </View>

                {/* 2. KPIs GLOBALES (MACRO) */}
                <View style={styles.kpiContainer}>
                    <View style={styles.kpiBox}>
                        <Text style={styles.kpiLabel}>Disponibilidad</Text>
                        <Text style={[styles.kpiValue, { color: '#059669' }]}>{globalStats.availability.toFixed(1)}%</Text>
                        <Text style={styles.kpiSub}>Comunicación SCADA</Text>
                    </View>
                    <View style={styles.kpiBox}>
                        <Text style={styles.kpiLabel}>Cajas con Fallo</Text>
                        <Text style={[styles.kpiValue, { color: '#d97706' }]}>{globalStats.totalAlerts}</Text>
                        <Text style={styles.kpiSub}>Requieren Revisión</Text>
                    </View>
                    <View style={styles.kpiBox}>
                        <Text style={styles.kpiLabel}>Lucro Cesante</Text>
                        <Text style={[styles.kpiValue, { color: '#dc2626' }]}>{globalStats.totalLostMW.toFixed(3)} MW</Text>
                        <Text style={styles.kpiSub}>Pérdida Instantánea</Text>
                    </View>
                </View>

                {/* 3. GRÁFICO DE BARRAS (PÉRDIDAS POR PS) */}
                <View style={styles.chartContainer}>
                    <Text style={styles.sectionTitle}>Mapa de Pérdidas de Energía por Planta</Text>
                    {data.map((ps, i) => {
                        const widthPercent = (ps.lostMW / maxLoss) * 100;
                        // Color dinámico: Rojo fuerte si pierde mucho, naranja si es poco
                        const barColor = ps.lostMW > 0.1 ? '#ef4444' : '#f97316';

                        return (
                            <View key={i} style={styles.chartRow}>
                                <Text style={styles.chartLabel}>{ps.name}</Text>
                                <View style={styles.chartBarBg}>
                                    <View style={[styles.chartBarFill, { width: `${widthPercent}%`, backgroundColor: barColor }]} />
                                </View>
                                <Text style={[styles.chartValue, { color: barColor }]}>{ps.lostMW.toFixed(3)} MW</Text>
                            </View>
                        );
                    })}
                </View>

                {/* 4. TABLA AGREGADA (RESUMEN OPERATIVO) */}
                <View>
                    <Text style={styles.sectionTitle}>Detalle Operativo Agregado</Text>
                    <View style={styles.table}>
                        {/* Headers */}
                        <View style={styles.tableHeader}>
                            <Text style={[styles.headerCell, styles.col1]}>Planta</Text>
                            <Text style={[styles.headerCell, styles.col2]}>SCBs Offline</Text>
                            <Text style={[styles.headerCell, styles.col3]}>Cajas Alerta</Text>
                            <Text style={[styles.headerCell, styles.col4]}>Strings Afectados (Est)</Text>
                            <Text style={[styles.headerCell, styles.col5]}>Pérdida (MW)</Text>
                        </View>

                        {/* Rows */}
                        {data.map((ps, i) => (
                            <View key={i} style={[styles.tableRow, { backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' }]}>
                                <Text style={[styles.cell, styles.col1, { fontWeight: 700 }]}>{ps.name}</Text>

                                <Text style={[styles.cell, styles.col2, { color: ps.offlineCount > 0 ? '#dc2626' : '#cbd5e1', fontWeight: ps.offlineCount > 0 ? 700 : 400 }]}>
                                    {ps.offlineCount > 0 ? ps.offlineCount : '-'}
                                </Text>

                                <Text style={[styles.cell, styles.col3, { color: ps.alertCount > 0 ? '#d97706' : '#cbd5e1' }]}>
                                    {ps.alertCount > 0 ? ps.alertCount : '-'}
                                </Text>

                                {/* Estimación de Strings: Asumimos ~2.5 strings por alerta de caja si no tenemos dato preciso */}
                                <Text style={[styles.cell, styles.col4, { color: '#64748b' }]}>
                                    {Math.ceil(ps.alertCount * 2.5)} un.
                                </Text>

                                <Text style={[styles.cell, styles.col5, { fontWeight: 700, color: ps.lostMW > 0.05 ? '#dc2626' : '#334155' }]}>
                                    {ps.lostMW.toFixed(3)}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Footer */}
                <Text style={styles.footer}>Generado por SCADA Girasol - Documento Confidencial de Operaciones</Text>
            </Page>
        </Document>
    );
};