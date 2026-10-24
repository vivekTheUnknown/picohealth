import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * The one badge geometry in the system.
 *
 * Every badge is text + icon + colour. Colour alone never carries meaning
 * (style.md §9, §13), so a badge without a label is not permitted.
 */
export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface-active text-ink-muted",
  accent: "border-accent/30 bg-accent-subtle text-accent",
  success: "border-success/30 bg-success-subtle text-success",
  warning: "border-warning/30 bg-warning-subtle text-warning",
  danger: "border-danger/30 bg-danger-subtle text-danger",
  info: "border-info/30 bg-info-subtle text-info",
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: React.ReactNode;
  size?: "sm" | "md";
  title?: string;
  className?: string;
}

export function Badge({ tone = "neutral", icon: Icon, children, size = "md", title, className }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-sm border font-medium",
        size === "sm" ? "h-5 px-1.5 text-2xs" : "h-6 px-2 text-xs",
        BADGE_TONE[tone],
        className,
      )}
    >
      {Icon ? (
        <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </span>
  );
}
