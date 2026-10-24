"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HeartPulse, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

import { cn } from "@/lib/cn";
import type { Me } from "@/lib/types";
import { isActivePath, sectionsFor } from "@/components/navigation/nav-config";

export interface SidebarProps {
  me: Me;
  onNavigate?: () => void;
  onClose?: () => void;
  className?: string;
  /** Desktop icon-rail mode (style.md §5: support collapse and expansion). */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/**
 * Darkest surface in the product, with a single right border.
 * The active route gets a quiet green tint, an accent icon and a narrow
 * indicator bar — three signals, so it never relies on colour alone.
 */
export function Sidebar({
  me,
  onNavigate,
  onClose,
  className,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const sections = sectionsFor(me);

  return (
    <div className={cn("flex h-full flex-col bg-sidebar", className)}>
      <div
        className={cn(
          "flex h-topbar shrink-0 items-center gap-2.5 border-b border-line px-3",
          collapsed && "justify-center px-0",
        )}
      >
        <Link
          href={me.roles.includes("admin") ? "/admin/overview" : "/overview"}
          onClick={onNavigate}
          className="flex min-w-0 items-center gap-2.5 rounded-sm"
          aria-label="Health Monitoring clinical portal"
        >
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-accent-fg"
            aria-hidden="true"
          >
            <HeartPulse className="h-4 w-4" />
          </span>
          {!collapsed ? (
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
                Health Monitoring
              </span>
              <span className="block truncate text-2xs leading-tight text-ink-subtle">
                Clinical portal
              </span>
            </span>
          ) : null}
        </Link>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-sm p-1.5 text-ink-subtle hover:bg-surface-active hover:text-ink"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.title}>
              {!collapsed ? (
                <h2 className="px-2 pb-1 text-2xs font-medium text-ink-subtle">{section.title}</h2>
              ) : (
                <div className="mx-1 mb-1 border-t border-line-subtle" aria-hidden="true" />
              )}
              <ul className="space-y-px">
                {section.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "relative flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-fast",
                          collapsed && "justify-center px-0",
                          active
                            ? "bg-accent-subtle font-medium text-ink"
                            : "text-ink-muted hover:bg-surface-active hover:text-ink",
                        )}
                      >
                        {active ? (
                          <span
                            className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent"
                            aria-hidden="true"
                          />
                        ) : null}
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            active ? "text-accent" : "text-ink-subtle",
                          )}
                          aria-hidden="true"
                        />
                        {!collapsed ? <span className="truncate">{item.label}</span> : null}
                        {collapsed ? <span className="sr-only">{item.label}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className="border-t border-line px-2 py-2">
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-ink-subtle transition-colors duration-fast hover:bg-surface-active hover:text-ink",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            )}
            {!collapsed ? <span>Collapse</span> : null}
          </button>
        ) : null}
        {!collapsed ? (
          <p className="px-2 pt-2 text-2xs leading-4 text-ink-subtle">
            Prototype portal. Not a certified medical device or emergency service.
          </p>
        ) : null}
      </div>
    </div>
  );
}
