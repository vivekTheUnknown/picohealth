import {
  BUFFER_SIZE,
  FREQ_S,
  maximHeartRateAndSpo2,
} from "@/features/sensors/max30102/algorithm";

/** Paired PPG-like buffers at 25 Hz. */
function ppg(options: {
  heartRate?: number;
  dcIr?: number;
  dcRed?: number;
  acIr?: number;
  acRed?: number;
  samples?: number;
  noise?: number;
} = {}): { ir: number[]; red: number[] } {
  const {
    heartRate = 75,
    dcIr = 100000,
    dcRed = 80000,
    acIr = 3000,
    acRed = 1800,
    samples = BUFFER_SIZE,
    noise = 0,
  } = options;

  const ir: number[] = [];
  const red: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const time = index / FREQ_S;
    const phase = 2 * Math.PI * (heartRate / 60) * time;
    const wobble = noise === 0 ? 0 : ((index * 9301 + 49297) % 233280) / 233280 - 0.5;
    ir.push(Math.round(dcIr + acIr * Math.sin(phase) + wobble * noise));
    red.push(Math.round(dcRed + acRed * Math.sin(phase + 0.15) + wobble * noise));
  }
  return { ir, red };
}

describe("maximHeartRateAndSpo2", () => {
  it("requires a full 100-sample window", () => {
    const { ir, red } = ppg({ samples: 60 });
    expect(maximHeartRateAndSpo2(ir, red)).toMatchObject({
      spo2: -999,
      spo2Valid: false,
      heartRate: -999,
      hrValid: false,
      intervals: [],
    });
  });

  it("detects heart rate from a clean pulsatile signal", () => {
    for (const expected of [60, 72, 90, 120]) {
      const { ir, red } = ppg({ heartRate: expected });
      const result = maximHeartRateAndSpo2(ir, red);
      expect(result.hrValid).toBe(true);
      // 25 Hz peak positions quantise to ~4 bpm at low rates.
      expect(Math.abs(result.heartRate - expected)).toBeLessThanOrEqual(6);
    }
  });

  it("produces an SpO2 estimate within a physiological range when valid", () => {
    const { ir, red } = ppg({ heartRate: 75 });
    const result = maximHeartRateAndSpo2(ir, red);
    if (result.spo2Valid) {
      expect(result.spo2).toBeGreaterThanOrEqual(70);
      expect(result.spo2).toBeLessThanOrEqual(100);
    }
  });

  it("marks a flat signal invalid rather than inventing a value", () => {
    const flat = new Array(BUFFER_SIZE).fill(50000);
    const result = maximHeartRateAndSpo2(flat, flat);
    expect(result.hrValid).toBe(false);
    expect(result.spo2Valid).toBe(false);
    expect(result.heartRate).toBe(-999);
    expect(result.spo2).toBe(-999);
  });

  it("tolerates a moderate amount of noise", () => {
    const { ir, red } = ppg({ heartRate: 80, noise: 400 });
    const result = maximHeartRateAndSpo2(ir, red);
    if (result.hrValid) {
      expect(Math.abs(result.heartRate - 80)).toBeLessThanOrEqual(8);
    }
  });
});
