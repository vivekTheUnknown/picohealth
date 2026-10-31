import {
  BUFFER_SIZE,
  FREQ_S,
  maximHeartRateAndSpo2,
} from "@/features/sensors/max30102/algorithm";
import type { OpticalState } from "@/types/health";
/**
 * App-side MAX30102 pipeline.
 *
 * The firmware preserves raw paired samples and their order. This module:
 *   - buffers them with a device-relative timestamp,
 *   - resamples the incoming rate (measured at 25-30 Hz) to exactly 25 Hz,
 *   - takes a 4 s window (100 samples) and runs the Maxim/SparkFun algorithm,
 *   - computes the perfusion index and accumulates beat intervals for PRV,
 *   - applies the contact / pulse / quality state machine,
 *   - keeps heart-rate and SpO2 validity independent.
 */
export interface OpticalResult {
  state: OpticalState;
  /** Reflection present at the photodiode. Does not prove a finger. */
  opticalSignalPresent: boolean;
  /** Heuristic: optical levels and pulsatility are consistent with tissue. */
  contactLikely: boolean;
  pulseDetected: boolean;
  ppgQuality: "good" | "fair" | "poor" | "insufficient";
  heartRateBpm: number | null;
  heartRateValid: boolean;
  spo2Percent: number | null;
  spo2Valid: boolean;
  /** PI = 100 * AC_IR / DC_IR, fixed to the IR channel. */
  perfusionIndexPercent: number | null;
  /** PPG-derived PRV (RMSSD), not ECG HRV. */
  prvRmssdMs: number | null;
  prvBeats: number;
  algorithmVersion: string;
  sampleRateHz: number;
  windowSamples: number;
  red: number | null;
  ir: number | null;
  clipped: boolean;
  dcLevel: number | null;
  acAmplitude: number | null;
}

export interface OpticalBatch {
  firstMs: number;
  rateHz: number;
  samples: Array<[number, number]>;
}

export interface Max30102Options {
  targetHz?: number;
  windowSeconds?: number;
  maxBufferSeconds?: number;
  /** Raw IR DC counts below this are treated as no optical signal. */
  signalMinIr?: number;
  /** Raw IR DC counts below this are not considered tissue contact. */
  contactMinIr?: number;
  /** Peak-to-peak IR counts required before contact is considered likely. */
  contactMinAc?: number;
  minHeartRate?: number;
  maxHeartRate?: number;
  minSpo2?: number;
  maxSpo2?: number;
  /** Dynamic-acceleration RMS (g) above which the window is motion-corrupted. */
  maxMotionRmsG?: number;
}

const EMPTY: OpticalResult = {
  state: "verifying_pulse",
  opticalSignalPresent: false,
  contactLikely: false,
  pulseDetected: false,
  ppgQuality: "insufficient",
  heartRateBpm: null,
  heartRateValid: false,
  spo2Percent: null,
  spo2Valid: false,
  perfusionIndexPercent: null,
  prvRmssdMs: null,
  prvBeats: 0,
  algorithmVersion: "max3010x-app-v2",
  sampleRateHz: 0,
  windowSamples: 0,
  red: null,
  ir: null,
  clipped: false,
  dcLevel: null,
  acAmplitude: null,
};

const CLIP_COUNT = 0x3ffff;
const PRV_MIN_INTERVALS = 30;
const PRV_MAX_INTERVALS = 120;

const round = (value: number, places: number) => Number(value.toFixed(places));

/** Coefficient of variation of beat intervals (std / mean). */
export function intervalVariation(intervalsMs: readonly number[]): number | null {
  if (intervalsMs.length < 3) return null;
  const mean =
    intervalsMs.reduce((sum, value) => sum + value, 0) / intervalsMs.length;
  if (mean <= 0) return null;
  const variance =
    intervalsMs.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    intervalsMs.length;
  return round(Math.sqrt(variance) / mean, 3);
}

/** Pearson correlation of two equally sized signals. */
export function channelCorrelation(
  first: readonly number[],
  second: readonly number[],
): number | null {
  const length = Math.min(first.length, second.length);
  if (length < 3) return null;
  const meanFirst = first.slice(0, length).reduce((a, b) => a + b, 0) / length;
  const meanSecond = second.slice(0, length).reduce((a, b) => a + b, 0) / length;
  let covariance = 0;
  let varianceFirst = 0;
  let varianceSecond = 0;
  for (let index = 0; index < length; index += 1) {
    const a = first[index] - meanFirst;
    const b = second[index] - meanSecond;
    covariance += a * b;
    varianceFirst += a * a;
    varianceSecond += b * b;
  }
  const denominator = Math.sqrt(varianceFirst * varianceSecond);
  return denominator > 0 ? round(covariance / denominator, 3) : null;
}

/** RMSSD of beat-to-beat intervals in ms. */
export function rmssd(intervalsMs: readonly number[]): number | null {
  if (intervalsMs.length < 2) return null;
  let sum = 0;
  for (let index = 1; index < intervalsMs.length; index += 1) {
    const difference = intervalsMs[index] - intervalsMs[index - 1];
    sum += difference * difference;
  }
  return round(Math.sqrt(sum / (intervalsMs.length - 1)), 1);
}

export class Max30102Processor {
  private buffer: Array<{ t: number; red: number; ir: number }> = [];
  private intervals: Array<{ endMs: number; ms: number }> = [];
  private lastIntervalEnd = Number.NEGATIVE_INFINITY;
  private motionRmsG = 0;
  private sensorError = false;
  private result: OpticalResult = { ...EMPTY };

  private readonly targetHz: number;
  private readonly windowSeconds: number;
  private readonly maxBufferSeconds: number;
  private readonly signalMinIr: number;
  private readonly contactMinIr: number;
  private readonly contactMinAc: number;
  private readonly minHeartRate: number;
  private readonly maxHeartRate: number;
  private readonly minSpo2: number;
  private readonly maxSpo2: number;
  private readonly maxMotionRmsG: number;

  constructor(options: Max30102Options = {}) {
    this.targetHz = options.targetHz ?? FREQ_S;
    this.windowSeconds = options.windowSeconds ?? 4;
    this.maxBufferSeconds = options.maxBufferSeconds ?? 6;
    this.signalMinIr = options.signalMinIr ?? 3000;
    this.contactMinIr = options.contactMinIr ?? 10_000;
    this.contactMinAc = options.contactMinAc ?? 8;
    this.minHeartRate = options.minHeartRate ?? 30;
    this.maxHeartRate = options.maxHeartRate ?? 220;
    this.minSpo2 = options.minSpo2 ?? 70;
    this.maxSpo2 = options.maxSpo2 ?? 100;
    this.maxMotionRmsG = options.maxMotionRmsG ?? 0.25;
  }

  get latest(): OpticalResult {
    return this.result;
  }

  /** Dynamic-acceleration RMS from the IMU, used to reject motion windows. */
  setMotionRms(rms: number): void {
    this.motionRmsG = Number.isFinite(rms) ? Math.max(0, rms) : 0;
  }

  markSensorError(): void {
    this.sensorError = true;
    this.result = {
      ...this.result,
      state: "sensor_error",
      ppgQuality: "poor",
      heartRateValid: false,
      spo2Valid: false,
      heartRateBpm: null,
      spo2Percent: null,
    };
  }

  reset(): void {
    this.buffer = [];
    this.intervals = [];
    this.lastIntervalEnd = Number.NEGATIVE_INFINITY;
    this.motionRmsG = 0;
    this.sensorError = false;
    this.result = { ...EMPTY };
  }

  addBatch(batch: OpticalBatch): OpticalResult {
    if (
      this.sensorError ||
      !Number.isFinite(batch.rateHz) ||
      batch.rateHz <= 0 ||
      batch.rateHz > 1000 ||
      !Array.isArray(batch.samples) ||
      batch.samples.length === 0
    ) {
      this.markSensorError();
      return this.result;
    }

    const stepMs = 1000 / batch.rateHz;
    for (let index = 0; index < batch.samples.length; index += 1) {
      const [red, ir] = batch.samples[index];
      if (!Number.isFinite(red) || !Number.isFinite(ir) || red < 0 || ir < 0) {
        this.markSensorError();
        return this.result;
      }
      this.buffer.push({ t: batch.firstMs + index * stepMs, red, ir });
    }

    const last = this.buffer[this.buffer.length - 1];
    const cutoff = last.t - this.maxBufferSeconds * 1000;
    while (this.buffer.length > 0 && this.buffer[0].t < cutoff) {
      this.buffer.shift();
    }

    const newest = batch.samples[batch.samples.length - 1];
    const clipped = batch.samples.some(
      ([red, ir]) => red >= CLIP_COUNT || ir >= CLIP_COUNT,
    );
    const windowMs = this.windowSeconds * 1000;
    const meanIr = this.meanIr();

    if (last.t - this.buffer[0].t < windowMs) {
      const opticalSignalPresent = meanIr >= this.signalMinIr;
      this.result = {
        ...EMPTY,
        state: opticalSignalPresent ? "verifying_pulse" : "no_signal",
        opticalSignalPresent,
        sampleRateHz: Math.round(batch.rateHz),
        windowSamples: this.buffer.length,
        red: newest[0],
        ir: newest[1],
        clipped,
        dcLevel: Math.round(meanIr),
      };
      return this.result;
    }

    const t0 = last.t - windowMs;
    const step = 1000 / this.targetHz;
    const resampled = this.resample(t0, step, BUFFER_SIZE);
    const algorithm = maximHeartRateAndSpo2(resampled.ir, resampled.red);

    const resampledDc =
      resampled.ir.reduce((sum, value) => sum + value, 0) / resampled.ir.length;
    const acAmplitude = Math.max(...resampled.ir) - Math.min(...resampled.ir);

    const opticalSignalPresent = resampledDc >= this.signalMinIr;
    const contactLikely =
      resampledDc >= this.contactMinIr && acAmplitude >= this.contactMinAc;
    const motionCorrupted = this.motionRmsG > this.maxMotionRmsG;

    // Intervals are appended once, using an approximate window-relative time.
    if (opticalSignalPresent && !clipped && !motionCorrupted) {
      this.appendIntervals(algorithm.intervals, last.t);
    } else if (!opticalSignalPresent) {
      this.intervals = [];
      this.lastIntervalEnd = Number.NEGATIVE_INFINITY;
    }

    const intervalValues = algorithm.intervals.map((interval) => interval.ms);
    const variation = intervalVariation(intervalValues);
    const correspondence = channelCorrelation(resampled.red, resampled.ir);
    const consistentIntervals =
      intervalValues.length >= 3 && variation !== null && variation <= 0.2;
    const channelsCorrespond =
      correspondence !== null && correspondence >= 0.6;
    const pulseQualityOk = consistentIntervals && channelsCorrespond;

    const usable =
      contactLikely && !clipped && !motionCorrupted && pulseQualityOk;
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

    const pulseDetected = algorithm.valleyCount >= 2 && algorithm.intervals.length > 0;

    const perfusionIndexPercent =
      opticalSignalPresent && resampledDc > 0
        ? round((acAmplitude / resampledDc) * 100, 2)
        : null;

    const prvValues = this.intervals.map((entry) => entry.ms);
    const prvRmssdMs =
      usable && prvValues.length >= PRV_MIN_INTERVALS ? rmssd(prvValues) : null;

    let state: OpticalState;
    let ppgQuality: OpticalResult["ppgQuality"];

    if (!opticalSignalPresent) {
      state = "no_signal";
      ppgQuality = "insufficient";
    } else if (clipped || motionCorrupted) {
      state = "poor_signal";
      ppgQuality = "poor";
    } else if (pulseDetected && !pulseQualityOk) {
      // Periodic artefacts can produce peaks without a coherent pulse.
      state = "poor_signal";
      ppgQuality = "poor";
    } else if (hrValid || spo2Valid) {
      state = "measurement_valid";
      ppgQuality = "good";
    } else if (pulseDetected) {
      state = "pulse_likely";
      ppgQuality = "fair";
    } else {
      state = "signal_present";
      ppgQuality = "fair";
    }

    this.result = {
      state,
      opticalSignalPresent,
      contactLikely,
      pulseDetected,
      ppgQuality,
      heartRateBpm: hrValid ? algorithm.heartRate : null,
      heartRateValid: hrValid,
      spo2Percent: spo2Valid ? algorithm.spo2 : null,
      spo2Valid,
      perfusionIndexPercent,
      prvRmssdMs,
      prvBeats: prvValues.length,
      algorithmVersion: EMPTY.algorithmVersion,
      sampleRateHz: Math.round(batch.rateHz),
      windowSamples: resampled.ir.length,
      red: newest[0],
      ir: newest[1],
      clipped,
      dcLevel: Math.round(resampledDc),
      acAmplitude: Math.round(acAmplitude),
    };
    return this.result;
  }

  private appendIntervals(
    intervals: Array<{ ms: number; endSample: number }>,
    windowEndMs: number,
  ): void {
    for (const interval of intervals) {
      const endMs =
        windowEndMs - (BUFFER_SIZE - 1 - interval.endSample) * (1000 / FREQ_S);
      if (endMs <= this.lastIntervalEnd + 100) continue;
      this.intervals.push({ endMs, ms: interval.ms });
      this.lastIntervalEnd = endMs;
    }
    if (this.intervals.length > PRV_MAX_INTERVALS) {
      this.intervals.splice(0, this.intervals.length - PRV_MAX_INTERVALS);
    }
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
