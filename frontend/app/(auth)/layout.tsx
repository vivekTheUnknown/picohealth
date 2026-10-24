import Link from "next/link";
import { HeartPulse } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-canvas">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_32rem_at_50%_-8rem,#d4f4ec_0%,transparent_65%)]"
      />

      <a href="#auth-main" className="skip-link">
        Skip to sign-in form
      </a>

      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link href="/login" className="flex items-center gap-2.5 rounded-md">
          <span
            className="grid h-9 w-9 place-items-center rounded-lg bg-accent-700 text-white"
            aria-hidden="true"
          >
            <HeartPulse className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold leading-tight text-ink">
              Health Monitoring
            </span>
            <span className="block text-[11px] leading-tight text-ink-subtle">
              Clinical portal
            </span>
          </span>
        </Link>
        <span className="hidden text-xs text-ink-subtle sm:inline">
          Authorized clinical users only
        </span>
      </header>

      <main
        id="auth-main"
        className="relative flex flex-1 items-center justify-center px-4 py-8 sm:px-6"
      >
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="relative px-4 py-5 text-center text-[11px] leading-5 text-ink-subtle">
        Prototype portal for clinician review. Not a certified medical device, diagnostic
        system, or emergency service.
      </footer>
    </div>
  );
}
