/**
 * Orientation and dynamic (lateral) acceleration from the IMU.
 *
 * Roll and pitch come from the gravity vector measured by the accelerometer.
 * Yaw is integrated from the gyroscope and therefore drifts: there is no
 * magnetometer, so it is labelled as an estimate and never treated as an
 * absolute heading.
 */
export type Vec3 = [number, number, number];

const DEG = 180 / Math.PI;
const round = (value: number, places: number) => Number(value.toFixed(places));

export function wrapDegrees(value: number): number {
  const wrapped = (((value + 180) % 360) + 360) % 360 - 180;
  return round(wrapped, 1);
}

export function rollPitchFromAccel(accel: Vec3): { roll: number; pitch: number } {
  const [x, y, z] = accel;
  // Rotating the sensor about X changes Y/Z; about Y changes X/Z.
  const roll = Math.atan2(y, z) * DEG;
  const pitch = Math.atan2(-x, Math.hypot(y, z)) * DEG;
  return { roll: round(roll, 1), pitch: round(pitch, 1) };
}

/** Integrates yaw at the IMU rate. Gaps longer than a second are ignored. */
export function integrateYaw(yaw: number, gzDps: number, dtMs: number): number {
  if (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > 1000) return yaw;
  return wrapDegrees(yaw + (gzDps * dtMs) / 1000);
}

/**
 * Low-pass estimate of gravity. Alpha is per sample; at 20 Hz, 0.05 gives a
 * time constant of roughly one second.
 */
export function updateGravity(
  previous: Vec3 | null,
  accel: Vec3,
  alpha = 0.05,
): Vec3 {
  if (!previous) return [accel[0], accel[1], accel[2]];
  return [
    previous[0] + (accel[0] - previous[0]) * alpha,
    previous[1] + (accel[1] - previous[1]) * alpha,
    previous[2] + (accel[2] - previous[2]) * alpha,
  ];
}

/**
 * Acceleration with the gravity estimate removed.
 *
 * This is the motion/lateral component. True centripetal acceleration also
 * needs the radius of rotation, which a single IMU cannot provide, so the UI
 * labels this as lateral (centripetal-style) acceleration.
 */
export function dynamicAcceleration(accel: Vec3, gravity: Vec3): Vec3 {
  return [
    round(accel[0] - gravity[0], 3),
    round(accel[1] - gravity[1], 3),
    round(accel[2] - gravity[2], 3),
  ];
}

export function magnitude(vector: Vec3): number {
  return round(Math.hypot(vector[0], vector[1], vector[2]), 3);
}

export function directionDegrees(vector: Vec3): number {
  // Angle in the X-Y plane, 0° = +X, counter-clockwise.
  return wrapDegrees((Math.atan2(vector[1], vector[0]) * DEG));
}
