import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DetailsPanel } from "@/components/conversaciones/inbox-client";

/**
 * Columna central (historial) + columna derecha (contexto). Debajo de xl el
 * contexto se abre como hoja con el botón de información.
 */
export function ChatPane({
  backHref,
  header,
  actions,
  footer,
  details,
  detailsTitle,
  children,
}: {
  backHref: string;
  header: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  details: React.ReactNode;
  detailsTitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-4">
      <section className="card flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" aria-label="Historial de la conversación">
        <div className="flex min-h-[72px] shrink-0 items-center gap-3 border-b border-ink-100 px-3 py-3 sm:px-5">
          <Link
            href={backHref}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 md:hidden"
            aria-label="Volver a la lista"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-3">{header}</div>
          <div className="flex shrink-0 items-center gap-1.5">
            {actions}
            <DetailsPanel title={detailsTitle}>{details}</DetailsPanel>
          </div>
        </div>

        {/* flex-col-reverse mantiene el scroll anclado al último mensaje sin JavaScript */}
        <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto scrollbar-thin">
          <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6">{children}</div>
        </div>

        {footer && <div className="shrink-0 border-t border-ink-100 bg-surface-muted px-3 py-3 sm:px-5">{footer}</div>}
      </section>

      <aside className="card hidden w-[340px] shrink-0 overflow-y-auto scrollbar-thin xl:block" aria-label={detailsTitle}>
        {details}
      </aside>
    </div>
  );
}
