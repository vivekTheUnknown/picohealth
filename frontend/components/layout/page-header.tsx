import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface Crumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  meta?: ReactNode;
  className?: string;
}

/**
 * Page title is 22px (style.md §3: 20–24px), section titles 15–16px. The
 * header is deliberately compact rather than a hero block.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-2.5", className)}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumbs">
          <ol className="flex flex-wrap items-center gap-1.5 text-xs text-ink-subtle">
            {breadcrumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                {index > 0 ? (
                  <span aria-hidden="true" className="text-ink-subtle">
                    /
                  </span>
                ) : null}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="rounded-sm transition-colors duration-fast hover:text-ink"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-ink-muted">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl text-ink">{title}</h1>
          {description ? (
            <div className="mt-1 max-w-3xl text-sm leading-5 text-ink-muted">{description}</div>
          ) : null}
          {meta ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-subtle">
              {meta}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
