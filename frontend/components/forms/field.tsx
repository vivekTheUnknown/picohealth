import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface FieldProps {
  id: string;
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  /** Extra content rendered to the right of the label (e.g. "Optional"). */
  aside?: ReactNode;
}

export function fieldIds(id: string): {
  hint: string;
  error: string;
  describedBy: string | undefined;
} {
  return {
    hint: `${id}-hint`,
    error: `${id}-error`,
    describedBy: `${id}-hint`,
  };
}

/**
 * Persistent, visible label plus hint and inline error (style.md §7: a
 * placeholder is never a label). Wires both hint and error into
 * `aria-describedby` so screen readers get the same context a sighted user does.
 */
export function Field({
  id,
  label,
  children,
  hint,
  error,
  required = false,
  className,
  aside,
}: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs font-medium text-ink-muted">
          {label}
          {required ? (
            <>
              <span aria-hidden="true" className="ml-0.5 text-danger">
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          ) : null}
        </label>
        {aside ? <span className="text-2xs text-ink-subtle">{aside}</span> : null}
      </div>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs leading-4 text-ink-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium leading-4 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
