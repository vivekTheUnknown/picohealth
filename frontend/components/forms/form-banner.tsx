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
    container: "border-danger/30 bg-danger-subtle text-danger",
    icon: "text-danger",
    Icon: AlertCircle,
  },
  success: {
    container: "border-success/30 bg-success-subtle text-success",
    icon: "text-success",
    Icon: CheckCircle2,
  },
  info: {
    container: "border-info/30 bg-info-subtle text-info",
    icon: "text-info",
    Icon: Info,
  },
  warning: {
    container: "border-warning/30 bg-warning-subtle text-warning",
    icon: "text-warning",
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
        "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm",
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
          className="-my-0.5 -mr-0.5 rounded-sm p-1 text-current opacity-70 transition-opacity duration-fast hover:opacity-100"
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
