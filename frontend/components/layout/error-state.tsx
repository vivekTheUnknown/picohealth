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
      className={cn(
        "rounded-xl border border-red-200 bg-red-50/60 p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-100 text-red-700">
          <AlertTriangle className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-red-950">{title}</h2>
          <div className="mt-1 text-sm leading-6 text-red-900/90">
            {message ?? error?.message ?? "The service did not return a usable response."}
          </div>
          {error ? (
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-red-800/80">
              <div className="flex gap-1">
                <dt className="font-medium">Code:</dt>
                <dd className="font-mono">{error.code}</dd>
              </div>
              {error.status ? (
                <div className="flex gap-1">
                  <dt className="font-medium">HTTP:</dt>
                  <dd className="font-mono">{error.status}</dd>
                </div>
              ) : null}
              {error.requestId ? (
                <div className="flex gap-1">
                  <dt className="font-medium">Request:</dt>
                  <dd className="font-mono">{error.requestId}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {error?.retryable ? (
            <p className="mt-2 text-xs text-red-800/80">
              This looks temporary. You can retry the request.
            </p>
          ) : null}
          {onRetry || actions ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {onRetry ? (
                <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying} loadingLabel="Retrying">
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
