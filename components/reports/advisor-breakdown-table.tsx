import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/state";
import { ROUTE_LABELS, type AdvisorBreakdownRow } from "@/lib/reporting/report-data";

export function AdvisorBreakdownTable({ rows }: { rows: AdvisorBreakdownRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-5">
        <EmptyState title="Sin asignaciones en el periodo" />
      </Card>
    );
  }

  return (
    <Card>
      <div className="md:overflow-x-auto">
        <table className="responsive-table w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
              <th className="px-5 py-3 font-medium">Asesor</th>
              <th className="px-5 py-3 font-medium">Leads asignados</th>
              <th className="px-5 py-3 font-medium">{ROUTE_LABELS.PROPERTY}</th>
              <th className="px-5 py-3 font-medium">{ROUTE_LABELS.EXPLORE}</th>
              <th className="px-5 py-3 font-medium">{ROUTE_LABELS.CAMPAIGN}</th>
              <th className="px-5 py-3 font-medium">{ROUTE_LABELS.TIMEOUT}</th>
              <th className="px-5 py-3 font-medium">% del total</th>
              <th className="px-5 py-3 font-medium">Automáticas</th>
              <th className="px-5 py-3 font-medium">Exclusivas</th>
              <th className="px-5 py-3 font-medium">Manuales</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.advisorId ?? "unassigned"}
                className="border-b border-ink-50 last:border-0 hover:bg-surface-muted"
              >
                <td data-label="Asesor" className="px-5 py-3 font-medium text-ink-900">
                  {row.advisorName}
                </td>
                <td data-label="Leads asignados" className="px-5 py-3 text-ink-600">{row.total}</td>
                <td data-label={ROUTE_LABELS.PROPERTY} className="px-5 py-3 text-ink-600">{row.byRoute.PROPERTY}</td>
                <td data-label={ROUTE_LABELS.EXPLORE} className="px-5 py-3 text-ink-600">{row.byRoute.EXPLORE}</td>
                <td data-label={ROUTE_LABELS.CAMPAIGN} className="px-5 py-3 text-ink-600">{row.byRoute.CAMPAIGN}</td>
                <td data-label={ROUTE_LABELS.TIMEOUT} className="px-5 py-3 text-ink-600">{row.byRoute.TIMEOUT}</td>
                <td data-label="% del total" className="px-5 py-3 text-ink-600">{row.percent}%</td>
                <td data-label="Automáticas" className="px-5 py-3 text-ink-600">{row.automatic}</td>
                <td data-label="Exclusivas" className="px-5 py-3 text-ink-600">{row.exclusive}</td>
                <td data-label="Manuales" className="px-5 py-3 text-ink-600">{row.manual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-400">
        &quot;Leads asignados&quot; refleja al asesor dueño de cada lead hoy. Automáticas/Exclusivas/Manuales cuentan
        eventos de asignación ocurridos en el periodo (pueden sumar más que el total si un lead se reasignó).
      </p>
    </Card>
  );
}
