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
      <Icon className="size-8 text-ink-400" aria-hidden />
      <p className="text-sm font-medium text-ink-700">{title}</p>
      {description && <p className="max-w-sm text-xs text-ink-500">{description}</p>}
      {action}
    </div>
  );
}

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
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-6 py-12 text-center",
        className
      )}
    >
      <AlertTriangle className="size-8 text-rose-500" aria-hidden />
      <p className="text-sm font-medium text-rose-700">{title}</p>
      {description && <p className="max-w-sm text-xs text-rose-600">{description}</p>}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <div
              key={colIndex}
              className="h-4 flex-1 animate-pulse rounded bg-ink-100"
              style={{ animationDelay: `${(rowIndex + colIndex) * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
