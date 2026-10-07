import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export type BadgeTone = "neutral" | "gold" | "success" | "warning" | "danger" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  gold: "bg-accent-100 text-accent-800",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100",
  warning: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100",
  danger: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-100",
  info: "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100",
};

const DOTS: Record<BadgeTone, string> = {
  neutral: "bg-ink-400",
  gold: "bg-accent-600",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-sky-500",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[tone], className)}
      {...props}
    >
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full", DOTS[tone])} aria-hidden />}
      {children}
    </span>
  );
}
