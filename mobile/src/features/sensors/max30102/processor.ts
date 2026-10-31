import {
  BUFFER_SIZE,
  FREQ_S,
  maximHeartRateAndSpo2,
} from "@/features/sensors/max30102/algorithm";

/**
 * App-side MAX30102 pipeline.
 *
 * The firmware preserves raw paired samples and their order. This module:
 *   - buffers them with a device-relative timestamp,
 *   - resamples the incoming rate (measured at 25-28 Hz) to exactly 25 Hz,
 *   - takes a 4 s window (100 samples) and runs the Maxim/SparkFun algorithm,
 *   - decides contact and signal quality,
 *   - keeps heart-rate and SpO2 validity separate.
 */
import type { SignalQuality } from "@/types/health";

export type { SignalQuality };

export interface OpticalResult {
  status: SignalQuality;
  contact: boolean;
  heartRateBpm: number | null;
  heartRateValid: boolean;
  spo2Percent: number | null;
  spo2Valid: boolean;
  sampleRateHz: number;
  windowSamples: number;
  red: number | null;
  ir: number | null;
  clipped: boolean;
  /** Mean IR (DC) of the analysis window. */
  dcLevel: number | null;
  /** Peak-to-peak IR (AC) of the analysis window. */
  acAmplitude: number | null;
}

export interface OpticalBatch {
  firstMs: number;
  rateHz: number;
  samples: Array<[number, number]>;
}

export interface Max30102Options {
  /** Algorithm sample rate. The reference implementation assumes 25 Hz. */
  targetHz?: number;
  windowSeconds?: number;
  maxBufferSeconds?: number;
  /** Raw IR DC counts below this are treated as no finger/contact. */
  contactMinIr?: number;
  minHeartRate?: number;
  maxHeartRate?: number;
  minSpo2?: number;
  maxSpo2?: number;
}

const EMPTY: OpticalResult = {
  status: "collecting",
  contact: false,
  heartRateBpm: null,
  heartRateValid: false,
  spo2Percent: null,
  spo2Valid: false,
  sampleRateHz: 0,
  windowSamples: 0,
  red: null,
  ir: null,
  clipped: false,
  dcLevel: null,
  acAmplitude: null,
};

const CLIP_COUNT = 0x3ffff;

export class Max30102Processor {
  private buffer: Array<{ t: number; red: number; ir: number }> = [];
  private result: OpticalResult = { ...EMPTY };

  private readonly targetHz: number;
  private readonly windowSeconds: number;
  private readonly maxBufferSeconds: number;
  private readonly contactMinIr: number;
  private readonly minHeartRate: number;
  private readonly maxHeartRate: number;
  private readonly minSpo2: number;
  private readonly maxSpo2: number;

  constructor(options: Max30102Options = {}) {
    this.targetHz = options.targetHz ?? FREQ_S;
    this.windowSeconds = options.windowSeconds ?? 4;
    this.maxBufferSeconds = options.maxBufferSeconds ?? 6;
    this.contactMinIr = options.contactMinIr ?? 10_000;
    this.minHeartRate = options.minHeartRate ?? 30;
    this.maxHeartRate = options.maxHeartRate ?? 220;
    this.minSpo2 = options.minSpo2 ?? 70;
    this.maxSpo2 = options.maxSpo2 ?? 100;
  }

  get latest(): OpticalResult {
    return this.result;
  }

  reset(): void {
    this.buffer = [];
    this.result = { ...EMPTY };
  }

  /**
   * Adds one batch. Returns the result after this batch: `collecting` until a
   * full 4 s window exists, then a processed estimate with quality state.
   */
  addBatch(batch: OpticalBatch): OpticalResult {
    if (
      !Number.isFinite(batch.rateHz) ||
      batch.rateHz <= 0 ||
      batch.rateHz > 1000 ||
      !Array.isArray(batch.samples) ||
      batch.samples.length === 0
    ) {
      this.result = { ...this.result, status: "sensor_error" };
      return this.result;
    }

    const stepMs = 1000 / batch.rateHz;
    for (let index = 0; index < batch.samples.length; index += 1) {
      const [red, ir] = batch.samples[index];
      if (!Number.isFinite(red) || !Number.isFinite(ir) || red < 0 || ir < 0) {
        this.result = { ...this.result, status: "sensor_error" };
        return this.result;
      }
      this.buffer.push({
        t: batch.firstMs + index * stepMs,
        red,
        ir,
      });
    }

    const last = this.buffer[this.buffer.length - 1];
    const cutoff = last.t - this.maxBufferSeconds * 1000;
    while (this.buffer.length > 0 && this.buffer[0].t < cutoff) {
      this.buffer.shift();
    }

    // Surface the newest pair immediately, even before a window is ready.
    const newest = batch.samples[batch.samples.length - 1];
    const clipped = batch.samples.some(
      ([red, ir]) => red >= CLIP_COUNT || ir >= CLIP_COUNT,
    );

    const windowMs = this.windowSeconds * 1000;
    if (last.t - this.buffer[0].t < windowMs) {
      const meanIr = this.meanIr();
      this.result = {
        ...EMPTY,
        status: "collecting",
        contact: meanIr >= this.contactMinIr,
        red: newest[0],
        ir: newest[1],
        clipped,
        sampleRateHz: Math.round(batch.rateHz),
        windowSamples: this.buffer.length,
        dcLevel: Math.round(meanIr),
      };
      return this.result;
    }

    const t0 = last.t - windowMs;
    const step = 1000 / this.targetHz;
    const resampled = this.resample(t0, step, BUFFER_SIZE);
    const algorithm = maximHeartRateAndSpo2(resampled.ir, resampled.red);

    const meanIr =
      resampled.ir.reduce((sum, value) => sum + value, 0) / resampled.ir.length;
    const acAmplitude =
      Math.max(...resampled.ir) - Math.min(...resampled.ir);
    const contact = meanIr >= this.contactMinIr;

    // A valid-looking ratio is meaningless without contact, and a clipped
    // window is not trustworthy. Both gate publication.
    const usable = contact && !clipped;
    const hrValid =
      usable &&
      algorithm.hrValid &&
      algorithm.heartRate >= this.minHeartRate &&
      algorithm.heartRate <= this.maxHeartRate;
    const spo2Valid =
      usable &&
      algorithm.spo2Valid &&
      algorithm.spo2 >= this.minSpo2 &&
      algorithm.spo2 <= this.maxSpo2;

    let status: SignalQuality;
    if (clipped) status = "poor_signal";
    else if (!contact) status = "no_contact";
    else if (!hrValid && !spo2Valid) status = "poor_signal";
    else status = "valid";

    this.result = {
      status,
      contact,
      heartRateBpm: hrValid ? algorithm.heartRate : null,
      heartRateValid: hrValid,
      spo2Percent: spo2Valid ? algorithm.spo2 : null,
      spo2Valid,
      sampleRateHz: Math.round(batch.rateHz),
      windowSamples: resampled.ir.length,
      red: newest[0],
      ir: newest[1],
      clipped,
      dcLevel: Math.round(meanIr),
      acAmplitude: Math.round(acAmplitude),
    };
    return this.result;
  }

  private meanIr(): number {
    if (this.buffer.length === 0) return 0;
    const sum = this.buffer.reduce((total, sample) => total + sample.ir, 0);
    return sum / this.buffer.length;
  }

  /** Linear interpolation at the algorithm's fixed sample rate. */
  private resample(
    startMs: number,
    stepMs: number,
    count: number,
  ): { red: number[]; ir: number[] } {
    const red: number[] = [];
    const ir: number[] = [];
    let cursor = 0;

    for (let index = 0; index < count; index += 1) {
      const time = startMs + index * stepMs;
      while (
        cursor < this.buffer.length - 1 &&
        this.buffer[cursor + 1].t <= time
      ) {
        cursor += 1;
      }
      const first = this.buffer[cursor];
      const second = this.buffer[Math.min(cursor + 1, this.buffer.length - 1)];
      const span = second.t - first.t;
      const fraction = span > 0 ? (time - first.t) / span : 0;
      red.push(Math.round(first.red + (second.red - first.red) * fraction));
      ir.push(Math.round(first.ir + (second.ir - first.ir) * fraction));
    }

    return { red, ir };
  }
}
