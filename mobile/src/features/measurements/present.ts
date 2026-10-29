import type { IconName, Tone } from "@/components/ui/primitives";
import type { SensorFrame, SensorStatus } from "@/types/health";

export interface StatusPresentation {
  label: string;
  tone: Tone;
  icon: IconName;
}

/**
 * Sensor status vocabulary. Each state has a label and an icon so meaning never
 * depends on colour (PicoHealth_design.md §6).
 */
export function sensorStatus(status: SensorStatus): StatusPresentation {
  switch (status) {
    case "ok":
      return { label: "Validated", tone: "success", icon: "checkmark-circle" };
    case "unvalidated":
      return { label: "Not validated", tone: "warning", icon: "help-circle" };
    case "error":
      return { label: "Invalid data", tone: "danger", icon: "close-circle" };
    default:
      return { label: "Unavailable", tone: "neutral", icon: "remove-circle" };
  }
}

/** Optical values are raw counts and are never labelled heart rate or SpO₂. */
export function opticalPresentation(frame: SensorFrame): StatusPresentation {
  if (frame.optical.status === "ok") {
    return { label: "Raw counts", tone: "accent", icon: "pulse" };
  }
  return sensorStatus(frame.optical.status);
}

export function opticalValue(frame: SensorFrame): string {
  const { red, ir } = frame.optical;
  if (red === null || ir === null) return "--";
  return `R ${red.toLocaleString()} · IR ${ir.toLocaleString()}`;
}

export function opticalDetail(frame: SensorFrame): string {
  const { status, samples } = frame.optical;
  if (status === "unavailable") return "Not detected. Check wiring and power.";
  if (status === "unvalidated") return "Raw counts present; acquisition path unverified.";
  if (status === "error") return "Sensor claimed validity but returned no counts.";
  return samples > 0
    ? `${samples} sample${samples === 1 ? "" : "s"} in the last frame. Raw counts only.`
    : "Raw counts available; sample count was zero.";
}

export function temperatureValue(frame: SensorFrame): string {
  const { status, valueC } = frame.temperature;
  if (status !== "ok" || valueC === null) return "-- °C";
  return `${valueC.toFixed(2)} °C`;
}

export function temperatureDetail(frame: SensorFrame): string {
  const { status } = frame.temperature;
  if (status === "unvalidated") {
    return "Sensor connected, but the chip identity and conversion are unverified. No °C value is shown.";
  }
  if (status === "unavailable") return "Not detected. Check wiring and power.";
  if (status === "error") return "Invalid value discarded.";
  return "Reported by the firmware as a validated driver.";
}

export function imuValue(frame: SensorFrame): string {
  const { status, accelG } = frame.imu;
  if (status !== "ok" || !accelG) return "Driver not validated";
  return `${accelG.map((axis) => axis.toFixed(2)).join(", ")} g`;
}

export function imuDetail(frame: SensorFrame): string {
  const { status } = frame.imu;
  if (status === "unvalidated") {
    return "WHO_AM_I did not match a known register map, so acceleration and gyro values are not shown.";
  }
  if (status === "unavailable") return "Not detected. Check wiring and power.";
  if (status === "error") return "Invalid axes discarded.";
  return "Validated driver; axes in g and °/s.";
}

/** One-line history summary that never overstates a sensor's status. */
export function frameSummary(frame: SensorFrame): string {
  const parts: string[] = [];

  if (frame.optical.red !== null && frame.optical.ir !== null) {
    parts.push(`R ${frame.optical.red} / IR ${frame.optical.ir}`);
  } else {
    parts.push("Optical --");
  }

  parts.push(`Temp ${temperatureValue(frame)}`);
  parts.push(
    frame.imu.status === "ok" && frame.imu.accelG
      ? "IMU ok"
      : frame.imu.status === "unvalidated"
        ? "IMU unverified"
        : "IMU --",
  );

  return parts.join(" · ");
}
