/** Data-freshness policy. A value is never presented as current once stale. */

export const DEFAULT_STALE_AFTER_MS = 5000;

export type Freshness = "live" | "stale" | "none";

export function freshnessFor(
  receivedAt: number | null,
  now: number,
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): Freshness {
  if (receivedAt === null || receivedAt <= 0) return "none";
  return now - receivedAt <= staleAfterMs ? "live" : "stale";
}

/** Human duration used for gaps and ages. */
export function describeDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  if (seconds < 2) return "just now";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

/** Compact age label for the device card and history rows. */
export function describeAge(receivedAt: number | null, now: number): string {
  if (receivedAt === null) return "No data received yet";
  const age = describeDuration(now - receivedAt);
  return age === "just now" ? age : `${age} ago`;
}

/**
 * True when two consecutive stored samples are far enough apart that drawing
 * them as continuous would imply data that was never received.
 */
export function isHistoryGap(
  previousAt: number,
  nextAt: number,
  staleAfterMs: number = DEFAULT_STALE_AFTER_MS,
): boolean {
  return nextAt - previousAt > Math.max(staleAfterMs, 2500);
}
