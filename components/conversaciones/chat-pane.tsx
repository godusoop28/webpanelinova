import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DetailsPanel } from "@/components/conversaciones/inbox-client";

/**
 * Columna de chat estilo ManyChat Live Chat: encabezado del contacto,
 * mensajes anclados abajo, compositor al pie y detalles a la derecha.
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
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-ink-200 bg-surface px-3 sm:px-4">
          <Link
            href={backHref}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 md:hidden"
            aria-label="Volver a la lista"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-3">{header}</div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <DetailsPanel title={detailsTitle}>{details}</DetailsPanel>
          </div>
        </div>

        {/* flex-col-reverse mantiene el scroll anclado al último mensaje sin JavaScript */}
        <div className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto bg-ink-50 scrollbar-thin">
          <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6">{children}</div>
        </div>

        {footer && <div className="shrink-0 border-t border-ink-200 bg-surface px-3 py-3 sm:px-4">{footer}</div>}
      </div>

      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-ink-200 bg-surface scrollbar-thin xl:block">{details}</aside>
    </div>
  );
}
