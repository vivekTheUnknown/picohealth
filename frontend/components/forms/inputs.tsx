"use client";

import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/cn";

/**
 * One control surface shared by input, select and textarea (style.md §7):
 * dark surface, subtle border, clear accent focus ring.
 *
 * The border uses `--border-control` rather than `--border`: an input's outline
 * is the visual information that identifies it as a control, so it is held to
 * WCAG 2.2 AA 1.4.11 (3:1).
 */
export const controlClasses =
  "block w-full rounded-md border border-line-control bg-surface px-3 text-sm text-ink " +
  "transition-colors duration-fast placeholder:text-ink-subtle " +
  "hover:border-line-strong " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 " +
  "disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-inset disabled:text-ink-subtle " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/25";

const INPUT_HEIGHT = "h-[38px] py-0";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(controlClasses, INPUT_HEIGHT, className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(controlClasses, INPUT_HEIGHT, "control-select appearance-none pr-8", className)}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(controlClasses, "resize-y py-2 leading-5", className)}
      {...rest}
    />
  );
});
