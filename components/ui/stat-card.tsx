import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type StatTone = "gold" | "success" | "warning" | "danger" | "info" | "neutral";

const ICON_TONES: Record<StatTone, string> = {
  gold: "bg-accent-100 text-accent-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-600",
  info: "bg-sky-50 text-sky-700",
  neutral: "bg-ink-100 text-ink-600",
};

const PILL_TONES: Record<StatTone, string> = {
  gold: "bg-accent-100 text-accent-800",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-rose-50 text-rose-700",
  info: "bg-sky-50 text-sky-700",
  neutral: "bg-ink-100 text-ink-700",
};

/**
 * Indicador con icono en burbuja. `hint` es texto secundario calculado con
 * datos reales (p. ej. "88 % del total"); nunca una tendencia inventada.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "gold",
  hint,
  href,
  size = "lg",
  highlight = false,
  className,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: StatTone;
  hint?: ReactNode;
  href?: string;
  size?: "lg" | "sm";
  highlight?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <div className={cn("flex shrink-0 items-center justify-center rounded-full", ICON_TONES[tone], size === "lg" ? "size-12" : "size-10")}>
        <Icon className={size === "lg" ? "size-5" : "size-[18px]"} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink-600">{label}</p>
        <p className={cn("font-semibold tracking-tight text-ink-950 tabular-nums", size === "lg" ? "mt-0.5 text-[28px] leading-9" : "text-xl leading-7")}>
          {value}
        </p>
        {hint && <div className="mt-1 text-xs text-ink-500">{hint}</div>}
      </div>
      {href && <ChevronRight className="size-4 shrink-0 text-ink-400 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />}
    </>
  );
  const classes = cn(
    "card flex items-center gap-4",
    size === "lg" ? "p-5" : "px-5 py-4",
    highlight && tone === "warning" && "border-amber-200 bg-amber-50/50",
    highlight && tone === "danger" && "border-rose-200 bg-rose-50/50",
    highlight && tone === "success" && "border-emerald-200 bg-emerald-50/40",
    className
  );
  if (href) {
    return (
      <Link href={href} className={cn(classes, "group transition-shadow duration-150 hover:shadow-card-hover")}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}

/** Píldora de porcentaje calculado sobre el total real. */
export function PercentPill({ value, tone = "neutral" }: { value: number; tone?: StatTone }) {
  return <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", PILL_TONES[tone])}>{value}%</span>;
}
