import type { BadgeTone } from "@/components/status/badge";

/** Display vocabulary for the app's optical state machine. */
export function opticalStateView(state: string | null): {
  label: string;
  tone: BadgeTone;
  detail: string;
} {
  switch (state) {
    case "measurement_valid":
      return {
        label: "Valid estimate",
        tone: "success",
        detail: "The window passed contact, pulse, interval and channel checks.",
      };
    case "pulse_likely":
      return {
        label: "Pulse detected",
        tone: "info",
        detail: "Pulse-like activity is present, but not every check has passed.",
      };
    case "signal_present":
      return {
        label: "Signal detected",
        tone: "info",
        detail: "Reflection is reaching the sensor, but no reliable pulse is present.",
      };
    case "verifying_pulse":
      return {
        label: "Measuring",
        tone: "info",
        detail: "Collecting a 4-second window of paired red/IR samples.",
      };
    case "no_signal":
      return {
        label: "No signal",
        tone: "warning",
        detail: "The optical level is below the no-signal threshold.",
      };
    case "poor_signal":
      return {
        label: "Poor signal",
        tone: "warning",
        detail: "The window was clipped, motion-corrupted or inconsistent.",
      };
    case "sensor_error":
      return {
        label: "Sensor error",
        tone: "danger",
        detail: "The optical stream reported an error.",
      };
    default:
      return {
        label: "Not reported",
        tone: "neutral",
        detail: "No optical state was synced for this record.",
      };
  }
}

export const ACTIVITY_LABELS: Record<string, string> = {
  still: "Still",
  light_activity: "Light movement",
  moderate_activity: "Moderate movement",
  high_activity: "High movement",
  unknown: "Unknown",
};

export const ORIENTATION_LABELS: Record<string, string> = {
  face_up: "Face up",
  face_down: "Face down",
  edge_x: "Edge (X)",
  edge_y: "Edge (Y)",
  unknown: "Unknown",
};

export function activityLabel(value: string | null): string {
  if (!value) return "Not reported";
  return ACTIVITY_LABELS[value] ?? value.replaceAll("_", " ");
}

export function orientationLabel(value: string | null): string {
  if (!value) return "Not reported";
  return ORIENTATION_LABELS[value] ?? value.replaceAll("_", " ");
}
