"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import type { Me } from "@/lib/types";
import { Sidebar } from "@/components/navigation/sidebar";
import { TopBar } from "@/components/navigation/top-bar";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const COLLAPSE_KEY = "portal.nav.collapsed";

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  // Desktop rail preference survives reloads; it is a layout choice only.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage can be unavailable in private modes */
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;

    previousFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setNavOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previousFocus.current?.focus();
    };
  }, [navOpen]);

  return (
    <div className="min-h-dvh bg-canvas">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r border-line lg:block",
          collapsed ? "w-sidebar-rail" : "w-sidebar",
        )}
      >
        <Sidebar me={me} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </aside>

      {navOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 animate-fade-in"
            onClick={() => setNavOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-fade-in border-r border-line bg-sidebar shadow-raised"
          >
            <Sidebar
              me={me}
              onNavigate={() => setNavOpen(false)}
              onClose={() => setNavOpen(false)}
            />
          </div>
        </div>
      ) : null}

      <div className={cn("transition-[padding] duration-fast", collapsed ? "lg:pl-sidebar-rail" : "lg:pl-sidebar")}>
        <TopBar me={me} navOpen={navOpen} onOpenNav={() => setNavOpen(true)} />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-shell px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
