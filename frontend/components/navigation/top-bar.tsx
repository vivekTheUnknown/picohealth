"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Globe, Menu } from "lucide-react";

import { isDoctor } from "@/lib/permissions";
import type { Me } from "@/lib/types";
import { EnvironmentBadge } from "@/components/navigation/environment-badge";
import { UserMenu } from "@/components/navigation/user-menu";

export interface TopBarProps {
  me: Me;
  navOpen: boolean;
  onOpenNav: () => void;
}

export function TopBar({ me, navOpen, onOpenNav }: TopBarProps) {
  const pathname = usePathname();
  const workspace = pathname.startsWith("/admin") ? "Operations workspace" : "Clinical workspace";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenNav}
            aria-label="Open navigation menu"
            aria-expanded={navOpen}
            className="-ml-1 rounded-md p-2 text-ink-muted hover:bg-slate-100 hover:text-ink lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <EnvironmentBadge />
          <span className="hidden text-xs font-medium text-ink-subtle sm:inline">{workspace}</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <span
            className="hidden items-center gap-1.5 text-[11px] text-ink-subtle lg:flex"
            title="All timestamps are displayed in this time zone"
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            Times in {me.timezone}
          </span>

          {isDoctor(me) ? (
            <Link
              href="/alerts"
              className="rounded-md p-2 text-ink-muted hover:bg-slate-100 hover:text-ink"
              aria-label="Open alerts"
            >
              <Bell className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
            </Link>
          ) : null}

          <UserMenu me={me} />
        </div>
      </div>
    </header>
  );
}
