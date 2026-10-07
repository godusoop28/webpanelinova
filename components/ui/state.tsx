import { cn } from "@/lib/utils";
import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-200 bg-surface-muted px-6 py-12 text-center",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <Icon className="size-6" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-ink-800">{title}</p>
      {description && <p className="max-w-sm text-xs text-ink-500">{description}</p>}
      {action}
    </div>
  );
}

/** Error recuperable: explica qué falló; la recarga de la página reintenta la consulta. */
export function ErrorState({
  title = "Ocurrió un error",
  description,
  className,
}: {
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-6 py-12 text-center", className)}
    >
      <AlertTriangle className="size-8 text-rose-500" aria-hidden />
      <p className="text-sm font-semibold text-rose-800">{title}</p>
      {description && <p className="max-w-md text-xs text-rose-700">{description}</p>}
      <p className="text-xs text-rose-700">Recarga la página para intentarlo de nuevo.</p>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <div key={colIndex} className="h-4 flex-1 animate-pulse rounded bg-ink-100" style={{ animationDelay: `${(rowIndex + colIndex) * 40}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Esqueleto genérico de página: encabezado, tarjetas y tabla. */
export function PageSkeleton({ cards = 4, rows = 8 }: { cards?: number; rows?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 animate-pulse rounded-lg bg-ink-100" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-ink-100" />
        </div>
        <div className="h-10 w-48 animate-pulse rounded-lg bg-ink-100" />
      </div>
      {cards > 0 && (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="card h-24 animate-pulse" />
          ))}
        </div>
      )}
      <div className="card p-5">
        <TableSkeleton rows={rows} cols={5} />
      </div>
    </div>
  );
}
