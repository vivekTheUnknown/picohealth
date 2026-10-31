import {
  Max30102Processor,
  rmssd,
  type OpticalBatch,
} from "@/features/sensors/max30102/processor";

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
    expect(result.state).toBe("verifying_pulse");
    expect(result.opticalSignalPresent).toBe(true);
    expect(result.windowSamples).toBe(28);
  });

  it("produces heart rate after four seconds and marks the result valid", () => {
    const processor = new Max30102Processor();
    let result = processor.addBatch(batch(0));
    for (let second = 1; second <= 5; second += 1) {
      result = processor.addBatch(batch(second * 1000));
    }
    expect(result.state).toBe("measurement_valid");
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
    expect(result.contactLikely).toBe(false);
    expect(result.state).toBe("no_signal");
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
    expect(result.state).toBe("poor_signal");
  });

  it("treats malformed batches as a sensor error", () => {
    const processor = new Max30102Processor();
    expect(processor.addBatch({ firstMs: 0, rateHz: 0, samples: [] }).state).toBe(
      "sensor_error",
    );
    expect(
      processor.addBatch({ firstMs: 0, rateHz: 28, samples: [[1, -2]] }).state,
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


describe("derived optical metrics", () => {
  it("computes a perfusion index from IR AC/DC", () => {
    const processor = new Max30102Processor();
    let result = processor.addBatch(batch(0));
    for (let second = 1; second <= 5; second += 1) {
      result = processor.addBatch(batch(second * 1000));
    }
    expect(result.perfusionIndexPercent).not.toBeNull();
    // Generated AC is ~4000 peak-to-peak on ~70000 DC.
    expect(result.perfusionIndexPercent ?? 0).toBeGreaterThan(3);
    expect(result.perfusionIndexPercent ?? 0).toBeLessThan(10);
  });

  it("accumulates beat intervals and reports PRV only with enough beats", () => {
    const processor = new Max30102Processor();
    let result = processor.addBatch(batch(0));
    // 30 seconds of 72 bpm gives ~36 beats, above the 30-interval gate.
    for (let second = 1; second <= 30; second += 1) {
      result = processor.addBatch(batch(second * 1000));
    }
    expect(result.prvBeats).toBeGreaterThanOrEqual(30);
    expect(result.prvRmssdMs).not.toBeNull();
    expect(result.prvRmssdMs ?? 0).toBeLessThan(80);
  });

  it("reports signal_present when light returns but no pulse exists", () => {
    const processor = new Max30102Processor();
    let result = processor.addBatch(batch(0, { dc: 60000, ac: 1 }));
    for (let second = 1; second <= 5; second += 1) {
      result = processor.addBatch(batch(second * 1000, { dc: 60000, ac: 1 }));
    }
    expect(result.opticalSignalPresent).toBe(true);
    expect(result.pulseDetected).toBe(false);
    expect(result.state).toBe("signal_present");
    expect(result.heartRateValid).toBe(false);
    expect(result.spo2Valid).toBe(false);
  });

  it("keeps the algorithm version on every result", () => {
    const processor = new Max30102Processor();
    const result = processor.addBatch(batch(0));
    expect(result.algorithmVersion).toBe("max3010x-app-v2");
  });
});

describe("rmssd", () => {
  it("computes the root mean square of successive differences", () => {
    // Differences: 10, -10, 10 -> squares 100,100,100 -> mean 100 -> 10.
    expect(rmssd([800, 810, 800, 810])).toBe(10);
    expect(rmssd([800])).toBeNull();
  });
});
