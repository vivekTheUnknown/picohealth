import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api-client";

export type BannerTone = "error" | "success" | "info" | "warning";

const TONES: Record<
  BannerTone,
  { container: string; icon: string; Icon: typeof AlertCircle }
> = {
  error: {
    container: "border-red-200 bg-red-50 text-red-900",
    icon: "text-red-700",
    Icon: AlertCircle,
  },
  success: {
    container: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: "text-emerald-700",
    Icon: CheckCircle2,
  },
  info: {
    container: "border-ocean-200 bg-ocean-50 text-ocean-900",
    icon: "text-ocean-700",
    Icon: Info,
  },
  warning: {
    container: "border-amber-200 bg-amber-50 text-amber-900",
    icon: "text-amber-700",
    Icon: AlertTriangle,
  },
};

export interface FormBannerProps {
  tone: BannerTone;
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function FormBanner({ tone, title, children, onDismiss, className }: FormBannerProps) {
  const { container, icon, Icon } = TONES[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
        container,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-sm leading-6 opacity-90">{children}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="-my-1 -mr-1 rounded p-1 hover:bg-black/5"
          aria-label="Dismiss message"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** Adds actionable guidance for the API's stable error codes. */
export function apiErrorMessage(error: ApiError): string {
  if (error.isCsrfFailure) {
    return "Your security token is missing or expired. Refresh the page and try again.";
  }
  if (error.status === 429) {
    return "Too many attempts. Wait a moment, then try again.";
  }
  if (error.isForbidden) {
    return "The server refused this action for your account. If you need access, contact an administrator.";
  }
  return error.message;
}
