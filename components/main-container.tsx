"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** La bandeja de conversaciones ocupa todo el alto y ancho; el resto de secciones usa el contenedor centrado. */
function isFullBleed(pathname: string): boolean {
  if (pathname === "/conversaciones") return true;
  if (!pathname.startsWith("/conversaciones/")) return false;
  return !pathname.startsWith("/conversaciones/simulador") && !pathname.startsWith("/conversaciones/ajustes");
}

export function MainContainer({ children }: { children: React.ReactNode }) {
  const fullBleed = isFullBleed(usePathname());
  return (
    <main
      className={cn(
        "w-full flex-1",
        fullBleed ? "h-[calc(100dvh-3.5rem)] overflow-hidden lg:h-dvh" : "mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
      )}
    >
      {children}
    </main>
  );
}
