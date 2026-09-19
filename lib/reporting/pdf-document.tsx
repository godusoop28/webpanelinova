import "server-only";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ReportData } from "@/lib/reporting/report-data";
import { ROUTE_LABELS, toCanonicalRoute, type RawInterestType } from "@/lib/reporting/report-aggregation";
import { formatMexicoCityDateTime } from "@/lib/timezone";

/**
 * Server-rendered PDF via @react-pdf/renderer (pdfkit under the hood) —
 * pure JS, no headless Chromium, so it runs in a plain Node.js Vercel
 * function without extra runtime config. Deliberately uses only the
 * built-in Helvetica font (no Font.register): registering a remote font
 * means fetching it over the network on every cold start, which is exactly
 * the kind of fragility a "no metas algo pesado" PDF export should avoid.
 */

const INK = "#17140f";
const INK_MUTED = "#6b6459";
const GOLD = "#8a6d24";
const BORDER = "#e4dfd4";
const SURFACE_MUTED = "#faf9f6";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: INK },
  header: { marginBottom: 16, borderBottom: 2, borderBottomColor: GOLD, paddingBottom: 12 },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: GOLD, letterSpacing: 1 },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", color: INK, marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  metaLabel: { fontSize: 8, color: INK_MUTED },
  metaValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: INK },
  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  summaryCard: {
    width: "18%",
    minWidth: 90,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 8,
    backgroundColor: SURFACE_MUTED,
  },
  summaryValue: { fontSize: 14, fontFamily: "Helvetica-Bold", color: INK },
  summaryLabel: { fontSize: 7, color: INK_MUTED, marginTop: 2, textTransform: "uppercase" },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 4, overflow: "hidden" },
  tableHeaderRow: { flexDirection: "row", backgroundColor: INK, paddingVertical: 5 },
  tableHeaderCell: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#ffffff", textTransform: "uppercase" },
  tableRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: BORDER, paddingVertical: 4 },
  tableRowAlt: { backgroundColor: SURFACE_MUTED },
  tableCell: { fontSize: 8, color: INK, paddingRight: 4 },
  tableCellMuted: { fontSize: 8, color: INK_MUTED, paddingRight: 4 },
  emptyNote: { fontSize: 9, color: INK_MUTED, fontStyle: "italic", padding: 10, textAlign: "center" },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: INK_MUTED,
    borderTop: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  truncationNote: { fontSize: 7.5, color: INK_MUTED, marginBottom: 6, fontStyle: "italic" },
});

export interface PdfLeadRow {
  fechaHora: string;
  nombre: string;
  telefono: string;
  interestType: string;
  origen: string;
  asesorAsignado: string;
  estado: string;
}

export interface ReportPdfProps {
  companyName: string;
  report: ReportData;
  periodLabel: string;
  generatedAt: Date;
  leads: PdfLeadRow[];
  leadsTotal: number;
  leadsTruncated: boolean;
}

function px(cols: number[]) {
  return cols.map((width) => ({ width: `${width}%` }));
}

const ADVISOR_COLS = [22, 12, 16.5, 16.5, 16.5, 16.5];
const ORIGIN_COLS = [55, 22.5, 22.5];
const LEAD_COLS = [13, 19, 13, 13, 16, 16, 10];

export function ReportPdfDocument({
  companyName,
  report,
  periodLabel,
  generatedAt,
  leads,
  leadsTotal,
  leadsTruncated,
}: ReportPdfProps) {
  const advisorColStyles = px(ADVISOR_COLS);
  const originColStyles = px(ORIGIN_COLS);
  const leadColStyles = px(LEAD_COLS);

  return (
    <Document title={`${companyName} - Reporte de leads`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <Text style={styles.brand}>{companyName.toUpperCase()}</Text>
          <Text style={styles.title}>Reporte de Leads</Text>
          <View style={styles.metaRow}>
            <View>
              <Text style={styles.metaLabel}>Periodo</Text>
              <Text style={styles.metaValue}>{periodLabel}</Text>
            </View>
            <View>
              <Text style={styles.metaLabel}>Fecha de generación</Text>
              <Text style={styles.metaValue}>{formatMexicoCityDateTime(generatedAt)}</Text>
            </View>
          </View>
        </View>

        {/* --- Resumen --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumen</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{report.summary.total}</Text>
              <Text style={styles.summaryLabel}>Total leads</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{report.summary.byRoute.PROPERTY}</Text>
              <Text style={styles.summaryLabel}>{ROUTE_LABELS.PROPERTY}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{report.summary.byRoute.EXPLORE}</Text>
              <Text style={styles.summaryLabel}>{ROUTE_LABELS.EXPLORE}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{report.summary.byRoute.CAMPAIGN}</Text>
              <Text style={styles.summaryLabel}>{ROUTE_LABELS.CAMPAIGN}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{report.summary.byRoute.TIMEOUT}</Text>
              <Text style={styles.summaryLabel}>{ROUTE_LABELS.TIMEOUT}</Text>
            </View>
          </View>
        </View>

        {/* --- Desglose por asesor --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Desglose por asesor</Text>
          {report.byAdvisor.length === 0 ? (
            <Text style={styles.emptyNote}>No hay leads en este periodo.</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, advisorColStyles[0]]}>Asesor</Text>
                <Text style={[styles.tableHeaderCell, advisorColStyles[1]]}>Total</Text>
                <Text style={[styles.tableHeaderCell, advisorColStyles[2]]}>{ROUTE_LABELS.PROPERTY}</Text>
                <Text style={[styles.tableHeaderCell, advisorColStyles[3]]}>{ROUTE_LABELS.EXPLORE}</Text>
                <Text style={[styles.tableHeaderCell, advisorColStyles[4]]}>{ROUTE_LABELS.CAMPAIGN}</Text>
                <Text style={[styles.tableHeaderCell, advisorColStyles[5]]}>{ROUTE_LABELS.TIMEOUT}</Text>
              </View>
              {report.byAdvisor.map((row, i) => (
                <View key={row.advisorId ?? "unassigned"} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]} wrap={false}>
                  <Text style={[styles.tableCell, advisorColStyles[0]]}>{row.advisorName}</Text>
                  <Text style={[styles.tableCell, advisorColStyles[1]]}>{row.total}</Text>
                  <Text style={[styles.tableCellMuted, advisorColStyles[2]]}>{row.byRoute.PROPERTY}</Text>
                  <Text style={[styles.tableCellMuted, advisorColStyles[3]]}>{row.byRoute.EXPLORE}</Text>
                  <Text style={[styles.tableCellMuted, advisorColStyles[4]]}>{row.byRoute.CAMPAIGN}</Text>
                  <Text style={[styles.tableCellMuted, advisorColStyles[5]]}>{row.byRoute.TIMEOUT}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* --- Desglose por origen --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Desglose por origen</Text>
          {report.byOrigin.length === 0 ? (
            <Text style={styles.emptyNote}>No hay leads en este periodo.</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, originColStyles[0]]}>Origen</Text>
                <Text style={[styles.tableHeaderCell, originColStyles[1]]}>Cantidad</Text>
                <Text style={[styles.tableHeaderCell, originColStyles[2]]}>%</Text>
              </View>
              {report.byOrigin.map((row, i) => (
                <View key={row.origin} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]} wrap={false}>
                  <Text style={[styles.tableCell, originColStyles[0]]}>{row.origin}</Text>
                  <Text style={[styles.tableCell, originColStyles[1]]}>{row.count}</Text>
                  <Text style={[styles.tableCellMuted, originColStyles[2]]}>{row.percent}%</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* --- Detalle de leads --- */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle de leads ({leadsTotal})</Text>
          {leadsTruncated && (
            <Text style={styles.truncationNote}>
              Mostrando los primeros {leads.length} de {leadsTotal} leads. Usa un rango más corto o exporta CSV para
              el listado completo.
            </Text>
          )}
          {leads.length === 0 ? (
            <Text style={styles.emptyNote}>No hay leads en este periodo.</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.tableHeaderRow} fixed>
                <Text style={[styles.tableHeaderCell, leadColStyles[0]]}>Fecha</Text>
                <Text style={[styles.tableHeaderCell, leadColStyles[1]]}>Cliente</Text>
                <Text style={[styles.tableHeaderCell, leadColStyles[2]]}>Ruta</Text>
                <Text style={[styles.tableHeaderCell, leadColStyles[3]]}>Origen</Text>
                <Text style={[styles.tableHeaderCell, leadColStyles[4]]}>Asesor</Text>
                <Text style={[styles.tableHeaderCell, leadColStyles[5]]}>Estado</Text>
              </View>
              {leads.map((lead, i) => {
                const route = toCanonicalRoute(lead.interestType as RawInterestType);
                return (
                  <View
                    key={`${lead.telefono}-${lead.fechaHora}-${i}`}
                    style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}
                    wrap={false}
                  >
                    <Text style={[styles.tableCell, leadColStyles[0]]}>{formatMexicoCityDateTime(new Date(lead.fechaHora))}</Text>
                    <Text style={[styles.tableCell, leadColStyles[1]]}>{lead.nombre || "—"}</Text>
                    <Text style={[styles.tableCellMuted, leadColStyles[2]]}>{ROUTE_LABELS[route]}</Text>
                    <Text style={[styles.tableCellMuted, leadColStyles[3]]}>{lead.origen || "—"}</Text>
                    <Text style={[styles.tableCellMuted, leadColStyles[4]]}>{lead.asesorAsignado || "Sin asignar"}</Text>
                    <Text style={[styles.tableCellMuted, leadColStyles[5]]}>{lead.estado}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
          <Text>Generado desde Panel Century 21 Innova</Text>
        </View>
      </Page>
    </Document>
  );
}
