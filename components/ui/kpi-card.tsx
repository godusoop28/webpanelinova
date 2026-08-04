import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AlertTriangle, type LucideIcon, TrendingDown, TrendingUp } from "lucide-react";

export type KpiStatus = "loading" | "ready" | "empty" | "error";

interface KpiCardProps {
  label: string;
  icon: LucideIcon;
  status: KpiStatus;
  value?: number | string;
  changePercent?: number | null;
  errorMessage?: string;
  emptyMessage?: string;
}

function formatChange(changePercent: number): string {
  const rounded = Math.round(changePercent * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}

export function KpiCard({
  label,
  icon: Icon,
  status,
  value,
  changePercent,
  errorMessage = "No se pudo cargar",
  emptyMessage = "Sin datos",
}: KpiCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
          {label}
        </span>
        <div className="flex size-8 items-center justify-center rounded-full bg-gold-100 text-gold-700">
          <Icon className="size-4" aria-hidden />
        </div>
      </div>

      <div className="mt-3">
        {status === "loading" && (
          <div className="h-8 w-20 animate-pulse rounded bg-ink-100" aria-label="Cargando" />
        )}

        {status === "error" && (
          <div className="flex items-center gap-1.5 text-sm text-rose-600">
            <AlertTriangle className="size-4" aria-hidden />
            {errorMessage}
          </div>
        )}

        {status === "empty" && <p className="text-sm text-ink-400">{emptyMessage}</p>}

        {status === "ready" && (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-ink-900">{value}</span>
            {changePercent !== null && changePercent !== undefined && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-xs font-medium",
                  changePercent >= 0 ? "text-emerald-600" : "text-rose-600"
                )}
              >
                {changePercent >= 0 ? (
                  <TrendingUp className="size-3" aria-hidden />
                ) : (
                  <TrendingDown className="size-3" aria-hidden />
                )}
                {formatChange(changePercent)}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
