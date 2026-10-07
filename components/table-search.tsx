"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { selectClass } from "@/components/ui/field";

/** Búsqueda que actualiza ?q= (u otra clave) conservando el resto de filtros y volviendo a la página 1. */
export function TableSearch({ placeholder, param = "q", className, label }: { placeholder: string; param?: string; className?: string; label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <div className={cn("relative w-full sm:max-w-xs", className)}>
      {pending ? (
        <Loader2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-400" aria-hidden />
      ) : (
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
      )}
      <input
        type="search"
        aria-label={label ?? placeholder}
        defaultValue={searchParams.get(param) ?? ""}
        placeholder={placeholder}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          if (e.target.value) params.set(param, e.target.value);
          else params.delete(param);
          params.delete("page");
          startTransition(() => {
            router.replace(`${pathname}?${params.toString()}`);
          });
        }}
        className="h-10 w-full rounded-lg border border-ink-200 bg-surface pl-9 pr-3 text-sm text-ink-800 placeholder:text-ink-400 transition-colors duration-150 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
      />
    </div>
  );
}

/** Selector de filtro que escribe en la URL (y vuelve a la página 1). */
export function UrlSelect({
  param,
  label,
  options,
  allLabel,
  className,
  showLabel = true,
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel: string;
  className?: string;
  showLabel?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <label className={cn("block min-w-0 space-y-1.5", className)}>
      <span className={cn("block text-xs font-medium text-ink-600", !showLabel && "sr-only")}>{label}</span>
      <select
        value={searchParams.get(param) ?? ""}
        disabled={pending}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          if (e.target.value) params.set(param, e.target.value);
          else params.delete(param);
          params.delete("page");
          startTransition(() => router.replace(`${pathname}?${params.toString()}`));
        }}
        className={cn(selectClass, "h-10")}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
