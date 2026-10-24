import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Sign-in surface. Deliberately quiet: one bordered panel, no illustration, no
 * gradient (style.md §1). The title is a page-scale heading, not a hero.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-line bg-surface", className)}>
      <div className="px-5 pb-4 pt-5">
        <h1 className="text-3xl text-ink">{title}</h1>
        {description ? (
          <div className="mt-1 text-sm leading-5 text-ink-muted">{description}</div>
        ) : null}
      </div>
      <div className="border-t border-line px-5 py-5">{children}</div>
      {footer ? (
        <div className="border-t border-line bg-surface-inset px-5 py-3 text-xs leading-4 text-ink-subtle">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
