import type { IntegrationNotice } from "@/lib/integration-notice";
import { cn } from "@/lib/utils";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const TONE_TEXT = { danger: "text-rose-700", warning: "text-amber-800" } as const;

/**
 * Resumen claro del estado de una acción de integración, con el detalle
 * desplegable (sin JavaScript: <details>). Nunca muestra payload ni tokens.
 */
export function IntegrationNoticeDetails({ notice, className, compact = false }: { notice: IntegrationNotice; className?: string; compact?: boolean }) {
  return (
    <details className={cn("group text-[11px]", TONE_TEXT[notice.tone], className)}>
      <summary className="cursor-pointer list-none font-medium underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
        {notice.title}
        <span className="ml-1 text-ink-400 group-open:hidden">· ver detalle</span>
      </summary>
      <dl className={cn("mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 rounded-md bg-surface-muted p-2 text-ink-700", compact ? "max-w-64" : "max-w-xl text-xs")}>
        <dt className="text-ink-500">Acción</dt>
        <dd>{notice.action}</dd>
        <dt className="text-ink-500">Destino</dt>
        <dd>{notice.target}</dd>
        <dt className="text-ink-500">Último intento</dt>
        <dd>{formatDateTime(notice.lastAttemptAt)}</dd>
        <dt className="text-ink-500">Intentos</dt>
        <dd>{notice.attempts}</dd>
        <dt className="text-ink-500">Motivo</dt>
        <dd className="break-words">{notice.reason}</dd>
        <dt className="text-ink-500">Código</dt>
        <dd>{notice.code ?? "—"}</dd>
        {notice.nextRetryAt && (
          <>
            <dt className="text-ink-500">Próximo intento</dt>
            <dd>{formatDateTime(notice.nextRetryAt)}</dd>
          </>
        )}
      </dl>
    </details>
  );
}
