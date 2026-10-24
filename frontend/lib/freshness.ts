/**
 * Data-freshness policy.
 *
 * A measurement is only "current" inside its freshness window. Older values
 * must be rendered with a stale label and their last-received time, never as if
 * they were live. These thresholds are display policy, not clinical rules.
 */

export const DEFAULT_STALE_AFTER_MINUTES = 15;

export const METRIC_STALE_AFTER_MINUTES: Record<string, number> = {
  heart_rate: 10,
  spo2: 10,
  respiratory_rate: 15,
  skin_temperature: 30,
  hrv: 60,
  activity: 60,
};

export type FreshnessState = "fresh" | "stale" | "unavailable";

export interface Freshness {
  state: FreshnessState;
  ageMinutes: number | null;
  timestampMs: number | null;
  staleAfterMinutes: number;
}

export function freshnessFor(
  timestamp: string | null | undefined,
  staleAfterMinutes: number = DEFAULT_STALE_AFTER_MINUTES,
  now: number = Date.now(),
): Freshness {
  if (!timestamp) {
    return {
      state: "unavailable",
      ageMinutes: null,
      timestampMs: null,
      staleAfterMinutes,
    };
  }
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) {
    return {
      state: "unavailable",
      ageMinutes: null,
      timestampMs: null,
      staleAfterMinutes,
    };
  }
  const ageMinutes = (now - parsed) / 60_000;
  return {
    state: ageMinutes > staleAfterMinutes ? "stale" : "fresh",
    ageMinutes,
    timestampMs: parsed,
    staleAfterMinutes,
  };
}

export function metricFreshness(
  metricType: string | null | undefined,
  timestamp: string | null | undefined,
  now: number = Date.now(),
): Freshness {
  const threshold = metricType
    ? (METRIC_STALE_AFTER_MINUTES[metricType] ?? DEFAULT_STALE_AFTER_MINUTES)
    : DEFAULT_STALE_AFTER_MINUTES;
  return freshnessFor(timestamp, threshold, now);
}

/** The newest measurement in a mixed set, used for patient-level freshness. */
export function latestObservedAt(
  measurements: Array<{ observed_at: string | null }>,
): string | null {
  let newest: { ms: number; value: string } | null = null;
  for (const measurement of measurements) {
    if (!measurement.observed_at) continue;
    const ms = Date.parse(measurement.observed_at);
    if (Number.isNaN(ms)) continue;
    if (!newest || ms > newest.ms) newest = { ms, value: measurement.observed_at };
  }
  return newest?.value ?? null;
}
