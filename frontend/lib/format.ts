/** Locale/time-zone-aware formatters used across the portal. */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function safeTimeZone(timeZone?: string | null): string | undefined {
  if (!timeZone) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return undefined;
  }
}

function getFormatter(
  options: Intl.DateTimeFormatOptions,
  timeZone?: string | null,
): Intl.DateTimeFormat {
  const zone = safeTimeZone(timeZone);
  const key = `${zone ?? "local"}|${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(undefined, { ...options, timeZone: zone });
  formatterCache.set(key, formatter);
  return formatter;
}

export function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  timeZone?: string | null,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return getFormatter({ dateStyle: "medium", timeStyle: "short" }, timeZone).format(date);
}

export function formatDate(
  value: string | number | Date | null | undefined,
  timeZone?: string | null,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return getFormatter({ dateStyle: "medium" }, timeZone).format(date);
}

export function formatTime(
  value: string | number | Date | null | undefined,
  timeZone?: string | null,
): string {
  const date = toDate(value);
  if (!date) return "—";
  return getFormatter({ hour: "2-digit", minute: "2-digit" }, timeZone).format(date);
}

/** Axis ticks switch from time-only to date+time for multi-day windows. */
export function formatAxisTick(
  epochMs: number,
  timeZone: string | null | undefined,
  spanMs: number,
): string {
  if (spanMs > 36 * 60 * 60 * 1000) {
    return getFormatter(
      { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
      timeZone,
    ).format(new Date(epochMs));
  }
  return getFormatter({ hour: "2-digit", minute: "2-digit" }, timeZone).format(
    new Date(epochMs),
  );
}

export function formatRelative(
  value: string | number | Date | null | undefined,
  now: number = Date.now(),
): string {
  const date = toDate(value);
  if (!date) return "—";
  const diffMs = now - date.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let text: string;
  if (abs < 45_000) text = "just now";
  else if (abs < hour) text = `${Math.round(abs / minute)} min`;
  else if (abs < day) text = `${Math.round(abs / hour)} hr`;
  else if (abs < 30 * day) text = `${Math.round(abs / day)} day`;
  else text = `${Math.round(abs / (30 * day))} mo`;

  if (text === "just now") return text;
  return future ? `in ${text}` : `${text} ago`;
}

export function formatDurationBetween(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const from = toDate(start);
  if (!from) return "—";
  const to = toDate(end);
  if (!to) return "—";
  const diffMs = Math.max(0, to.getTime() - from.getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days} d ${remainingHours} hr` : `${days} d`;
}

const METRIC_LABELS: Record<string, string> = {
  heart_rate: "Heart rate",
  spo2: "SpO₂",
  respiratory_rate: "Respiratory rate",
  skin_temperature: "Skin temperature",
  hrv: "Heart rate variability",
  activity: "Activity",
};

const METRIC_UNITS: Record<string, string> = {
  heart_rate: "bpm",
  spo2: "%",
  respiratory_rate: "breaths/min",
  skin_temperature: "°C",
  hrv: "ms",
  activity: "a.u.",
};

const METRIC_SHORT: Record<string, string> = {
  heart_rate: "HR",
  spo2: "SpO₂",
  respiratory_rate: "RR",
  skin_temperature: "Temp",
  hrv: "HRV",
  activity: "Activity",
};

export function shortMetricLabel(metric: string | null | undefined): string {
  if (!metric) return "Metric";
  return METRIC_SHORT[metric] ?? humanizeMetric(metric);
}

export function humanizeMetric(metric: string | null | undefined): string {
  if (!metric) return "Metric";
  return METRIC_LABELS[metric] ?? titleize(metric);
}

export function defaultUnitForMetric(metric: string | null | undefined): string {
  if (!metric) return "";
  return METRIC_UNITS[metric] ?? "";
}

export function titleize(value: string | null | undefined): string {
  if (!value) return "—";
  const spaced = value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function humanizeEventType(value: string | null | undefined): string {
  if (!value) return "Event";
  return titleize(value)
    .replace(/\bSpo2\b/g, "SpO₂")
    .replace(/\bHrv\b/g, "HRV")
    .replace(/\bBpm\b/g, "BPM");
}

export function humanizePermission(value: string | null | undefined): string {
  if (!value) return "—";
  const [scope, action] = value.split(":");
  if (!action) return titleize(value);
  return `${titleize(scope)} · ${titleize(action.replace(/read_/g, ""))}`;
}

export function initials(name: string | null | undefined, email?: string | null): string {
  const source = (name && name.trim()) || (email ?? "");
  if (!source) return "?";
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function formatNumber(
  value: number | null | undefined,
  maximumFractionDigits = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(value);
}

export function formatBattery(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Not reported";
  return `${Math.round(value)}%`;
}

/** Baseline coverage may arrive as 0–1 or 0–100. */
export function formatCoverage(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const percent = value <= 1 ? value * 100 : value;
  return `${Math.round(percent)}%`;
}

export function formatWindow(
  start: string | null | undefined,
  end: string | null | undefined,
  timeZone?: string | null,
): string | null {
  const from = toDate(start);
  const to = toDate(end);
  if (!from && !to) return null;
  if (from && to) {
    return `${formatTime(from, timeZone)}–${formatTime(to, timeZone)}`;
  }
  return formatDateTime(from ?? to, timeZone);
}

export function truncate(value: string, max = 120): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function pluralize(count: number, singular: string, plural?: string): string {
  // Includes the count: every call site renders this directly into a label, so
  // omitting it produced labels like "patients in view" with no number.
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export function formatEventDuration(
  start: string | null | undefined,
  end: string | null | undefined,
  status: string | null | undefined,
): string {
  const duration = formatDurationBetween(start, end);
  if (duration !== "—") return duration;
  if (status === "resolved" || status === "false_positive") return "Not reported";
  return "Ongoing";
}


/**
 * Abbreviates a long opaque identifier for table display. The full value stays
 * available in a `title`, so nothing is lost — only the width it consumes.
 */
export function shortId(value: string, head = 8): string {
  return value.length > head ? `${value.slice(0, head)}…` : value;
}
