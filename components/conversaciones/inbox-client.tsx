"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Info, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Búsqueda de la lista de chats: actualiza ?q= sin perder el resto de filtros. */
export function InboxSearch({ placeholder, basePath }: { placeholder: string; basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative">
      <Search
        className={cn("pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400", pending && "animate-pulse")}
        aria-hidden
      />
      <input
        type="search"
        defaultValue={searchParams.get("q") ?? ""}
        placeholder={placeholder}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          if (event.target.value) params.set("q", event.target.value);
          else params.delete("q");
          params.delete("page");
          startTransition(() => router.replace(`${basePath}?${params.toString()}`));
        }}
        className="w-full rounded-lg border border-transparent bg-ink-100 py-2 pl-9 pr-3 text-sm text-ink-800 placeholder:text-ink-400 transition-colors focus:border-accent-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent-100"
      />
    </div>
  );
}

/** Selector de carpeta (como el desplegable "All / Unassigned" de ManyChat). */
export function FolderSelect({
  options,
  value,
  basePath,
}: {
  options: { value: string; label: string; count?: number }[];
  value: string;
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  return (
    <select
      value={value}
      aria-label="Carpeta"
      onChange={(event) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("f", event.target.value);
        params.delete("page");
        startTransition(() => router.push(`${basePath}?${params.toString()}`));
      }}
      className="w-full cursor-pointer rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 text-sm font-medium text-ink-800 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
          {option.count ? ` (${option.count})` : ""}
        </option>
      ))}
    </select>
  );
}

/** Refresca la vista cada cierto tiempo mientras la pestaña está visible (la bandeja se mantiene "en vivo"). */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}

/**
 * Panel de detalles del contacto: fijo a la derecha en pantallas anchas y
 * como cajón deslizable en pantallas medianas/móvil.
 */
export function DetailsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cerrar el cajón al cambiar de chat
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex size-9 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 xl:hidden"
        aria-label="Ver detalles"
        title="Detalles"
      >
        <Info className="size-5" aria-hidden />
      </button>

      <div className={cn("fixed inset-0 z-50 xl:hidden", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
        <div className={cn("absolute inset-0 bg-ink-950/30 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <aside
          className={cn(
            "absolute inset-y-0 right-0 flex w-[22rem] max-w-[92vw] flex-col bg-surface shadow-card-hover transition-transform duration-300 ease-out",
            open ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink-200 px-5">
            <p className="text-sm font-semibold text-ink-900">{title}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex size-8 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
              aria-label="Cerrar detalles"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">{children}</div>
        </aside>
      </div>
    </>
  );
}
