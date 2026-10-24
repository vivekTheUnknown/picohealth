import type { MetricType } from "@/lib/types";

export const APP_NAME = "Health Monitoring";

export const METRIC_ORDER: MetricType[] = [
  "heart_rate",
  "spo2",
  "respiratory_rate",
  "skin_temperature",
  "hrv",
  "activity",
];

export const TREND_METRICS: MetricType[] = [
  "heart_rate",
  "spo2",
  "respiratory_rate",
  "skin_temperature",
  "hrv",
];

/**
 * Chart chrome. Recharts takes SVG attributes, so these mirror the CSS tokens in
 * `globals.css` — keep the two in step when the palette changes.
 */
export const CHART_TOKENS = {
  grid: "#272C31", // --chart-grid
  axis: "#8F99A3", // --chart-axis
  baseline: "#4A545E", // --chart-baseline
  accent: "#3ECF8E", // --accent
} as const;

export const METRIC_CHART_COLORS: Record<string, string> = {
  heart_rate: "#3ECF8E",
  spo2: "#78A9FA",
  respiratory_rate: "#C6A0F6",
  skin_temperature: "#E7B455",
  hrv: "#5FD0D8",
  activity: "#A5ADB5",
};

export type TrendRangeKey = "1h" | "6h" | "24h" | "7d" | "30d";

export interface TrendRange {
  key: TrendRangeKey;
  label: string;
  hours: number;
}

export const TREND_RANGES: TrendRange[] = [
  { key: "1h", label: "1 hour", hours: 1 },
  { key: "6h", label: "6 hours", hours: 6 },
  { key: "24h", label: "24 hours", hours: 24 },
  { key: "7d", label: "7 days", hours: 24 * 7 },
  { key: "30d", label: "30 days", hours: 24 * 30 },
];

export const EMERGENCY_NOTE =
  "This portal supports clinical review. It is not an emergency response service or an autonomous diagnostic system.";

export const AI_SCOPE_NOTE =
  "AI-assisted review is not included in this release.";
