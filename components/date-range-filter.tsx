"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Calendar, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DATE_RANGE_PRESETS, DATE_RANGE_PRESET_LABELS, type DateRangePreset } from "@/lib/reporting/date-range";

const PRESETS: { value: DateRangePreset; label: string }[] = DATE_RANGE_PRESETS.map((value) => ({
  value,
  label: DATE_RANGE_PRESET_LABELS[value],
}));

/**
 * Root cause of the "se traba" bug this replaces: the old version called
 * router.push() the instant "Rango personalizado" was clicked — before any
 * dates existed — which made the server throw on missing from/to with no
 * error boundary to catch it, and left the transition's `isPending` stuck
 * true (all buttons permanently disabled) since the navigation never
 * resolved cleanly. Fix: selecting "custom" only reveals the date inputs
 * locally; navigation happens once on "Aplicar", and only after validating
 * from <= to here so an invalid range never reaches the server as an
 * unhandled throw.
 */
export function DateRangeFilter({ current }: { current: DateRangePreset }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(current === "custom");
  const [customFrom, setCustomFrom] = useState(searchParams.get("from") ?? "");
  const [customTo, setCustomTo] = useState(searchParams.get("to") ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  function navigate(params: URLSearchParams) {
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function applyPreset(preset: DateRangePreset) {
    setValidationError(null);
    if (preset === "custom") {
      setShowCustom(true);
      return; // Wait for the user to pick dates and press "Aplicar" — never navigate on bare selection.
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
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Calendar className="size-4 shrink-0 text-ink-400" aria-hidden />
        <div className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-surface p-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => applyPreset(preset.value)}
              disabled={isPending}
              aria-pressed={current === preset.value}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                current === preset.value
                  ? "bg-ink-900 text-white"
                  : "text-ink-600 hover:bg-ink-100"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {isPending && (
          <span className="flex items-center gap-1.5 text-xs text-ink-500" role="status" aria-live="polite">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Actualizando…
          </span>
        )}
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-600">
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
              className="rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-700"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-600">
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
              className="rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-700"
            />
          </label>
          <button
            type="button"
            onClick={applyCustomRange}
            disabled={isPending}
            className="rounded-md bg-ink-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Aplicar
          </button>
        </div>
      )}

      {validationError && (
        <p className="text-xs font-medium text-rose-600" role="alert">
          {validationError}
        </p>
      )}
    </div>
  );
}
