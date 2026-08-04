import { requireSection } from "@/lib/dal";
import { getLeadRows } from "@/lib/google-sheets";
import { isDateInRange, resolveDateRange, type DateRangePreset } from "@/lib/metrics";
import { DateRangeFilter } from "@/components/date-range-filter";
import { LeadsByDayChart, LeadsByOriginChart } from "@/components/dashboard/charts";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { Badge } from "@/components/ui/badge";

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireSection("reportes");
  const params = await searchParams;
  const preset = (params.range as DateRangePreset) ?? "last_30_days";
  const range = resolveDateRange(
    preset,
    params.from && params.to ? { from: params.from, to: params.to } : undefined
  );

  let leads: Awaited<ReturnType<typeof getLeadRows>> = [];
  let loadError: string | null = null;
  try {
    leads = await getLeadRows();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  const inRange = leads.filter((lead) => isDateInRange(new Date(lead.fechaHora), range));

  const chartByDay = (() => {
    const buckets = new Map<string, number>();
    for (const lead of inRange) {
      const date = new Date(lead.fechaHora);
      const key = date.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" });
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([date, total]) => ({ date, total }));
  })();

  const chartByOrigin = (() => {
    const buckets = new Map<string, number>();
    for (const lead of inRange) {
      const key = lead.origen || "Sin especificar";
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets.entries()).map(([name, value]) => ({ name, value }));
  })();

  const byAdvisor = (() => {
    const buckets = new Map<string, { total: number; enviadas: number; pendientes: number; error: number }>();
    for (const lead of inRange) {
      const key = lead.asesorAsignado || "Sin asignar";
      const bucket = buckets.get(key) ?? { total: 0, enviadas: 0, pendientes: 0, error: 0 };
      bucket.total += 1;
      const estado = lead.estadoEnvioAsesor.toLowerCase();
      if (estado.includes("error")) bucket.error += 1;
      else if (estado.includes("pendient")) bucket.pendientes += 1;
      else if (estado) bucket.enviadas += 1;
      buckets.set(key, bucket);
    }
    return Array.from(buckets.entries())
      .map(([advisor, stats]) => ({ advisor, ...stats }))
      .sort((a, b) => b.total - a.total);
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Reportes</h1>
          <p className="text-sm text-ink-500">
            {user.role === "CONSULTA"
              ? "Modo de solo lectura."
              : "Desempeño de leads por periodo y por asesor."}
          </p>
        </div>
        <DateRangeFilter current={preset} />
      </div>

      {loadError ? (
        <ErrorState title="No se pudo cargar Google Sheets" description={loadError} />
      ) : inRange.length === 0 ? (
        <EmptyState title="Sin datos en el periodo seleccionado" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <LeadsByDayChart data={chartByDay} />
            <LeadsByOriginChart data={chartByOrigin} />
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-5 py-3 font-medium">Asesor</th>
                    <th className="px-5 py-3 font-medium">Leads recibidos</th>
                    <th className="px-5 py-3 font-medium">Notificados</th>
                    <th className="px-5 py-3 font-medium">Pendientes</th>
                    <th className="px-5 py-3 font-medium">Con error</th>
                  </tr>
                </thead>
                <tbody>
                  {byAdvisor.map((row) => (
                    <tr key={row.advisor} className="border-b border-ink-50 last:border-0 hover:bg-surface-muted">
                      <td className="px-5 py-3 font-medium text-ink-900">{row.advisor}</td>
                      <td className="px-5 py-3 text-ink-600">{row.total}</td>
                      <td className="px-5 py-3">
                        <Badge tone="success">{row.enviadas}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone="warning">{row.pendientes}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone="danger">{row.error}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
