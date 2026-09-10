"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DateRangePreset } from "@/lib/metrics";

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "this_week", label: "Esta semana" },
  { value: "last_week", label: "Semana anterior" },
  { value: "last_30_days", label: "Últimos 30 días" },
  { value: "this_month", label: "Este mes" },
  { value: "custom", label: "Rango personalizado" },
];

export function DateRangeFilter({ current }: { current: DateRangePreset }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [customFrom, setCustomFrom] = useState(searchParams.get("from") ?? "");
  const [customTo, setCustomTo] = useState(searchParams.get("to") ?? "");

  function applyPreset(preset: DateRangePreset) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", preset);
    if (preset !== "custom") {
      params.delete("from");
      params.delete("to");
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  function applyCustomRange() {
    if (!customFrom || !customTo) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", "custom");
    params.set("from", customFrom);
    params.set("to", customTo);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Calendar className="size-4 text-ink-400" aria-hidden />
      <div className="flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-surface p-1">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => applyPreset(preset.value)}
            disabled={isPending}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              current === preset.value
                ? "bg-ink-900 text-white"
                : "text-ink-600 hover:bg-ink-100"
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {current === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-700"
          />
          <span className="text-xs text-ink-500">a</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-md border border-ink-200 px-2 py-1.5 text-xs text-ink-700"
          />
          <button
            type="button"
            onClick={applyCustomRange}
            className="rounded-md bg-ink-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-800"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
