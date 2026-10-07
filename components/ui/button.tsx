import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "dark" | "secondary" | "ghost" | "danger" | "danger-ghost";
type Size = "sm" | "md" | "icon";

/** Dorado con texto oscuro (contraste AA); nunca texto blanco sobre dorado. */
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent-500 text-ink-950 shadow-sm hover:bg-accent-400",
  dark: "bg-ink-900 text-white shadow-sm hover:bg-ink-800",
  secondary: "bg-surface text-ink-800 border border-ink-200 shadow-sm hover:bg-ink-50 hover:border-ink-300",
  ghost: "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
  "danger-ghost": "text-rose-700 hover:bg-rose-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  icon: "size-9",
};

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60";

/** Mismas clases para enlaces con aspecto de botón. */
export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
