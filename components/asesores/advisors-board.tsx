"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AdvisorRow, availabilityOf, type Availability } from "@/components/asesores/advisor-row";
import { EmptyState } from "@/components/ui/state";
import { selectClass } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { AdvisorView } from "@/lib/types";

const FILTERS: { value: "all" | Availability; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "available", label: "Disponibles" },
  { value: "paused", label: "En pausa" },
  { value: "inactive", label: "Inactivos" },
];

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Búsqueda y filtro locales sobre la lista ya cargada (no consulta servicios externos). */
export function AdvisorsBoard({ advisors, leadsHoy }: { advisors: AdvisorView[]; leadsHoy: Record<string, number> }) {
  const [query, setQuery] = useState("");
  const [availability, setAvailability] = useState<"all" | Availability>("all");

  const visible = useMemo(() => {
    const now = new Date();
    const q = normalize(query.trim());
    return advisors.filter((advisor) => {
      if (availability !== "all" && availabilityOf(advisor, now) !== availability) return false;
      if (!q) return true;
      return [advisor.nombre, advisor.whatsapp, advisor.emailEasyBroker, advisor.manyChatId].some((value) => normalize(value ?? "").includes(q));
    });
  }, [advisors, query, availability]);

  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar asesor por nombre, email o teléfono…"
            aria-label="Buscar asesor"
            className="h-10 w-full rounded-lg border border-ink-200 bg-surface pl-9 pr-3 text-sm text-ink-800 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-600">
          Disponibilidad
          <select value={availability} onChange={(event) => setAvailability(event.target.value as typeof availability)} className={cn(selectClass, "h-10 w-40")}>
            {FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-ink-500 sm:ml-auto" aria-live="polite">
          {visible.length} de {advisors.length}
        </p>
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Sin resultados" description="Ningún asesor coincide con la búsqueda o el filtro." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((advisor) => (
            <AdvisorRow key={advisor.id} advisor={advisor} leadsHoy={leadsHoy[advisor.id] ?? 0} />
          ))}
        </div>
      )}
    </div>
  );
}
