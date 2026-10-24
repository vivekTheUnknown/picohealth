import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

/**
 * Concise empty state (style.md §12). No illustration, no oversized circle —
 * an empty region should read as a quiet absence of data, not a hero moment.
 */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-6" : "px-4 py-8",
        className,
      )}
    >
      <Icon className="h-5 w-5 text-ink-subtle" aria-hidden="true" />
      <h3 className="mt-2 text-sm font-medium text-ink">{title}</h3>
      {description ? (
        <div className="mt-1 max-w-md text-xs leading-4 text-ink-subtle">{description}</div>
      ) : null}
      {action ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
