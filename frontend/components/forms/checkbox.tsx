"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

export function Checkbox({ label, description, className, id, ...rest }: CheckboxProps) {
  const inputId = id ?? `checkbox-${String(rest.name ?? "option")}-${String(rest.value ?? "value")}`;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 rounded-md border border-line p-3 transition-colors duration-fast",
        "hover:border-line-strong hover:bg-surface-raised/50",
        "has-[:checked]:border-accent/40 has-[:checked]:bg-accent-subtle/50",
        className,
      )}
    >
      <input
        id={inputId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border-line-control accent-accent"
        {...rest}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-4 text-ink-subtle">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
