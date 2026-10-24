import { cn } from "@/lib/cn";

/**
 * Environment label comes from an explicit, deployment-owned variable.
 *
 * It deliberately does not read `NODE_ENV`: a production build served locally
 * would then claim to be Production, and a preview build would claim to be
 * something it is not. `NEXT_PUBLIC_APP_ENV` is set per deployment and
 * defaults to `development`, which is the safe thing to under-claim.
 */
function environmentLabel(): { label: string; className: string } {
  const raw = (process.env.NEXT_PUBLIC_APP_ENV ?? "development").trim().toLowerCase();

  if (raw === "production" || raw === "prod") {
    // Neutral on purpose: green means "successful operation" elsewhere in this
    // system, and production is not a success state — it is the one where
    // mistakes are expensive.
    return { label: "Production", className: "border-line-control bg-surface-active text-ink" };
  }
  if (raw === "staging" || raw === "stage") {
    return { label: "Staging", className: "border-info/40 bg-info-subtle text-info" };
  }
  if (raw === "development" || raw === "dev" || raw === "local") {
    return { label: "Development", className: "border-warning/40 bg-warning-subtle text-warning" };
  }
  return {
    label: raw.charAt(0).toUpperCase() + raw.slice(1),
    className: "border-line bg-surface-active text-ink-muted",
  };
}

export function EnvironmentBadge({ className }: { className?: string }) {
  const { label, className: tone } = environmentLabel();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-2xs font-medium",
        tone,
        className,
      )}
      title={`Deployment environment: ${label}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {label}
    </span>
  );
}
