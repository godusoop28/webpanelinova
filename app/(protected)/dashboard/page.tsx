import {
  AlertCircle,
  CheckCircle2,
  Compass,
  Dices,
  Home,
  Megaphone,
  ShieldCheck,
  Users,
  UserSquare2,
} from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { listAdvisorViews } from "@/lib/services/advisor.service";
import { listLeadMetricsRows } from "@/lib/services/lead-view.service";
import {
  computeLeadMetrics,
  percentChange,
  previousPeriod,
  resolveDateRange,
  type DateRangePreset,
} from "@/lib/metrics";
import { DateRangeFilter } from "@/components/date-range-filter";
import { KpiCard, type KpiStatus } from "@/components/ui/kpi-card";
import { LeadsByDayChart, LeadsByOriginChart } from "@/components/dashboard/charts";

async function settle<T>(promise: Promise<T>): Promise<
  { status: "ready"; value: T } | { status: "error"; error: string }
> {
  try {
    return { status: "ready", value: await promise };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  await requireSection("dashboard");
  const params = await searchParams;
  const preset = (params.range as DateRangePreset) ?? "last_30_days";
  const range = resolveDateRange(
    preset,
    params.from && params.to ? { from: params.from, to: params.to } : undefined
  );
  const previous = previousPeriod(range);

  // The metrics window needs to cover both the current and the comparison period in one fetch.
  const widestFrom = previous.from < range.from ? previous.from : range.from;
  const widestTo = previous.to > range.to ? previous.to : range.to;
  const companyId = await getDefaultCompanyId();

  const [leadsResult, advisorsResult] = await Promise.all([
    settle(listLeadMetricsRows(companyId, widestFrom, widestTo)),
    settle(listAdvisorViews(companyId)),
  ]);

  const currentMetrics =
    leadsResult.status === "ready" ? computeLeadMetrics(leadsResult.value, range) : null;
  const previousMetrics =
    leadsResult.status === "ready" ? computeLeadMetrics(leadsResult.value, previous) : null;

  const leadStatus: KpiStatus =
    leadsResult.status === "error"
      ? "error"
      : currentMetrics && currentMetrics.totalSolicitudes === 0
        ? "empty"
        : "ready";

  const advisorsActive =
    advisorsResult.status === "ready"
      ? advisorsResult.value.filter((a) => a.activo).length
      : null;

  const chartByDay = (() => {
    if (leadsResult.status !== "ready") return [];
    const buckets = new Map<string, number>();
    for (const lead of leadsResult.value) {
      const date = new Date(lead.fechaHora);
      if (Number.isNaN(date.getTime())) continue;
      if (date < range.from || date > range.to) continue;
      const key = date.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "2-digit" });
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([date, total]) => ({ date, total }));
  })();

  const chartByOrigin = (() => {
    if (leadsResult.status !== "ready") return [];
    const buckets = new Map<string, number>();
    for (const lead of leadsResult.value) {
      const date = new Date(lead.fechaHora);
      if (Number.isNaN(date.getTime())) continue;
      if (date < range.from || date > range.to) continue;
      const key = lead.origen || "Sin especificar";
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([name, value]) => ({ name, value }));
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Resumen ejecutivo</h1>
          <p className="text-sm text-ink-500">Indicadores consolidados del periodo seleccionado.</p>
        </div>
        <DateRangeFilter current={preset} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
        <KpiCard
          label="Personas únicas atendidas"
          icon={Users}
          status={leadStatus}
          value={currentMetrics?.personasUnicas}
          changePercent={
            currentMetrics && previousMetrics
              ? percentChange(currentMetrics.personasUnicas, previousMetrics.personasUnicas)
              : undefined
          }
        />
        <KpiCard
          label="Total de solicitudes"
          icon={CheckCircle2}
          status={leadStatus}
          value={currentMetrics?.totalSolicitudes}
          changePercent={
            currentMetrics && previousMetrics
              ? percentChange(currentMetrics.totalSolicitudes, previousMetrics.totalSolicitudes)
              : undefined
          }
        />
        <KpiCard
          label="Leads de campaña"
          icon={Megaphone}
          status={leadStatus}
          value={currentMetrics?.leadsCampana}
        />
        <KpiCard
          label="Leads de propiedad"
          icon={Home}
          status={leadStatus}
          value={currentMetrics?.leadsPropiedad}
        />
        <KpiCard
          label="Leads de exploración"
          icon={Compass}
          status={leadStatus}
          value={currentMetrics?.leadsExploracion}
        />
        <KpiCard
          label="Asesores activos"
          icon={UserSquare2}
          status={advisorsResult.status === "error" ? "error" : "ready"}
          value={advisorsActive ?? undefined}
        />
        <KpiCard
          label="Asignaciones exclusivas"
          icon={ShieldCheck}
          status={leadStatus}
          value={currentMetrics?.asignacionesExclusivas}
        />
        <KpiCard
          label="Asignaciones por ruleta"
          icon={Dices}
          status={leadStatus}
          value={currentMetrics?.asignacionesRuleta}
        />
        <KpiCard
          label="Notificaciones pendientes"
          icon={AlertCircle}
          status={leadStatus}
          value={currentMetrics?.notificacionesPendientes}
        />
        <KpiCard
          label="Notificaciones con error"
          icon={AlertCircle}
          status={leadStatus}
          value={currentMetrics?.notificacionesConError}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LeadsByDayChart data={chartByDay} />
        <LeadsByOriginChart data={chartByOrigin} />
      </div>
    </div>
  );
}
