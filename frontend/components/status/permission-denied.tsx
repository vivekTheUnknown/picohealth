import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";

import { cn } from "@/lib/cn";
import { buttonClasses } from "@/components/forms/button";

export interface PermissionDeniedProps {
  title?: string;
  description?: ReactNode;
  detail?: string | null;
  actions?: ReactNode;
  className?: string;
}

/**
 * Shown when the API answers 403. The portal never treats a hidden nav item as
 * authorization; this state is driven by the server's response.
 */
export function PermissionDenied({
  title = "Access restricted",
  description = "Your account does not have permission to view this record or perform this action.",
  detail,
  actions,
  className,
}: PermissionDeniedProps) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-md border border-warning/30 bg-warning-subtle/30 p-4",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <div className="mt-1 max-w-2xl text-xs leading-5 text-ink-muted">{description}</div>
          {detail ? (
            <p className="mt-2 rounded-sm border border-warning/20 bg-warning-subtle/50 px-2 py-1 text-2xs text-ink-muted">
              Server response: {detail}
            </p>
          ) : null}
          <p className="mt-2 text-2xs leading-4 text-ink-subtle">
            Access is enforced by the API. If this is unexpected, contact an administrator to
            review your role or patient assignment.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {actions ?? (
              <Link href="/overview" className={buttonClasses("secondary", "sm")}>
                Back to clinical overview
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
