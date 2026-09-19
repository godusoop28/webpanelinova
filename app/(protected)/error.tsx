"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Safety net for the whole protected panel. Before this existed, an
 * unhandled throw during render (e.g. an invalid date range reaching a
 * server component) crashed to Next's default error UI with no way back —
 * which is what made the custom-range bug look like the panel "se traba":
 * the client-side transition never resolved, so nav buttons stayed
 * disabled. Every page-level date range error is now caught locally
 * (see resolveDateRange/InvalidDateRangeError) before it gets here; this
 * boundary only catches what's left.
 */
export default function ProtectedError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[panel] Error no controlado:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-6 py-16 text-center">
      <AlertTriangle className="size-8 text-rose-500" aria-hidden />
      <p className="text-sm font-medium text-rose-700">Ocurrió un error inesperado.</p>
      <p className="max-w-sm text-xs text-rose-600">
        {error.message || "Intenta de nuevo. Si el problema continúa, contacta a soporte."}
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-lg bg-ink-900 px-4 py-2 text-xs font-medium text-white hover:bg-ink-800"
      >
        Reintentar
      </button>
    </div>
  );
}
