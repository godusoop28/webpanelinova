import type { ReactNode } from "react";

/** Título de sección + descripción + acciones. El breadcrumb lo pone el layout. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950 sm:text-[28px] sm:leading-9">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-start gap-2">{actions}</div>}
    </div>
  );
}
