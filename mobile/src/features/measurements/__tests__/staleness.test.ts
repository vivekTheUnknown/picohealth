import {
  describeAge,
  describeDuration,
  freshnessFor,
  isHistoryGap,
} from "@/features/measurements/staleness";

describe("freshnessFor", () => {
  const now = 1_000_000;

  it("is live inside the window and stale outside it", () => {
    expect(freshnessFor(now - 1000, now, 5000)).toBe("live");
    expect(freshnessFor(now - 5000, now, 5000)).toBe("live");
    expect(freshnessFor(now - 5001, now, 5000)).toBe("stale");
  });

  it("reports no data when nothing has arrived", () => {
    expect(freshnessFor(null, now, 5000)).toBe("none");
    expect(freshnessFor(0, now, 5000)).toBe("none");
  });

  it("never treats a future timestamp as stale", () => {
    expect(freshnessFor(now + 5000, now, 5000)).toBe("live");
  });
});

describe("describeDuration / describeAge", () => {
  it("formats short and long durations", () => {
    expect(describeDuration(1200)).toBe("just now");
    expect(describeDuration(42_000)).toBe("42 s");
    expect(describeDuration(5 * 60_000)).toBe("5 min");
    expect(describeDuration(3 * 3_600_000)).toBe("3 h");
    expect(describeDuration(2 * 86_400_000)).toBe("2 d");
  });

  it("appends 'ago' only for ages, and handles missing data", () => {
    expect(describeAge(1000, 3000)).toBe("2 s ago");
    expect(describeAge(1000, 1200)).toBe("just now");
    expect(describeAge(null, 3000)).toBe("No data received yet");
  });
});

describe("isHistoryGap", () => {
  it("flags a gap only when it exceeds both the freshness window and 2.5 s", () => {
    expect(isHistoryGap(0, 1000, 5000)).toBe(false);
    expect(isHistoryGap(0, 6000, 5000)).toBe(true);
    // A very short freshness window must not turn normal 1 Hz frames into gaps.
    expect(isHistoryGap(0, 1000, 500)).toBe(false);
    expect(isHistoryGap(0, 3000, 500)).toBe(true);
  });
});
