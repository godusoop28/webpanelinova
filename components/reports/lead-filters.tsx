"use client";

import { TableSearch, UrlSelect } from "@/components/table-search";
import { ALL_CANONICAL_ROUTES, ROUTE_LABELS } from "@/lib/reporting/report-aggregation";
import { LEAD_STATUS_LABELS, PENDING_STATUS_FILTER, PENDING_STATUS_FILTER_LABEL } from "@/lib/lead-status";

export interface AdvisorOption {
  id: string;
  name: string;
}

/**
 * Filtros globales de /reportes (ruta/origen/asesor): afectan indicadores,
 * distribuciones, detalle y exportaciones. Conservan range/from/to y
 * vuelven a la página 1 en cada cambio.
 */
export function ReportFilters({ advisors, origins }: { advisors: AdvisorOption[]; origins: string[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <UrlSelect
        param="ruta"
        label="Ruta"
        allLabel="Todas las rutas"
        options={ALL_CANONICAL_ROUTES.map((route) => ({ value: route, label: ROUTE_LABELS[route] }))}
      />
      <UrlSelect param="origen" label="Origen" allLabel="Todos los orígenes" options={origins.map((origin) => ({ value: origin, label: origin }))} />
      <UrlSelect param="asesor" label="Asesor" allLabel="Todos los asesores" options={advisors.map((advisor) => ({ value: advisor.id, label: advisor.name }))} />
    </div>
  );
}

/** Filtros propios del detalle de leads: búsqueda y estado. */
export function LeadDetailFilters() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <TableSearch placeholder="Buscar por nombre o teléfono…" className="sm:max-w-sm" />
      <UrlSelect
        param="estado"
        label="Estado"
        showLabel={false}
        allLabel="Todos los estados"
        className="sm:w-56"
        options={[{ value: PENDING_STATUS_FILTER, label: PENDING_STATUS_FILTER_LABEL }, ...Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label }))]}
      />
    </div>
  );
}
