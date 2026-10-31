import {
  directionDegrees,
  dynamicAcceleration,
  integrateYaw,
  magnitude,
  rollPitchFromAccel,
  updateGravity,
  wrapDegrees,
} from "@/features/sensors/orientation";

describe("rollPitchFromAccel", () => {
  it("reads level when gravity is on +Z", () => {
    expect(rollPitchFromAccel([0, 0, 1])).toEqual({ roll: 0, pitch: 0 });
  });

  it("reads 90° roll when gravity is on +Y", () => {
    expect(rollPitchFromAccel([0, 1, 0])).toEqual({ roll: 90, pitch: 0 });
  });

  it("reads -90° pitch when gravity is on +X", () => {
    expect(rollPitchFromAccel([1, 0, 0])).toEqual({ roll: 0, pitch: -90 });
  });
});

describe("integrateYaw", () => {
  it("integrates angular rate over time", () => {
    expect(integrateYaw(0, 90, 1000)).toBe(90);
    expect(integrateYaw(0, -45, 500)).toBe(-22.5);
  });

  it("wraps at ±180°", () => {
    expect(integrateYaw(170, 30, 1000)).toBe(-160);
    expect(integrateYaw(-170, -30, 1000)).toBe(160);
  });

  it("ignores zero, negative and stale intervals", () => {
    expect(integrateYaw(10, 90, 0)).toBe(10);
    expect(integrateYaw(10, 90, -5)).toBe(10);
    expect(integrateYaw(10, 90, 5000)).toBe(10);
  });
});

describe("gravity and dynamic acceleration", () => {
  it("converges to a constant gravity vector", () => {
    let gravity = updateGravity(null, [0, 0, 1]);
    for (let index = 0; index < 200; index += 1) {
      gravity = updateGravity(gravity, [0, 0, 1]);
    }
    expect(gravity[2]).toBeCloseTo(1, 5);
    expect(gravity[0]).toBeCloseTo(0, 5);
  });

  it("reports almost no dynamic acceleration at rest", () => {
    let gravity = updateGravity(null, [0, 0, 1]);
    for (let index = 0; index < 200; index += 1) {
      gravity = updateGravity(gravity, [0, 0, 1]);
    }
    expect(dynamicAcceleration([0, 0, 1], gravity)).toEqual([0, 0, 0]);
  });

  it("separates a lateral push from gravity", () => {
    const gravity = updateGravity(null, [0, 0, 1]);
    const dynamic = dynamicAcceleration([0.4, 0, 1], gravity);
    expect(dynamic[0]).toBeCloseTo(0.4, 3);
    expect(magnitude(dynamic)).toBeCloseTo(0.4, 3);
    expect(directionDegrees(dynamic)).toBe(0);
  });

  it("wraps direction into ±180°", () => {
    expect(wrapDegrees(190)).toBe(-170);
    expect(wrapDegrees(-190)).toBe(170);
  });
});
