"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Calendar, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui/field";
import { buttonClass } from "@/components/ui/button";
import { DATE_RANGE_PRESETS, DATE_RANGE_PRESET_LABELS, type DateRangePreset } from "@/lib/reporting/date-range";

const PRESETS: { value: DateRangePreset; label: string }[] = DATE_RANGE_PRESETS.map((value) => ({
  value,
  label: DATE_RANGE_PRESET_LABELS[value],
}));

/**
 * Selector de periodo. Elegir "Rango personalizado" solo muestra las
 * fechas: se navega al pulsar "Aplicar" y tras validar desde <= hasta, para
 * que un rango incompleto nunca llegue al servidor (causa histórica de que
 * el panel "se trabara").
 */
export function DateRangeFilter({ current, rangeLabel }: { current: DateRangePreset; rangeLabel?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(current === "custom");
  const [customFrom, setCustomFrom] = useState(searchParams.get("from") ?? "");
  const [customTo, setCustomTo] = useState(searchParams.get("to") ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  function navigate(params: URLSearchParams) {
    params.delete("page");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function applyPreset(preset: DateRangePreset) {
    setValidationError(null);
    if (preset === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", preset);
    params.delete("from");
    params.delete("to");
    navigate(params);
  }

  function applyCustomRange() {
    if (!customFrom || !customTo) {
      setValidationError("Selecciona una fecha inicial y una fecha final.");
      return;
    }
    if (customFrom > customTo) {
      setValidationError("La fecha inicial debe ser anterior o igual a la fecha final.");
      return;
    }
    setValidationError(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", "custom");
    params.set("from", customFrom);
    params.set("to", customTo);
    navigate(params);
  }

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <div className="relative">
        <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
        {isPending ? (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-400" aria-hidden />
        ) : (
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" aria-hidden />
        )}
        <select
          aria-label="Periodo"
          value={showCustom ? "custom" : current}
          disabled={isPending}
          onChange={(e) => applyPreset(e.target.value as DateRangePreset)}
          className="h-10 w-full min-w-48 cursor-pointer appearance-none rounded-lg border border-ink-200 bg-surface pl-9 pr-9 text-sm font-medium text-ink-800 shadow-sm transition-colors duration-150 hover:border-ink-300 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200 disabled:opacity-60"
        >
          {PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>
      {rangeLabel && !showCustom && <p className="text-xs text-ink-500 sm:text-right">{rangeLabel}</p>}

      {showCustom && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs font-medium text-ink-600">
            Desde
            <input
              type="date"
              value={customFrom}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                setValidationError(null);
              }}
              max={customTo || undefined}
              disabled={isPending}
              className={cn(inputClass, "h-9 py-1")}
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-ink-600">
            Hasta
            <input
              type="date"
              value={customTo}
              onChange={(e) => {
                setCustomTo(e.target.value);
                setValidationError(null);
              }}
              min={customFrom || undefined}
              disabled={isPending}
              className={cn(inputClass, "h-9 py-1")}
            />
          </label>
          <button type="button" onClick={applyCustomRange} disabled={isPending} className={buttonClass("primary", "sm")}>
            Aplicar
          </button>
        </div>
      )}

      {validationError && (
        <p className="text-xs font-medium text-rose-700" role="alert">
          {validationError}
        </p>
      )}
    </div>
  );
}
