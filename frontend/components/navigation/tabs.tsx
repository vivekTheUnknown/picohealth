"use client";

import { useRef, type KeyboardEvent } from "react";

import { cn } from "@/lib/cn";

export interface TabItem {
  id: string;
  label: string;
  count?: number | null;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Prefix for tab ids so the panel can reference them. */
  idPrefix: string;
  panelId: string;
  ariaLabel: string;
  className?: string;
}

/** WAI-ARIA tabs with roving focus and arrow-key navigation. */
export function Tabs({ items, value, onChange, idPrefix, panelId, ariaLabel, className }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const activate = (index: number) => {
    const item = items[index];
    if (!item) return;
    onChange(item.id);
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[index]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % items.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    activate(nextIndex);
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex gap-1 overflow-x-auto border-b border-line", className)}
    >
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            id={`${idPrefix}-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
              selected
                ? "border-accent-700 font-medium text-accent-900"
                : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {item.label}
            {item.count !== undefined && item.count !== null ? (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-muted">
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
