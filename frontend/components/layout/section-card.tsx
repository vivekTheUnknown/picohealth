import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface SectionCardProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Render the body flush, so a table can own its own padding. */
  flush?: boolean;
  id?: string;
}

/**
 * A bordered panel with a compact header.
 *
 * style.md §4 asks for bordered sections over card grids and warns against
 * nesting card-on-card. This is the only surface component; when the body is a
 * table it is rendered flush so rows meet the panel edge.
 */
export function SectionCard({
  title,
  description,
  actions,
  children,
  footer,
  className,
  bodyClassName,
  flush = false,
  id,
}: SectionCardProps) {
  return (
    <section id={id} className={cn("overflow-hidden rounded-lg border border-line bg-surface", className)}>
      {title || description || actions ? (
        <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="text-lg text-ink">{title}</h2> : null}
            {description ? (
              <p className="mt-0.5 text-xs leading-4 text-ink-subtle">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn(flush ? "" : "p-4", bodyClassName)}>{children}</div>
      {footer ? (
        <div className="border-t border-line bg-surface-inset px-4 py-2.5 text-xs text-ink-subtle">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
