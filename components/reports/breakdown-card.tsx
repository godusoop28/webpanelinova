import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/state";

export interface BreakdownRow {
  label: string;
  count: number;
  percent: number;
}

const BAR_COLOR = "#c19a3c";

/** Shared table shape for route/origin/status breakdowns — screen and PDF read the same rows so they can never disagree. */
export function BreakdownCard({
  title,
  columnLabel,
  rows,
  emptyLabel = "Sin datos en el periodo",
}: {
  title: string;
  columnLabel: string;
  rows: BreakdownRow[];
  emptyLabel?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title={emptyLabel} />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                <th className="py-2 pr-3 font-medium">{columnLabel}</th>
                <th className="py-2 pr-3 font-medium">Leads</th>
                <th className="py-2 font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-ink-50 last:border-0">
                  <td className="py-2 pr-3 text-ink-800">
                    <div className="flex flex-col gap-1">
                      <span>{row.label}</span>
                      <span className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${Math.min(100, row.percent)}%`, backgroundColor: BAR_COLOR }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="py-2 pr-3 font-medium text-ink-900">{row.count}</td>
                  <td className="py-2 text-ink-600">{row.percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
