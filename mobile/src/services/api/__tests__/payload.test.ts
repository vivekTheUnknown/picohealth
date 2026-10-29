import { toBackendMeasurement } from "@/services/api/payload";
import type { MeasurementRecord } from "@/types/health";

function record(overrides: Partial<MeasurementRecord> = {}): MeasurementRecord {
  return {
    id: "m_1",
    receivedAt: 1_700_000_000_000,
    uptimeMs: 42_000,
    sequence: 7,
    flags: 0x3f,
    optical: { status: "ok", red: 12345, ir: 11780, samples: 18 },
    temperature: { status: "ok", valueC: 36.5 },
    imu: { status: "ok", accelG: [0.02, -0.01, 1], gyroDps: [1, -2, 3] },
    source: "live",
    uploaded: false,
    uploadedAt: null,
    ...overrides,
  };
}

describe("toBackendMeasurement", () => {
  it("sends valid values and metadata", () => {
    const payload = toBackendMeasurement(record(), { patientId: 3, deviceId: "PicoHealth-DEV" });

    expect(payload).toEqual({
      patient_id: 3,
      device_id: "PicoHealth-DEV",
      uptime_ms: 42_000,
      sensor_flags: 0x3f,
      temperature_c: 36.5,
      red_raw: 12345,
      ir_raw: 11780,
      accel_g: [0.02, -0.01, 1],
      gyro_dps: [1, -2, 3],
      optical_samples: 18,
      client_measurement_id: "m_1",
    });
  });

  it("never substitutes zero for unavailable or unvalidated values", () => {
    const payload = toBackendMeasurement(
      record({
        temperature: { status: "unvalidated", valueC: null },
        optical: { status: "unavailable", red: null, ir: null, samples: 0 },
        imu: { status: "unvalidated", accelG: null, gyroDps: null },
        flags: 0x08 | 0x20,
      }),
      { patientId: 1, deviceId: "PicoHealth-DEV" },
    );

    expect(payload.temperature_c).toBeNull();
    expect(payload.red_raw).toBeNull();
    expect(payload.ir_raw).toBeNull();
    expect(payload.accel_g).toBeNull();
    expect(payload.gyro_dps).toBeNull();
    expect(payload.optical_samples).toBe(0);
    // Flags are still reported so the backend can see why values are missing.
    expect(payload.sensor_flags).toBe(0x28);
  });

  it("sends a genuine zero rather than treating it as missing", () => {
    const payload = toBackendMeasurement(
      record({
        temperature: { status: "ok", valueC: 0 },
        optical: { status: "ok", red: 0, ir: 0, samples: 1 },
        imu: { status: "ok", accelG: [0, 0, 0], gyroDps: [0, 0, 0] },
      }),
      { patientId: 1, deviceId: "PicoHealth-DEV" },
    );

    expect(payload.temperature_c).toBe(0);
    expect(payload.red_raw).toBe(0);
    expect(payload.accel_g).toEqual([0, 0, 0]);
  });

  it("drops raw optical counts when the sensor is unvalidated", () => {
    const payload = toBackendMeasurement(
      record({
        optical: { status: "unvalidated", red: 999, ir: 888, samples: 4 },
      }),
      { patientId: 1, deviceId: "PicoHealth-DEV" },
    );

    expect(payload.red_raw).toBeNull();
    expect(payload.ir_raw).toBeNull();
    expect(payload.optical_samples).toBe(0);
  });

  it("keeps the local id for future server-side idempotency", () => {
    const payload = toBackendMeasurement(record({ id: "abc" }), {
      patientId: 1,
      deviceId: "PicoHealth-DEV",
    });
    expect(payload.client_measurement_id).toBe("abc");
  });
});
