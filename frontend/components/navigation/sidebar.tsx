"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeartPulse, X } from "lucide-react";

import { cn } from "@/lib/cn";
import type { Me } from "@/lib/types";
import { isActivePath, sectionsFor } from "@/components/navigation/nav-config";

export interface SidebarProps {
  me: Me;
  onNavigate?: () => void;
  onClose?: () => void;
  className?: string;
}

export function Sidebar({ me, onNavigate, onClose, className }: SidebarProps) {
  const pathname = usePathname();
  const sections = sectionsFor(me);

  return (
    <div className={cn("flex h-full flex-col bg-surface", className)}>
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent-700 text-white"
          aria-hidden="true"
        >
          <HeartPulse className="h-[1.125rem] w-[1.125rem]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight text-ink">
            Health Monitoring
          </span>
          <span className="block text-[11px] leading-tight text-ink-subtle">
            Clinical portal
          </span>
        </span>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-subtle hover:bg-slate-100 hover:text-ink"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                {section.title}
              </h2>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                          active
                            ? "bg-accent-50 font-medium text-accent-900"
                            : "text-ink-muted hover:bg-slate-100 hover:text-ink",
                        )}
                      >
                        <Icon
                          className={cn("h-4 w-4 shrink-0", active ? "text-accent-700" : "text-ink-subtle")}
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-line px-4 py-3">
        <p className="text-[11px] leading-4 text-ink-subtle">
          Prototype portal. Not a certified medical device or emergency service.
        </p>
      </div>
    </div>
  );
}
