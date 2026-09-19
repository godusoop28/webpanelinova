import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Compass,
  Home,
  Megaphone,
  TimerOff,
  UserSquare2,
  Users,
} from "lucide-react";
import { KpiCard } from "@/components/ui/kpi-card";
import type { ReportSummary } from "@/lib/reporting/report-data";

/** Renders the KPI row for a ReportSummary — same shape rendered by dashboard, /reportes, and (as plain text) the PDF, so the numbers can never drift apart. */
export function SummaryCards({ summary }: { summary: ReportSummary }) {
  const status = summary.total === 0 ? ("empty" as const) : ("ready" as const);

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
      <KpiCard label="Total de leads" icon={Users} status="ready" value={summary.total} />
      <KpiCard label="Propiedad" icon={Home} status={status} value={summary.byRoute.PROPERTY} />
      <KpiCard label="Explorar" icon={Compass} status={status} value={summary.byRoute.EXPLORE} />
      <KpiCard label="Campaña" icon={Megaphone} status={status} value={summary.byRoute.CAMPAIGN} />
      <KpiCard label="Sin respuesta" icon={TimerOff} status={status} value={summary.byRoute.TIMEOUT} />
      <KpiCard label="Asesores con asignaciones" icon={UserSquare2} status="ready" value={summary.advisorsWithLeads} />
      <KpiCard label="Leads pendientes" icon={Clock} status="ready" value={summary.pendingLeads} />
      <KpiCard label="Con error de integración" icon={AlertCircle} status="ready" value={summary.integrationErrors} />
      <KpiCard label="Asignados correctamente" icon={CheckCircle2} status="ready" value={summary.assignedLeads} />
    </div>
  );
}
