import { EmptyState } from "@/components/ui/state";
import { Avatar } from "@/components/ui/avatar";
import { ROUTE_LABELS, type AdvisorBreakdownRow } from "@/lib/reporting/report-data";

export function AdvisorBreakdownTable({ rows }: { rows: AdvisorBreakdownRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="px-5 pb-5">
        <EmptyState title="Sin asignaciones en el periodo" />
      </div>
    );
  }

  return (
    <>
      <div className="md:overflow-x-auto">
        <table className="responsive-table data-table w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-5 py-3">Asesor</th>
              <th className="px-4 py-3 text-right">Leads asignados</th>
              <th className="px-4 py-3 text-right">% del total</th>
              <th className="px-4 py-3 text-right">{ROUTE_LABELS.PROPERTY}</th>
              <th className="px-4 py-3 text-right">{ROUTE_LABELS.EXPLORE}</th>
              <th className="px-4 py-3 text-right">{ROUTE_LABELS.CAMPAIGN}</th>
              <th className="px-4 py-3 text-right">{ROUTE_LABELS.TIMEOUT}</th>
              <th className="px-4 py-3 text-right">Automáticas</th>
              <th className="px-4 py-3 text-right">Exclusivas</th>
              <th className="px-4 py-3 text-right">Manuales</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 tabular-nums">
            {rows.map((row) => (
              <tr key={row.advisorId ?? "unassigned"} className="transition-colors duration-150 hover:bg-surface-muted">
                <td data-label="Asesor" className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={row.advisorName} className="hidden size-8 text-xs md:flex" />
                    <span className={row.advisorId ? "font-medium text-ink-900" : "font-medium text-ink-500"}>{row.advisorName}</span>
                  </div>
                </td>
                <td data-label="Leads asignados" className="px-4 py-3 font-semibold text-ink-900 md:text-right">{row.total}</td>
                <td data-label="% del total" className="px-4 py-3 text-ink-600 md:text-right">{row.percent}%</td>
                <td data-label={ROUTE_LABELS.PROPERTY} className="px-4 py-3 text-ink-700 md:text-right">{row.byRoute.PROPERTY}</td>
                <td data-label={ROUTE_LABELS.EXPLORE} className="px-4 py-3 text-ink-700 md:text-right">{row.byRoute.EXPLORE}</td>
                <td data-label={ROUTE_LABELS.CAMPAIGN} className="px-4 py-3 text-ink-700 md:text-right">{row.byRoute.CAMPAIGN}</td>
                <td data-label={ROUTE_LABELS.TIMEOUT} className="px-4 py-3 text-ink-700 md:text-right">{row.byRoute.TIMEOUT}</td>
                <td data-label="Automáticas" className="px-4 py-3 text-ink-700 md:text-right">{row.automatic}</td>
                <td data-label="Exclusivas" className="px-4 py-3 text-ink-700 md:text-right">{row.exclusive}</td>
                <td data-label="Manuales" className="px-4 py-3 text-ink-700 md:text-right">{row.manual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-ink-100 px-5 py-3 text-xs text-ink-500">
        &quot;Leads asignados&quot; cuenta leads únicos según el asesor dueño de cada lead hoy. Automáticas, Exclusivas y Manuales cuentan eventos de
        asignación del periodo: pueden sumar más que los leads si un lead se reasignó.
      </p>
    </>
  );
}
