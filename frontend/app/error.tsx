"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/layout/error-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log only the error identity. Never log health data or request bodies.
    console.error("Portal render error", error.digest ?? error.name);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <ErrorState
        title="Something went wrong in the portal"
        message="The page could not be rendered. Your session and data are unaffected. Try again, or return to the overview."
        onRetry={reset}
        actions={
          <a href="/" className="text-sm font-medium text-accent-800 underline underline-offset-2">
            Return to the portal
          </a>
        }
      />
    </div>
  );
}
