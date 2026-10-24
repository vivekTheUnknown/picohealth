import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * style.md §7. Heights are fixed, not padding-derived, so toolbar and form
 * buttons line up with adjacent inputs:
 *   sm — 32px, compact toolbars
 *   md — 38px, standard forms (spec: 36–40px)
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex select-none items-center justify-center whitespace-nowrap font-medium " +
  "transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-55";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent",
  secondary:
    "border border-line-control bg-surface text-ink hover:bg-surface-raised active:bg-surface-active",
  ghost:
    "border border-transparent bg-transparent text-ink-muted hover:bg-surface-active hover:text-ink",
  danger:
    "border border-transparent bg-danger text-danger-fg hover:bg-danger/90 active:bg-danger/80",
  subtle:
    "border border-accent/25 bg-accent-subtle text-accent hover:bg-accent/15 active:bg-accent/20",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-md px-2.5 text-xs",
  md: "h-[38px] gap-2 rounded-md px-3.5 text-sm",
};

export function buttonClasses(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
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
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
      {loading ? <span className="sr-only">{loadingLabel}</span> : null}
      <span aria-hidden={loading || undefined} className={loading ? "opacity-80" : undefined}>
        {children}
      </span>
    </button>
  );
});

/** A button-styled link, for navigation actions that are not form submits. */
export function buttonLinkClasses(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return buttonClasses(variant, size, cn("no-underline", className));
}
