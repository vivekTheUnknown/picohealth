"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { isAdmin } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import type { Me } from "@/lib/types";
import { RoleBadge } from "@/components/status/role-badge";

export function UserMenu({ me }: { me: Me }) {
  const router = useRouter();
  const { signOut } = useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown"
        ? items[(index + 1 + items.length) % items.length]
        : items[(index - 1 + items.length) % items.length];
    next?.focus();
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    router.replace("/login");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${me.display_name}`}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-transparent px-1.5 py-1 text-left transition-colors",
          "hover:border-line hover:bg-surface-raised",
          open && "border-line bg-surface-raised",
        )}
      >
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-subtle text-2xs font-semibold text-accent"
          aria-hidden="true"
        >
          {initials(me.display_name, me.email)}
        </span>
        <span className="hidden min-w-0 md:block">
          <span className="block max-w-40 truncate text-xs font-medium leading-tight text-ink">
            {me.display_name}
          </span>
          <span className="block text-2xs leading-tight text-ink-subtle">
            {me.roles.length > 0
              ? me.roles
                  .map((role) =>
                    role === "admin"
                      ? "Administrator"
                      : role === "patient"
                        ? "Patient"
                        : "Doctor",
                  )
                  .join(" · ")
              : "No role"}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-subtle" aria-hidden="true" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 z-40 mt-2 w-64 animate-fade-in overflow-hidden rounded-lg border border-line bg-surface shadow-raised"
        >
          <div className="border-b border-line px-3.5 py-3">
            <p className="truncate text-sm font-semibold text-ink">{me.display_name}</p>
            <p className="truncate text-xs text-ink-subtle">{me.email}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {me.roles.map((role) => (
                <RoleBadge key={role} role={role} />
              ))}
            </div>
          </div>
          <div className="p-1">
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-ink-muted hover:bg-surface-active hover:text-ink"
            >
              <Settings className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
              Profile &amp; settings
            </Link>
            {isAdmin(me) ? (
              <Link
                href="/admin/overview"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-ink-muted hover:bg-surface-active hover:text-ink"
              >
                <ShieldCheck className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
                Operations workspace
              </Link>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-ink-muted hover:bg-surface-active hover:text-ink disabled:opacity-60"
            >
              <LogOut className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
