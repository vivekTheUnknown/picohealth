import { toPortalRecord } from "@/services/api/portal";
import type { MeasurementRecord } from "@/types/health";

function record(overrides: Partial<MeasurementRecord> = {}): MeasurementRecord {
  return {
    id: "m_1",
    receivedAt: 1_700_000_000_000,
    uptimeMs: 42_000,
    sequence: 7,
    flags: 0x3f,
    optical: { status: "ok", red: 12345, ir: 11780, samples: 100 },
    temperature: { status: "ok", valueC: 36.5 },
    imu: { status: "ok", accelG: [0.02, -0.01, 1], gyroDps: [1, -2, 3] },
    source: "live",
    uploaded: false,
    uploadedAt: null,
    ...overrides,
  };
}

describe("toPortalRecord", () => {
  it("maps every metric the app displays", () => {
    const payload = toPortalRecord(
      record({
        heartRateBpm: 72,
        spo2Percent: 97,
        signalQuality: "measurement_valid",
        perfusionIndexPercent: 0.05,
        prvRmssdMs: 31.2,
        prvBeats: 42,
        activityLevel: "still",
        activityRmsG: 0.006,
        orientationClass: "face_down",
        algorithmVersion: "max3010x-app-v2",
        rollDeg: -1.2,
        pitchDeg: 0.6,
        yawDeg: 4,
        lateralG: [0.01, 0, 0],
      }),
      "PicoHealth-DEV",
    );

    expect(payload.client_record_id).toBe("m_1");
    expect(payload.device_hardware_id).toBe("PicoHealth-DEV");
    expect(payload.heart_rate_bpm).toBe(72);
    expect(payload.spo2_percent).toBe(97);
    expect(payload.temperature_c).toBe(36.5);
    expect(payload.perfusion_index_percent).toBe(0.05);
    expect(payload.prv_rmssd_ms).toBe(31.2);
    expect(payload.prv_beats).toBe(42);
    expect(payload.activity_level).toBe("still");
    expect(payload.activity_rms_g).toBe(0.006);
    expect(payload.orientation_class).toBe("face_down");
    expect(payload.signal_quality).toBe("measurement_valid");
    expect(payload.algorithm_version).toBe("max3010x-app-v2");
    expect(payload.extra.roll_deg).toBe(-1.2);
    expect(payload.extra.pitch_deg).toBe(0.6);
    expect(payload.extra.yaw_deg).toBe(4);
    expect(payload.extra.lateral_g).toEqual([0.01, 0, 0]);
    expect(payload.extra.ir_raw).toBe(11780);
  });

  it("sends null rather than a fabricated number when a metric is withheld", () => {
    const payload = toPortalRecord(record({ heartRateBpm: null, spo2Percent: null }), "PicoHealth-DEV");
    expect(payload.heart_rate_bpm).toBeNull();
    expect(payload.spo2_percent).toBeNull();
  });

  it("records the measured time from the phone clock", () => {
    const payload = toPortalRecord(record(), "PicoHealth-DEV");
    expect(payload.measured_at).toBe(new Date(1_700_000_000_000).toISOString());
  });
});
