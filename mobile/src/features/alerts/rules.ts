import type { AlertSeverity, SensorFrame, SensorStatus } from "@/types/health";

/**
 * Informational prototype alerts.
 *
 * These are not clinical cutoffs and never describe an emergency. Thresholds
 * are configurable and labelled as prototype thresholds in the UI.
 */
export type SensorKey = "optical" | "temperature" | "imu";

export interface AlertThresholds {
  /** Raw optical counts. Prototype sanity bound, not a physiological limit. */
  opticalMaxCount: number;
  temperatureMinC: number;
  temperatureMaxC: number;
  staleAfterMs: number;
  /** Prevents an out-of-range condition from producing one alert per second. */
  repeatCooldownMs: number;
}

export const DEFAULT_THRESHOLDS: AlertThresholds = {
  opticalMaxCount: 250000,
  temperatureMinC: 15,
  temperatureMaxC: 40,
  staleAfterMs: 5000,
  repeatCooldownMs: 60_000,
};

export interface AlertCandidate {
  code: string;
  sensor: SensorKey | null;
  severity: AlertSeverity;
  title: string;
  message: string;
}

export interface AlertEpisodeState {
  /** One alert per loss episode, not per frame. */
  unavailable: Record<SensorKey, boolean>;
  unvalidated: Record<SensorKey, boolean>;
  stale: boolean;
  lastFiredAt: Record<string, number>;
}

export function initialAlertState(): AlertEpisodeState {
  return {
    unavailable: { optical: false, temperature: false, imu: false },
    unvalidated: { optical: false, temperature: false, imu: false },
    stale: false,
    lastFiredAt: {},
  };
}

const SENSOR_LABEL: Record<SensorKey, string> = {
  optical: "Optical sensor",
  temperature: "Temperature sensor",
  imu: "Motion sensor",
};

function statusOf(frame: SensorFrame, sensor: SensorKey): SensorStatus {
  return frame[sensor].status;
}

function cooldownElapsed(
  state: AlertEpisodeState,
  key: string,
  now: number,
  cooldownMs: number,
): boolean {
  const last = state.lastFiredAt[key];
  return last === undefined || now - last >= cooldownMs;
}

/**
 * Evaluates one frame against the previous frame.
 *
 * Pure: returns candidates and the next episode state. Persisting and
 * de-duplicating against the database happen in the caller.
 */
export function evaluateFrame(
  next: SensorFrame,
  state: AlertEpisodeState,
  thresholds: AlertThresholds,
  now: number = next.receivedAt,
): { candidates: AlertCandidate[]; state: AlertEpisodeState } {
  const candidates: AlertCandidate[] = [];
  const nextState: AlertEpisodeState = {
    unavailable: { ...state.unavailable },
    unvalidated: { ...state.unvalidated },
    stale: state.stale,
    lastFiredAt: { ...state.lastFiredAt },
  };

  (Object.keys(SENSOR_LABEL) as SensorKey[]).forEach((sensor) => {
    const status = statusOf(next, sensor);

    if (status === "unavailable") {
      if (!nextState.unavailable[sensor]) {
        nextState.unavailable[sensor] = true;
        candidates.push({
          code: "SENSOR_UNAVAILABLE",
          sensor,
          severity: "warning",
          title: `${SENSOR_LABEL[sensor]} unavailable`,
          message: `${SENSOR_LABEL[sensor]} did not report data. Check that the breakout is connected and powered. Other sensors are unaffected.`,
        });
      }
    } else if (nextState.unavailable[sensor]) {
      nextState.unavailable[sensor] = false;
    }

    if (status === "unvalidated") {
      if (!nextState.unvalidated[sensor]) {
        nextState.unvalidated[sensor] = true;
        candidates.push({
          code: "SENSOR_UNVALIDATED",
          sensor,
          severity: "info",
          title: `${SENSOR_LABEL[sensor]} driver not validated`,
          message: `${SENSOR_LABEL[sensor]} is connected, but its chip identity or conversion is unverified. Values are not shown as measurements.`,
        });
      }
    } else if (nextState.unvalidated[sensor]) {
      nextState.unvalidated[sensor] = false;
    }

    if (status === "error") {
      const key = `SENSOR_ERROR:${sensor}`;
      if (cooldownElapsed(nextState, key, now, thresholds.repeatCooldownMs)) {
        nextState.lastFiredAt[key] = now;
        candidates.push({
          code: "SENSOR_DATA_INVALID",
          sensor,
          severity: "warning",
          title: `${SENSOR_LABEL[sensor]} returned invalid data`,
          message: `${SENSOR_LABEL[sensor]} reported a valid state without usable values. The reading was discarded.`,
        });
      }
    }
  });

  if (next.optical.status === "ok") {
    const { red, ir } = next.optical;
    const aboveThreshold =
      (red !== null && red > thresholds.opticalMaxCount) ||
      (ir !== null && ir > thresholds.opticalMaxCount);

    if (
      aboveThreshold &&
      cooldownElapsed(nextState, "OPTICAL_OUT_OF_RANGE", now, thresholds.repeatCooldownMs)
    ) {
      nextState.lastFiredAt.OPTICAL_OUT_OF_RANGE = now;
      candidates.push({
        code: "OPTICAL_OUT_OF_RANGE",
        sensor: "optical",
        severity: "warning",
        title: "Raw optical counts above prototype range",
        message: `Raw counts exceeded the configured prototype threshold of ${thresholds.opticalMaxCount}. This is a raw sensor bound, not a clinical alert.`,
      });
    }
  }

  if (next.temperature.status === "ok" && next.temperature.valueC !== null) {
    const value = next.temperature.valueC;
    const outside =
      value < thresholds.temperatureMinC || value > thresholds.temperatureMaxC;

    if (
      outside &&
      cooldownElapsed(nextState, "TEMPERATURE_OUT_OF_RANGE", now, thresholds.repeatCooldownMs)
    ) {
      nextState.lastFiredAt.TEMPERATURE_OUT_OF_RANGE = now;
      candidates.push({
        code: "TEMPERATURE_OUT_OF_RANGE",
        sensor: "temperature",
        severity: "warning",
        title: "Temperature outside prototype range",
        message: `A validated temperature reading (${value.toFixed(2)} °C) fell outside the prototype range ${thresholds.temperatureMinC}–${thresholds.temperatureMaxC} °C. Not a clinical alert.`,
      });
    }
  }

  return { candidates, state: nextState };
}

/**
 * Called by the one-second ticker. Produces a single stale alert per episode
 * and clears the episode when data resumes.
 */
export function evaluateFreshness(
  lastReceivedAt: number | null,
  now: number,
  state: AlertEpisodeState,
  thresholds: AlertThresholds,
  streaming: boolean,
): { candidates: AlertCandidate[]; state: AlertEpisodeState } {
  if (!streaming || lastReceivedAt === null) {
    return { candidates: [], state };
  }

  const isStale = now - lastReceivedAt > thresholds.staleAfterMs;

  if (!isStale) {
    return { candidates: [], state: { ...state, stale: false } };
  }

  if (state.stale) {
    return { candidates: [], state };
  }

  return {
    candidates: [
      {
        code: "DATA_STALE",
        sensor: null,
        severity: "warning",
        title: "Data is stale",
        message: `No measurements have arrived for more than ${Math.round(
          thresholds.staleAfterMs / 1000,
        )} seconds. The last reading is no longer current.`,
      },
    ],
    state: { ...state, stale: true },
  };
}
