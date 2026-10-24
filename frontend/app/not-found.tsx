import Link from "next/link";
import { HeartPulse } from "lucide-react";

import { buttonClasses } from "@/components/forms/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent-700 text-white">
        <HeartPulse className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">Page not found</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-muted">
        The page you requested does not exist, or the link is out of date.
      </p>
      <Link href="/" className={buttonClasses("primary", "md", "mt-6")}>
        Go to the portal
      </Link>
    </main>
  );
}
