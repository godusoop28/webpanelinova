"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Search } from "lucide-react";
import { ALL_CANONICAL_ROUTES, ROUTE_LABELS } from "@/lib/reporting/report-aggregation";
import { LEAD_STATUS_LABELS } from "@/lib/lead-status";

export interface AdvisorOption {
  id: string;
  name: string;
}

/**
 * Filters for the period's lead detail table (ruta/asesor/estado/origen +
 * búsqueda). Preserves the date-range params (range/from/to) and resets
 * `page` to 1 on every change — a stale page number past the new filtered
 * total would otherwise render an empty page instead of results.
 */
export function LeadFilters({ advisors, origins }: { advisors: AdvisorOption[]; origins: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
        <input
          type="search"
          defaultValue={searchParams.get("q") ?? ""}
          placeholder="Buscar por nombre o teléfono…"
          onChange={(e) => update("q", e.target.value)}
          className="w-full rounded-lg border border-ink-200 bg-surface py-2 pl-9 pr-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-gold-400"
        />
      </div>

      <select
        defaultValue={searchParams.get("ruta") ?? ""}
        onChange={(e) => update("ruta", e.target.value)}
        className="rounded-lg border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-700"
      >
        <option value="">Todas las rutas</option>
        {ALL_CANONICAL_ROUTES.map((route) => (
          <option key={route} value={route}>
            {ROUTE_LABELS[route]}
          </option>
        ))}
      </select>

      <select
        defaultValue={searchParams.get("asesor") ?? ""}
        onChange={(e) => update("asesor", e.target.value)}
        className="rounded-lg border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-700"
      >
        <option value="">Todos los asesores</option>
        {advisors.map((advisor) => (
          <option key={advisor.id} value={advisor.id}>
            {advisor.name}
          </option>
        ))}
      </select>

      <select
        defaultValue={searchParams.get("estado") ?? ""}
        onChange={(e) => update("estado", e.target.value)}
        className="rounded-lg border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-700"
      >
        <option value="">Todos los estados</option>
        {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {origins.length > 0 && (
        <select
          defaultValue={searchParams.get("origen") ?? ""}
          onChange={(e) => update("origen", e.target.value)}
          className="rounded-lg border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-700"
        >
          <option value="">Todos los orígenes</option>
          {origins.map((origin) => (
            <option key={origin} value={origin}>
              {origin}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
