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

/**
 * 56px bar (style.md §4: 52–60px). Left: current workspace. Right: environment,
 * time zone, notifications and the user menu.
 */
export function TopBar({ me, navOpen, onOpenNav }: TopBarProps) {
  const pathname = usePathname();
  const workspace = pathname.startsWith("/admin") ? "Operations" : "Clinical";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="flex h-topbar items-center justify-between gap-3 px-4 sm:px-5 lg:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenNav}
            aria-label="Open navigation menu"
            aria-expanded={navOpen}
            className="-ml-1 rounded-sm p-1.5 text-ink-muted hover:bg-surface-active hover:text-ink lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <span className="text-xs font-medium text-ink-muted">{workspace}</span>
          <span aria-hidden="true" className="text-line-strong">
            /
          </span>
          <EnvironmentBadge />
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <span
            className="hidden items-center gap-1.5 text-2xs text-ink-subtle lg:flex"
            title="All timestamps are displayed in this time zone"
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            {me.timezone}
          </span>

          {isDoctor(me) ? (
            <Link
              href="/alerts"
              className="rounded-sm p-1.5 text-ink-muted transition-colors duration-fast hover:bg-surface-active hover:text-ink"
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
