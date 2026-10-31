import { Max30102Processor, type OpticalBatch } from "@/features/sensors/max30102/processor";

/**
 * Builds one second of paired samples at the firmware's measured rate (28 Hz)
 * with a pulsatile component, so the processor exercises its resampler.
 */
function batch(
  firstMs: number,
  options: {
    heartRate?: number;
    dc?: number;
    ac?: number;
    rateHz?: number;
    clip?: boolean;
  } = {},
): OpticalBatch {
  const { heartRate = 72, dc = 70000, ac = 2000, rateHz = 28, clip = false } = options;
  const samples: Array<[number, number]> = [];
  for (let index = 0; index < rateHz; index += 1) {
    const time = (firstMs + (index * 1000) / rateHz) / 1000;
    const phase = 2 * Math.PI * (heartRate / 60) * time;
    const red = clip ? 0x3ffff : Math.round(dc * 0.8 + ac * 0.7 * Math.sin(phase + 0.15));
    const ir = clip ? 0x3ffff : Math.round(dc + ac * Math.sin(phase));
    samples.push([red, ir]);
  }
  return { firstMs, rateHz, samples };
}

describe("Max30102Processor", () => {
  it("reports collecting until a full window exists", () => {
    const processor = new Max30102Processor();
    const result = processor.addBatch(batch(0));
    expect(result.status).toBe("collecting");
    expect(result.contact).toBe(true);
    expect(result.windowSamples).toBe(28);
  });

  it("produces heart rate after four seconds and marks the result valid", () => {
    const processor = new Max30102Processor();
    let result = processor.addBatch(batch(0));
    for (let second = 1; second <= 5; second += 1) {
      result = processor.addBatch(batch(second * 1000));
    }
    expect(result.status).toBe("valid");
    expect(result.heartRateValid).toBe(true);
    expect(result.heartRateBpm).not.toBeNull();
    expect(Math.abs((result.heartRateBpm ?? 0) - 72)).toBeLessThanOrEqual(6);
    expect(result.windowSamples).toBe(100);
  });

  it("reports no_contact when the optical DC level is too low", () => {
    const processor = new Max30102Processor();
    let result = processor.addBatch(batch(0, { dc: 800, ac: 50 }));
    for (let second = 1; second <= 5; second += 1) {
      result = processor.addBatch(batch(second * 1000, { dc: 800, ac: 50 }));
    }
    expect(result.contact).toBe(false);
    expect(result.status).toBe("no_contact");
    expect(result.heartRateValid).toBe(false);
    expect(result.spo2Valid).toBe(false);
  });

  it("reports poor_signal when samples are clipped", () => {
    const processor = new Max30102Processor();
    let result = processor.addBatch(batch(0, { clip: true }));
    for (let second = 1; second <= 5; second += 1) {
      result = processor.addBatch(batch(second * 1000, { clip: true }));
    }
    expect(result.clipped).toBe(true);
    expect(result.status).toBe("poor_signal");
  });

  it("treats malformed batches as a sensor error", () => {
    const processor = new Max30102Processor();
    expect(processor.addBatch({ firstMs: 0, rateHz: 0, samples: [] }).status).toBe(
      "sensor_error",
    );
    expect(
      processor.addBatch({ firstMs: 0, rateHz: 28, samples: [[1, -2]] }).status,
    ).toBe("sensor_error");
  });

  it("keeps the newest raw pair even while collecting", () => {
    const processor = new Max30102Processor();
    const result = processor.addBatch(batch(0));
    expect(result.red).not.toBeNull();
    expect(result.ir).not.toBeNull();
    expect(result.sampleRateHz).toBe(28);
  });
});
