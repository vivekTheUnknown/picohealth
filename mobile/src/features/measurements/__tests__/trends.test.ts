import { temperatureTrend } from "@/features/measurements/trends";

const NOW = 1_000_000;
const MINUTE = 60_000;

const points = [
  { t: NOW - 10 * MINUTE, temperatureC: 30 },
  { t: NOW - 5 * MINUTE, temperatureC: 30.5 },
  { t: NOW - 2 * MINUTE, temperatureC: 31 },
  { t: NOW, temperatureC: 31.5 },
];

describe("temperatureTrend", () => {
  it("computes delta, rate and average inside the window", () => {
    const trend = temperatureTrend(points, 5 * MINUTE, NOW);
    // The boundary point at exactly -5 min is included.
    expect(trend.samples).toBe(3);
    expect(trend.deltaC).toBe(1);
    expect(trend.ratePerMinC).toBeCloseTo(0.2, 2);
    expect(trend.averageC).toBe(31);
    expect(trend.windowMinutes).toBe(5);
  });

  it("uses all points in a wider window", () => {
    const trend = temperatureTrend(points, 15 * MINUTE, NOW);
    expect(trend.samples).toBe(4);
    expect(trend.deltaC).toBe(1.5);
  });

  it("ignores missing values and points outside the window", () => {
    const trend = temperatureTrend(
      [
        ...points,
        { t: NOW - MINUTE, temperatureC: null },
        { t: NOW - 60 * MINUTE, temperatureC: 20 },
      ],
      5 * MINUTE,
      NOW,
    );
    expect(trend.samples).toBe(3);
  });

  it("returns no delta with fewer than two samples", () => {
    const trend = temperatureTrend(
      [{ t: NOW, temperatureC: 31 }],
      5 * MINUTE,
      NOW,
    );
    expect(trend.deltaC).toBeNull();
    expect(trend.averageC).toBe(31);
  });
});
