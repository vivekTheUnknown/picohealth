"use client";

import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import type { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { Button } from "@/components/forms/button";

export interface ErrorStateProps {
  title?: string;
  error?: ApiError | null;
  message?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  actions?: ReactNode;
  className?: string;
}

/**
 * Failed request, explained without a stack trace. Body copy stays in normal
 * text colours and only the icon/title carry the danger tone, so a long
 * message remains readable (style.md §12).
 */
export function ErrorState({
  title = "This page could not be loaded",
  error = null,
  message,
  onRetry,
  retrying = false,
  actions,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn("rounded-md border border-danger/30 bg-danger-subtle/40 p-4", className)}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <div className="mt-1 text-xs leading-5 text-ink-muted">
            {message ?? error?.message ?? "The service did not return a usable response."}
          </div>
          {error ? (
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-ink-subtle">
              <div className="flex gap-1">
                <dt className="font-medium">Code</dt>
                <dd className="font-mono">{error.code}</dd>
              </div>
              {error.status ? (
                <div className="flex gap-1">
                  <dt className="font-medium">HTTP</dt>
                  <dd className="font-mono">{error.status}</dd>
                </div>
              ) : null}
              {error.requestId ? (
                <div className="flex gap-1">
                  <dt className="font-medium">Request</dt>
                  <dd className="font-mono">{error.requestId}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {error?.retryable ? (
            <p className="mt-2 text-2xs text-ink-subtle">
              This looks temporary. You can retry the request.
            </p>
          ) : null}
          {onRetry || actions ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {onRetry ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onRetry}
                  loading={retrying}
                  loadingLabel="Retrying"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Try again
                </Button>
              ) : null}
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
