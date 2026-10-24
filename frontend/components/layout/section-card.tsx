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
  id?: string;
}

export function SectionCard({
  title,
  description,
  actions,
  children,
  footer,
  className,
  bodyClassName,
  id,
}: SectionCardProps) {
  return (
    <section
      id={id}
      className={cn("overflow-hidden rounded-xl border border-line bg-surface shadow-card", className)}
    >
      {title || description || actions ? (
        <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold text-ink">{title}</h2> : null}
            {description ? (
              <p className="mt-0.5 text-xs leading-5 text-ink-subtle">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
      {footer ? (
        <div className="border-t border-line bg-slate-50/70 px-4 py-3 sm:px-5">{footer}</div>
      ) : null}
    </section>
  );
}
