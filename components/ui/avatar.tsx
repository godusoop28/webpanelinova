import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "bg-accent-100 text-accent-800",
  "bg-sky-50 text-sky-700",
  "bg-emerald-50 text-emerald-700",
  "bg-rose-50 text-rose-700",
  "bg-violet-50 text-violet-700",
  "bg-amber-50 text-amber-800",
  "bg-teal-50 text-teal-700",
  "bg-orange-50 text-orange-700",
];

export function initialsOf(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2) || "?").toUpperCase();
}

/** Iniciales con color estable por nombre (el sistema no guarda fotos de contactos). */
export function Avatar({ name, className }: { name: string; className?: string }) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 select-none items-center justify-center rounded-full text-sm font-semibold",
        AVATAR_COLORS[hash % AVATAR_COLORS.length],
        className
      )}
      aria-hidden
    >
      {initialsOf(name)}
    </div>
  );
}
