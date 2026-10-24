import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

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
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-surface shadow-card",
        className,
      )}
    >
      <div className="border-b border-line px-6 pb-4 pt-6">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? (
          <div className="mt-1 text-sm leading-6 text-ink-muted">{description}</div>
        ) : null}
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer ? (
        <div className="border-t border-line bg-slate-50/70 px-6 py-3 text-xs leading-5 text-ink-subtle">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
