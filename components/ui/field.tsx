import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-lg border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 transition-colors duration-150 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200 disabled:cursor-not-allowed disabled:bg-ink-50";

export const selectClass = cn(inputClass, "cursor-pointer");

/** Etiqueta visible + control + ayuda. */
export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="block text-xs font-medium text-ink-700">
        {label}
        {required && (
          <span className="ml-0.5 text-rose-600" aria-hidden>
            *
          </span>
        )}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-ink-500">{hint}</span>}
    </label>
  );
}

export function FormMessage({ error, success }: { error?: string | null; success?: string | null }) {
  if (error)
    return (
      <p className="text-xs font-medium text-rose-700" role="alert">
        {error}
      </p>
    );
  if (success)
    return (
      <p className="text-xs font-medium text-emerald-700" role="status">
        {success}
      </p>
    );
  return null;
}
