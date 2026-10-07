import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  const pages = [...new Set([1, totalPages, page - 1, page, page + 1])].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

const ITEM = "flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm transition-colors duration-150";

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  href,
  noun = "resultados",
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
  noun?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="flex flex-col items-center justify-between gap-3 border-t border-ink-100 px-5 py-4 sm:flex-row" aria-label="Paginación">
      <p className="text-sm text-ink-500">
        Mostrando {from}–{to} de {total} {noun}
      </p>
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {page > 1 ? (
            <Link href={href(page - 1)} className={cn(ITEM, "border-ink-200 text-ink-600 hover:bg-ink-50")} aria-label="Página anterior">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          ) : (
            <span className={cn(ITEM, "border-ink-100 text-ink-300")} aria-hidden>
              <ChevronLeft className="size-4" />
            </span>
          )}
          {pageWindow(page, totalPages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-ink-400" aria-hidden>
                …
              </span>
            ) : (
              <Link
                key={p}
                href={href(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Página ${p}`}
                className={cn(ITEM, p === page ? "border-accent-500 bg-accent-500 font-semibold text-ink-950" : "border-ink-200 text-ink-700 hover:bg-ink-50")}
              >
                {p}
              </Link>
            )
          )}
          {page < totalPages ? (
            <Link href={href(page + 1)} className={cn(ITEM, "border-ink-200 text-ink-600 hover:bg-ink-50")} aria-label="Página siguiente">
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span className={cn(ITEM, "border-ink-100 text-ink-300")} aria-hidden>
              <ChevronRight className="size-4" />
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
