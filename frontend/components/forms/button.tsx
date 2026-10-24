import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-accent-700 text-white hover:bg-accent-800 active:bg-accent-900",
  secondary:
    "border border-line-strong bg-surface text-ink hover:bg-slate-50 active:bg-slate-100",
  ghost: "border border-transparent bg-transparent text-ink-muted hover:bg-slate-100",
  danger:
    "border border-transparent bg-red-700 text-white hover:bg-red-800 active:bg-red-900",
  subtle:
    "border border-accent-200 bg-accent-50 text-accent-800 hover:bg-accent-100 active:bg-accent-200",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
  md: "gap-2 rounded-lg px-4 py-2 text-sm",
};

export function buttonClasses(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(
    "inline-flex items-center justify-center font-medium transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    loadingLabel = "Working",
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {loading ? <span className="sr-only">{loadingLabel}</span> : null}
      <span aria-hidden={loading || undefined} className={loading ? "opacity-80" : undefined}>
        {children}
      </span>
    </button>
  );
});
