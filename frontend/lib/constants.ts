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

export const METRIC_CHART_COLORS: Record<string, string> = {
  heart_rate: "#0f7f76",
  spo2: "#2563eb",
  respiratory_rate: "#7c3aed",
  skin_temperature: "#0891b2",
  hrv: "#4f46e5",
  activity: "#475569",
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
