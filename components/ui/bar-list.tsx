import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface BarRow {
  key: string;
  label: ReactNode;
  sublabel?: ReactNode;
  count: number;
  percent: number;
  icon?: LucideIcon;
  leading?: ReactNode;
}

/** Distribución con barras horizontales: etiqueta, barra, conteo y porcentaje sobre el total real. */
export function BarList({ rows, emptyLabel = "Sin datos en el periodo", className }: { rows: BarRow[]; emptyLabel?: string; className?: string }) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-500">{emptyLabel}</p>;
  }
  return (
    <ul className={cn("divide-y divide-ink-100", className)}>
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <li key={row.key} className="flex items-center gap-3 py-2.5">
            {row.leading ??
              (Icon ? (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-700">
                  <Icon className="size-4" aria-hidden />
                </span>
              ) : null)}
            <div className="w-28 min-w-0 shrink-0 sm:w-40">
              <p className="truncate text-sm font-medium text-ink-800" title={typeof row.label === "string" ? row.label : undefined}>
                {row.label}
              </p>
              {row.sublabel && <p className="truncate text-[11px] text-ink-500">{row.sublabel}</p>}
            </div>
            <div className="h-2 min-w-10 flex-1 overflow-hidden rounded-full bg-ink-100" aria-hidden>
              <div className="h-full rounded-full bg-accent-500" style={{ width: `${Math.min(100, Math.max(row.count > 0 ? 2 : 0, row.percent))}%` }} />
            </div>
            <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-900">{row.count}</span>
            <span className="w-11 shrink-0 text-right text-xs tabular-nums text-ink-500">{row.percent}%</span>
          </li>
        );
      })}
    </ul>
  );
}
