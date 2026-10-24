import { cn } from "@/lib/cn";

function environmentLabel(): { label: string; className: string } {
  const raw = (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "development")
    .trim()
    .toLowerCase();

  if (raw === "production" || raw === "prod") {
    return {
      label: "Production",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (raw === "staging") {
    return { label: "Staging", className: "border-ocean-200 bg-ocean-50 text-ocean-800" };
  }
  if (raw === "development" || raw === "dev" || raw === "local") {
    return { label: "Development", className: "border-amber-200 bg-amber-50 text-amber-900" };
  }
  return {
    label: raw.charAt(0).toUpperCase() + raw.slice(1),
    className: "border-line-strong bg-slate-100 text-slate-700",
  };
}

export function EnvironmentBadge({ className }: { className?: string }) {
  const { label, className: tone } = environmentLabel();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        tone,
        className,
      )}
      title="Deployment environment"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
      {label}
    </span>
  );
}
