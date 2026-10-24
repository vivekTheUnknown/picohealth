"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, Loader2 } from "lucide-react";

import { SessionProvider, useSession } from "@/lib/session";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorState } from "@/components/layout/error-state";
import { buttonClasses } from "@/components/forms/button";

function SessionLoading() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-canvas px-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-5 py-4">
        <span
          className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-fg"
          aria-hidden="true"
        >
          <HeartPulse className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-ink">Restoring your session</p>
          <p className="text-xs text-ink-subtle">Verifying your access with the API…</p>
        </div>
        <Loader2 className="ml-2 h-4 w-4 animate-spin text-accent" aria-hidden="true" />
      </div>
    </div>
  );
}

function SessionRedirecting() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4" role="status">
      <div className="max-w-sm rounded-lg border border-line bg-surface p-6 text-center">
        <p className="text-sm font-semibold text-ink">Sign-in required</p>
        <p className="mt-1 text-sm leading-6 text-ink-muted">
          Your session has ended. Redirecting to the sign-in page…
        </p>
        <Link href="/login" className={buttonClasses("primary", "md", "mt-4")}>
          Go to sign in
        </Link>
      </div>
    </div>
  );
}

function PortalGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { me, status, error, refresh } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") return <SessionLoading />;
  if (status === "unauthenticated") return <SessionRedirecting />;

  if (status === "error" || !me) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-12">
        <div className="w-full max-w-xl">
          <ErrorState
            title="Could not verify your session"
            error={error}
            message="The portal could not load your identity from the API. Your session may still be valid; retry the request."
            onRetry={() => void refresh()}
            actions={
              <Link href="/login" className={buttonClasses("secondary", "sm")}>
                Sign in again
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return <AppShell me={me}>{children}</AppShell>;
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PortalGuard>{children}</PortalGuard>
    </SessionProvider>
  );
}
