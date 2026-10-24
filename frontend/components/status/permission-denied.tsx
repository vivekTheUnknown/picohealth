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
        "rounded-xl border border-amber-200 bg-amber-50/60 p-6 sm:p-8",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800">
          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-amber-950">{title}</h2>
          <div className="mt-1 max-w-2xl text-sm leading-6 text-amber-900/90">{description}</div>
          {detail ? (
            <p className="mt-2 rounded-md bg-amber-100/70 px-2.5 py-1.5 text-xs text-amber-900">
              Server response: {detail}
            </p>
          ) : null}
          <p className="mt-2 text-xs leading-5 text-amber-900/70">
            Access is enforced by the API. If this is unexpected, contact an administrator to
            review your role or patient assignment.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
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
