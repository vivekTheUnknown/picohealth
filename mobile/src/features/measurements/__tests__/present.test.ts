import {
  frameSummary,
  imuValue,
  opticalValue,
  sensorStatus,
  temperatureValue,
} from "@/features/measurements/present";
import type { SensorFrame } from "@/types/health";

const base: SensorFrame = {
  uptimeMs: 1000,
  flags: 0x3f,
  optical: { status: "ok", red: 12345, ir: 11780, samples: 18 },
  temperature: { status: "unvalidated", valueC: null },
  imu: { status: "unvalidated", accelG: null, gyroDps: null },
  receivedAt: 1_000_000,
  source: "live",
  sequence: 1,
};

describe("sensor presentation", () => {
  it("uses explicit labels for every status", () => {
    expect(sensorStatus("ok").label).toBe("Driver verified");
    expect(sensorStatus("unvalidated").label).toBe("Not validated");
    expect(sensorStatus("unavailable").label).toBe("Unavailable");
    expect(sensorStatus("error").label).toBe("Invalid data");
  });

  it("shows raw optical counts and never implies heart rate or SpO₂", () => {
    expect(opticalValue(base)).toBe("R 12,345 · IR 11,780");
    expect(opticalValue({ ...base, optical: { ...base.optical, red: null, ir: null } })).toBe("--");
  });

  it("shows no temperature value when the driver is unvalidated", () => {
    expect(temperatureValue(base)).toBe("-- °C");
    expect(
      temperatureValue({ ...base, temperature: { status: "ok", valueC: 36.5 } }),
    ).toBe("36.50 °C");
  });

  it("shows no IMU axes when the driver is unvalidated", () => {
    expect(imuValue(base)).toBe("Driver not validated");
    expect(
      imuValue({
        ...base,
        imu: { status: "ok", accelG: [0.01, 0.02, 1], gyroDps: [0, 0, 0] },
      }),
    ).toBe("0.01, 0.02, 1.00 g");
  });

  it("shows HR and SpO2 as unavailable rather than inventing values", () => {
    const summary = frameSummary(base);
    expect(summary).toContain("R 12345");
    expect(summary).toContain("Temp -- °C");
    expect(summary).toContain("IMU unverified");
    expect(summary).toContain("HR --");
    expect(summary).toContain("SpO₂ --");
    expect(summary.toLowerCase()).not.toMatch(/diagnos/);
  });

  it("includes derived estimates when they are marked valid", () => {
    const summary = frameSummary({
      ...base,
      heartRateBpm: 72,
      heartRateValid: true,
      spo2Percent: 97,
      spo2Valid: true,
      signalQuality: "measurement_valid",
    });
    expect(summary).toContain("HR 72 bpm");
    expect(summary).toContain("SpO₂ 97%");
  });

  it("marks a missing optical reading as -- rather than zero", () => {
    const summary = frameSummary({
      ...base,
      optical: { status: "unavailable", red: null, ir: null, samples: 0 },
    }).toLowerCase();
    expect(summary).toContain("optical --");
    expect(summary).not.toContain("r 0");
  });
});
