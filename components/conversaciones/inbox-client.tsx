"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Info, Loader2, Search, UserSquare2, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { selectClass } from "@/components/ui/field";

type Tab = "clientes" | "asesores";

const tabKey = (tab: Tab) => `inova.inbox.last.${tab}`;
const scrollKey = (tab: Tab) => `inova.inbox.scroll.${tab}`;

function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // sin almacenamiento: las pestañas vuelven a su vista inicial
  }
}

/**
 * Pestañas Clientes / Asesores. Cada pestaña recuerda (en la sesión del
 * navegador) su última búsqueda, filtro y chat seleccionado.
 */
export function InboxTabs({ current }: { current: Tab }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const query = searchParams.toString();
    writeStorage(tabKey(current), `${pathname}${query ? `?${query}` : ""}`);
  }, [current, pathname, searchParams]);

  const tabs: { tab: Tab; label: string; icon: typeof Users; fallback: string }[] = [
    { tab: "clientes", label: "Clientes", icon: Users, fallback: "/conversaciones" },
    { tab: "asesores", label: "Asesores", icon: UserSquare2, fallback: "/conversaciones?tab=asesores" },
  ];

  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1" role="tablist" aria-label="Tipo de conversación">
      {tabs.map(({ tab, label, icon: Icon, fallback }) => {
        const active = tab === current;
        return (
          <Link
            key={tab}
            href={fallback}
            role="tab"
            aria-selected={active}
            onClick={(event) => {
              if (active) return;
              const remembered = readStorage(tabKey(tab));
              if (remembered) {
                event.preventDefault();
                router.push(remembered);
              }
            }}
            className={cn(
              "flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors duration-150",
              active ? "bg-accent-500 text-ink-950 shadow-sm" : "text-ink-600 hover:bg-surface hover:text-ink-900"
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

/** Conserva la posición de desplazamiento de la lista de cada pestaña. */
export function ScrollMemory({ tab, selectedId, children, className }: { tab: Tab; selectedId?: string; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const saved = Number(readStorage(scrollKey(tab)));
    if (Number.isFinite(saved) && saved > 0) element.scrollTop = saved;
    if (selectedId) {
      const selected = element.querySelector<HTMLElement>(`[data-chat-id="${CSS.escape(selectedId)}"]`);
      if (selected) {
        const top = selected.offsetTop - element.offsetTop;
        if (top < element.scrollTop || top + selected.offsetHeight > element.scrollTop + element.clientHeight) {
          element.scrollTop = Math.max(0, top - element.clientHeight / 3);
        }
      }
    }
  }, [tab, selectedId]);

  return (
    <div
      ref={ref}
      className={className}
      onScroll={(event) => writeStorage(scrollKey(tab), String(Math.round(event.currentTarget.scrollTop)))}
    >
      {children}
    </div>
  );
}

/** Búsqueda de la lista: actualiza ?q= sin perder la pestaña, el filtro ni el chat abierto. */
export function InboxSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative">
      {pending ? (
        <Loader2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-400" aria-hidden />
      ) : (
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
      )}
      <input
        type="search"
        aria-label={placeholder}
        defaultValue={searchParams.get("q") ?? ""}
        placeholder={placeholder}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          if (event.target.value) params.set("q", event.target.value);
          else params.delete("q");
          params.delete("page");
          startTransition(() => router.replace(`${pathname}?${params.toString()}`));
        }}
        className="h-10 w-full rounded-lg border border-ink-200 bg-surface pl-9 pr-3 text-sm text-ink-800 placeholder:text-ink-400 transition-colors duration-150 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
      />
    </div>
  );
}

/** Carpeta de la bandeja de clientes (requieren atención, IA activa, con errores…). */
export function FolderSelect({ options, value }: { options: { value: string; label: string; count?: number }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <select
      value={value}
      aria-label="Carpeta"
      disabled={pending}
      onChange={(event) => {
        const params = new URLSearchParams(searchParams.toString());
        if (event.target.value === "all") params.delete("f");
        else params.set("f", event.target.value);
        params.delete("page");
        startTransition(() => router.push(`${pathname}?${params.toString()}`));
      }}
      className={cn(selectClass, "h-10 font-medium")}
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

/** Refresca la vista cada cierto tiempo mientras la pestaña del navegador está visible. Solo lee datos del panel. */
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

/** Contexto del contacto como hoja deslizable cuando no cabe la tercera columna (debajo de xl). */
export function DetailsPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cerrar la hoja al cambiar de chat
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 xl:hidden"
        aria-label={`Ver ${title.toLowerCase()}`}
        aria-expanded={open}
      >
        <Info className="size-4" aria-hidden />
        <span className="hidden sm:inline">Contexto</span>
      </button>

      <div className={cn("fixed inset-0 z-50 xl:hidden", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
        <div className={cn("absolute inset-0 bg-ink-950/40 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            "absolute inset-y-0 right-0 flex w-full max-w-[24rem] flex-col bg-surface shadow-card-hover transition-transform duration-200 ease-out",
            open ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-ink-100 px-5">
            <p className="text-sm font-semibold text-ink-950">{title}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex size-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100"
              aria-label="Cerrar contexto"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {open && <div className="flex-1 overflow-y-auto scrollbar-thin">{children}</div>}
        </aside>
      </div>
    </>
  );
}
