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
        "flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3",
        "has-[:checked]:border-accent-300 has-[:checked]:bg-accent-50/60",
        className,
      )}
    >
      <input
        id={inputId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-line-strong text-accent-700 accent-accent-700"
        {...rest}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-5 text-ink-subtle">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
