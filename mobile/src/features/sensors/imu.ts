/**
 * IMU raw decoding, performed in the app.
 *
 * The firmware sends raw signed 16-bit axes. Scale factors depend on the
 * configured full-scale ranges and the actual chip:
 *
 *   WHO_AM_I 0x68 -> MPU-6050
 *   WHO_AM_I 0x70 -> MPU-6500 class (confirmed on this hardware)
 *
 * Both use the same default ranges: ±2 g (16384 LSB/g) and ±250 °/s
 * (131 LSB/(°/s)). Anything else is rejected rather than guessed at.
 */
export const ACCEL_LSB_PER_G = 16384;
export const GYRO_LSB_PER_DPS = 131;
export const GRAVITY = 9.80665;

export const IMU_IDENTITIES: Record<number, string> = {
  0x68: "mpu6050",
  0x70: "mpu6500",
};

export interface ImuRawAxes {
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
}

export interface ImuResult {
  valid: boolean;
  identity: string | null;
  accelG: [number, number, number] | null;
  gyroDps: [number, number, number] | null;
  accelMs2: [number, number, number] | null;
  raw: ImuRawAxes;
  reason?: string;
}

const round = (value: number, places: number) => Number(value.toFixed(places));

export function decodeImuRaw(raw: ImuRawAxes, whoAmI: number | null): ImuResult {
  const axes = [raw.ax, raw.ay, raw.az, raw.gx, raw.gy, raw.gz];
  if (axes.some((value) => !Number.isInteger(value) || value < -32768 || value > 32767)) {
    return {
      valid: false,
      identity: null,
      accelG: null,
      gyroDps: null,
      accelMs2: null,
      raw,
      reason: "Axes must be signed 16-bit integers.",
    };
  }

  const identity = whoAmI === null ? null : IMU_IDENTITIES[whoAmI] ?? null;
  if (!identity) {
    return {
      valid: false,
      identity: null,
      accelG: null,
      gyroDps: null,
      accelMs2: null,
      raw,
      reason: `Unrecognised IMU identity ${whoAmI === null ? "unknown" : "0x" + whoAmI.toString(16)}.`,
    };
  }

  const accelG: [number, number, number] = [
    round(raw.ax / ACCEL_LSB_PER_G, 4),
    round(raw.ay / ACCEL_LSB_PER_G, 4),
    round(raw.az / ACCEL_LSB_PER_G, 4),
  ];
  const gyroDps: [number, number, number] = [
    round(raw.gx / GYRO_LSB_PER_DPS, 3),
    round(raw.gy / GYRO_LSB_PER_DPS, 3),
    round(raw.gz / GYRO_LSB_PER_DPS, 3),
  ];

  return {
    valid: true,
    identity,
    accelG,
    gyroDps,
    accelMs2: accelG.map((value) => round(value * GRAVITY, 3)) as [
      number,
      number,
      number,
    ],
    raw,
  };
}

/**
 * Estimates gyroscope bias while the device is stationary.
 *
 * A sample is accepted only when the accelerometer magnitude is close to 1 g
 * and the gyro reading is small. Averaging a window of those samples gives a
 * bias estimate that can be subtracted from future readings.
 */
export class GyroBiasEstimator {
  private readonly samples: Array<[number, number, number]> = [];

  constructor(
    private readonly maxSamples = 200,
    private readonly accelTolerance = 0.08,
    private readonly maxRateDps = 3,
  ) {}

  add(accelG: readonly [number, number, number], gyroDps: readonly [number, number, number]): void {
    if (this.samples.length >= this.maxSamples) return;
    const magnitude = Math.hypot(accelG[0], accelG[1], accelG[2]);
    const still = Math.abs(magnitude - 1) <= this.accelTolerance;
    const slow = gyroDps.every((axis) => Math.abs(axis) <= this.maxRateDps);
    if (!still || !slow) return;
    this.samples.push([gyroDps[0], gyroDps[1], gyroDps[2]]);
  }

  get count(): number {
    return this.samples.length;
  }

  bias(): [number, number, number] | null {
    if (this.samples.length < 25) return null;
    const sum = this.samples.reduce(
      (accumulator, sample) => [
        accumulator[0] + sample[0],
        accumulator[1] + sample[1],
        accumulator[2] + sample[2],
      ],
      [0, 0, 0] as [number, number, number],
    );
    return [
      round(sum[0] / this.samples.length, 3),
      round(sum[1] / this.samples.length, 3),
      round(sum[2] / this.samples.length, 3),
    ];
  }

  apply(gyroDps: readonly [number, number, number]): [number, number, number] {
    const bias = this.bias();
    if (!bias) return [gyroDps[0], gyroDps[1], gyroDps[2]];
    return [
      round(gyroDps[0] - bias[0], 3),
      round(gyroDps[1] - bias[1], 3),
      round(gyroDps[2] - bias[2], 3),
    ];
  }

  reset(): void {
    this.samples.length = 0;
  }
}
