import {
  DEFAULT_THRESHOLDS,
  evaluateFrame,
  evaluateFreshness,
  initialAlertState,
} from "@/features/alerts/rules";
import type { SensorFrame } from "@/types/health";

const NOW = 1_000_000;

function frame(overrides: Partial<SensorFrame> = {}): SensorFrame {
  return {
    uptimeMs: 1000,
    flags: 0x3f,
    optical: { status: "ok", red: 1000, ir: 900, samples: 12 },
    temperature: { status: "unvalidated", valueC: null },
    imu: { status: "unvalidated", accelG: null, gyroDps: null },
    receivedAt: NOW,
    source: "live",
    sequence: 1,
    ...overrides,
  };
}

describe("evaluateFrame", () => {
  it("reports unvalidated drivers once per episode, not once per frame", () => {
    const first = evaluateFrame(frame(), initialAlertState(), DEFAULT_THRESHOLDS, NOW);
    expect(first.candidates.map((candidate) => candidate.code).sort()).toEqual([
      "SENSOR_UNVALIDATED",
      "SENSOR_UNVALIDATED",
    ]);
    expect(first.candidates.every((candidate) => candidate.severity === "info")).toBe(true);

    const second = evaluateFrame(frame(), first.state, DEFAULT_THRESHOLDS, NOW + 1000);
    expect(second.candidates).toHaveLength(0);
  });

  it("reports an unavailable sensor once per loss episode", () => {
    const unavailable = frame({
      optical: { status: "unavailable", red: null, ir: null, samples: 0 },
    });

    const first = evaluateFrame(unavailable, initialAlertState(), DEFAULT_THRESHOLDS, NOW);
    const unavailableAlerts = first.candidates.filter(
      (candidate) => candidate.code === "SENSOR_UNAVAILABLE",
    );
    expect(unavailableAlerts).toHaveLength(1);
    expect(unavailableAlerts[0]).toMatchObject({
      sensor: "optical",
      severity: "warning",
    });

    const repeated = evaluateFrame(unavailable, first.state, DEFAULT_THRESHOLDS, NOW + 1000);
    expect(
      repeated.candidates.filter((candidate) => candidate.code === "SENSOR_UNAVAILABLE"),
    ).toHaveLength(0);

    const recovered = evaluateFrame(frame(), repeated.state, DEFAULT_THRESHOLDS, NOW + 2000);
    const lostAgain = evaluateFrame(
      unavailable,
      recovered.state,
      DEFAULT_THRESHOLDS,
      NOW + 3000,
    );
    expect(lostAgain.candidates[0]?.code).toBe("SENSOR_UNAVAILABLE");
  });

  it("does not hide healthy sensors when another fails", () => {
    const result = evaluateFrame(
      frame({
        optical: { status: "unavailable", red: null, ir: null, samples: 0 },
        temperature: { status: "ok", valueC: 36.5 },
        imu: { status: "ok", accelG: [0, 0, 1], gyroDps: [0, 0, 0] },
      }),
      initialAlertState(),
      DEFAULT_THRESHOLDS,
      NOW,
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].sensor).toBe("optical");
    expect(result.state.unavailable.optical).toBe(true);
    expect(result.state.unavailable.temperature).toBe(false);
  });

  it("raises one raw-count alert per cooldown, never a clinical claim", () => {
    const high = frame({
      optical: { status: "ok", red: 260000, ir: 240000, samples: 20 },
    });

    const first = evaluateFrame(high, initialAlertState(), DEFAULT_THRESHOLDS, NOW);
    const outOfRange = first.candidates.find(
      (candidate) => candidate.code === "OPTICAL_OUT_OF_RANGE",
    );
    expect(outOfRange).toBeDefined();

    const withinCooldown = evaluateFrame(
      high,
      first.state,
      DEFAULT_THRESHOLDS,
      NOW + 1000,
    );
    expect(
      withinCooldown.candidates.find((c) => c.code === "OPTICAL_OUT_OF_RANGE"),
    ).toBeUndefined();

    const afterCooldown = evaluateFrame(
      high,
      withinCooldown.state,
      DEFAULT_THRESHOLDS,
      NOW + DEFAULT_THRESHOLDS.repeatCooldownMs,
    );
    expect(
      afterCooldown.candidates.find((c) => c.code === "OPTICAL_OUT_OF_RANGE"),
    ).toBeDefined();
  });

  it("only applies temperature bounds when the driver is validated", () => {
    const unvalidatedHigh = frame({
      temperature: { status: "unvalidated", valueC: null },
    });
    const noTemperatureAlert = evaluateFrame(
      unvalidatedHigh,
      initialAlertState(),
      DEFAULT_THRESHOLDS,
      NOW,
    );
    expect(
      noTemperatureAlert.candidates.some((c) => c.code === "TEMPERATURE_OUT_OF_RANGE"),
    ).toBe(false);

    const validatedHigh = frame({
      temperature: { status: "ok", valueC: 41.5 },
    });
    const alert = evaluateFrame(
      validatedHigh,
      initialAlertState(),
      DEFAULT_THRESHOLDS,
      NOW,
    );
    expect(alert.candidates.some((c) => c.code === "TEMPERATURE_OUT_OF_RANGE")).toBe(true);
  });

  it("does not raise alerts for a healthy validated frame", () => {
    const result = evaluateFrame(
      frame({
        temperature: { status: "ok", valueC: 36.5 },
        imu: { status: "ok", accelG: [0, 0, 1], gyroDps: [0, 0, 0] },
      }),
      initialAlertState(),
      DEFAULT_THRESHOLDS,
      NOW,
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("never claims a diagnosis or an emergency", () => {
    const unavailable = frame({
      optical: { status: "unavailable", red: null, ir: null, samples: 0 },
      temperature: { status: "error", valueC: null },
      imu: { status: "error", accelG: null, gyroDps: null },
    });
    const result = evaluateFrame(unavailable, initialAlertState(), DEFAULT_THRESHOLDS, NOW);

    const text = result.candidates.map((c) => `${c.title} ${c.message}`).join(" ").toLowerCase();
    expect(text).not.toMatch(/diagnos/);
    expect(text).not.toMatch(/emergency/);
    expect(text).not.toMatch(/heart rate|spo2/);
  });
});

describe("evaluateFreshness", () => {
  it("raises one stale alert per episode and clears on recovery", () => {
    const first = evaluateFreshness(
      NOW - 10_000,
      NOW,
      initialAlertState(),
      DEFAULT_THRESHOLDS,
      true,
    );
    expect(first.candidates).toHaveLength(1);
    expect(first.candidates[0].code).toBe("DATA_STALE");
    expect(first.state.stale).toBe(true);

    const repeated = evaluateFreshness(
      NOW - 11_000,
      NOW,
      first.state,
      DEFAULT_THRESHOLDS,
      true,
    );
    expect(repeated.candidates).toHaveLength(0);

    const recovered = evaluateFreshness(
      NOW,
      NOW,
      repeated.state,
      DEFAULT_THRESHOLDS,
      true,
    );
    expect(recovered.state.stale).toBe(false);
    expect(recovered.candidates).toHaveLength(0);

    const staleAgain = evaluateFreshness(
      NOW - 20_000,
      NOW,
      recovered.state,
      DEFAULT_THRESHOLDS,
      true,
    );
    expect(staleAgain.candidates).toHaveLength(1);
  });

  it("does not claim staleness while not streaming", () => {
    const result = evaluateFreshness(
      NOW - 60_000,
      NOW,
      initialAlertState(),
      DEFAULT_THRESHOLDS,
      false,
    );
    expect(result.candidates).toHaveLength(0);
  });

  it("does not claim staleness before any data arrives", () => {
    const result = evaluateFreshness(
      null,
      NOW,
      initialAlertState(),
      DEFAULT_THRESHOLDS,
      true,
    );
    expect(result.candidates).toHaveLength(0);
  });
});
