"use client";

import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export const controlClasses =
  "block w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink shadow-sm " +
  "placeholder:text-ink-subtle disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-ink-subtle " +
  "aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-200";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(controlClasses, className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cn(controlClasses, "pr-8", className)} {...rest}>
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(controlClasses, className)} {...rest} />;
});
