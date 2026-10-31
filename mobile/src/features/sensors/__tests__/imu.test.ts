import { GyroBiasEstimator, decodeImuRaw } from "@/features/sensors/imu";

const raw = { ax: 0, ay: 0, az: 16384, gx: 131, gy: -262, gz: 0 };

describe("decodeImuRaw", () => {
  it("converts MPU-6500 raw axes using the default ranges", () => {
    const result = decodeImuRaw(raw, 0x70);
    expect(result.valid).toBe(true);
    expect(result.identity).toBe("mpu6500");
    expect(result.accelG).toEqual([0, 0, 1]);
    expect(result.gyroDps).toEqual([1, -2, 0]);
    expect(result.accelMs2?.[2]).toBeCloseTo(9.807, 2);
  });

  it("accepts MPU-6050 identity with the same defaults", () => {
    expect(decodeImuRaw(raw, 0x68)).toMatchObject({
      valid: true,
      identity: "mpu6050",
    });
  });

  it("refuses to scale values for an unknown identity", () => {
    const result = decodeImuRaw(raw, 0x71);
    expect(result.valid).toBe(false);
    expect(result.accelG).toBeNull();
    expect(result.gyroDps).toBeNull();
    expect(result.reason).toMatch(/Unrecognised/);
  });

  it("rejects out-of-range raw axes", () => {
    expect(decodeImuRaw({ ...raw, ax: 40000 }, 0x70).valid).toBe(false);
    expect(decodeImuRaw({ ...raw, gx: -40000 }, 0x70).valid).toBe(false);
  });
});

describe("GyroBiasEstimator", () => {
  it("does not estimate bias from a moving device", () => {
    const estimator = new GyroBiasEstimator();
    for (let index = 0; index < 100; index += 1) {
      estimator.add([0.9, 0.2, 0.1], [20, 0, 0]);
    }
    expect(estimator.count).toBe(0);
    expect(estimator.bias()).toBeNull();
  });

  it("estimates and subtracts bias when stationary", () => {
    const estimator = new GyroBiasEstimator();
    for (let index = 0; index < 60; index += 1) {
      estimator.add([0, 0, 1], [0.5, -0.25, 0.1]);
    }
    expect(estimator.bias()).toEqual([0.5, -0.25, 0.1]);
    expect(estimator.apply([1, 1, 1])).toEqual([0.5, 1.25, 0.9]);
  });

  it("does not apply a bias before enough stationary samples", () => {
    const estimator = new GyroBiasEstimator();
    estimator.add([0, 0, 1], [0.5, 0, 0]);
    expect(estimator.apply([1, 2, 3])).toEqual([1, 2, 3]);
  });
});
