import type { IconName, Tone } from "@/components/ui/primitives";
import type { OpticalState } from "@/types/health";

export interface OpticalStateView {
  label: string;
  tone: Tone;
  icon: IconName;
  detail: string;
}

/**
 * MAX30102 state machine vocabulary, shared by the dashboard and live screens.
 * A high optical reading only proves reflection, not that a finger is present.
 */
export function opticalStateView(state: OpticalState): OpticalStateView {
  switch (state) {
    case "measurement_valid":
      return {
        label: "Valid estimate",
        tone: "success",
        icon: "checkmark-circle",
        detail: "A window passed contact, pulse and metric checks.",
      };
    case "pulse_likely":
      return {
        label: "Pulse detected",
        tone: "accent",
        icon: "pulse",
        detail:
          "Pulse-like activity is present in both channels, but the estimates have not passed every check yet.",
      };
    case "signal_present":
      return {
        label: "Signal detected",
        tone: "info",
        icon: "radio",
        detail:
          "Reflection is reaching the sensor but no reliable pulse is present. Keep the finger still and cover the sensor.",
      };
    case "verifying_pulse":
      return {
        label: "Measuring",
        tone: "info",
        icon: "hourglass-outline",
        detail: "Collecting a 4–10 second window of paired red/IR samples.",
      };
    case "no_signal":
      return {
        label: "Place finger",
        tone: "warning",
        icon: "hand-left",
        detail:
          "The optical signal is below the no-signal threshold. Place a fingertip on the MAX30102 window.",
      };
    case "poor_signal":
      return {
        label: "Poor signal",
        tone: "warning",
        icon: "warning-outline",
        detail:
          "The window was clipped, motion-corrupted or inconsistent. Keep still and adjust finger placement.",
      };
    case "sensor_error":
      return {
        label: "Sensor error",
        tone: "danger",
        icon: "close-circle",
        detail: "The optical stream reported an error. Check the sensor connection.",
      };
    default:
      return {
        label: "No estimate",
        tone: "neutral",
        icon: "remove-circle",
        detail: "No optical state is available yet.",
      };
  }
}
