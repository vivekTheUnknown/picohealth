import type { OpticalState } from "@/types/health";
import {
  analysePpg,
  intervalVariation as variationOf,
  median,
  pearson,
  percentile,
  type PpgOptions,
} from "@/features/sensors/max30102/ppg";

/**
 * App-side MAX30102 pipeline.
 *
 * The firmware preserves raw paired samples and their order. This module:
 *   - buffers them with a device-relative timestamp,
 *   - resamples the incoming rate (measured at 25-30 Hz) to exactly 25 Hz,
 *   - analyses a trailing 4-10 s window with the adaptive PPG detector,
 *   - accumulates beat intervals for a longer-window PRV,
 *   - applies contact / clipping / motion / pulse-consistency gates.
 *
 * Heart rate and SpO2 keep independent validity. A weak but periodic signal can
 * publish heart rate even when SpO2 is still withheld, and vice versa.
 */
export interface OpticalResult {
  state: OpticalState;
  /** Reflection present at the photodiode. Does not prove a finger. */
  opticalSignalPresent: boolean;
  /** Optical levels and pulsatility are consistent with tissue. */
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

export interface Max30102Options extends PpgOptions {
  targetHz?: number;
  /** Preferred analysis window; the processor uses whatever exists after 4 s. */
  windowSeconds?: number;
  minAnalysisSeconds?: number;
  maxBufferSeconds?: number;
  /** Raw IR DC counts below this are treated as no optical signal. */
  signalMinIr?: number;
  /** Raw IR DC counts below this are not considered tissue contact. */
  contactMinIr?: number;
  /** Peak-to-peak IR counts required before contact is considered likely. */
  contactMinAc?: number;
  /** Dynamic-acceleration RMS (g) above which the window is motion-corrupted. */
  maxMotionRmsG?: number;
  /** Accepted intervals needed before PRV is published. */
  prvMinIntervals?: number;
}

export const FREQ_S = 25;
const CLIP_COUNT = 0x3ffff;
const PRV_MAX_INTERVALS = 100;
const ALGORITHM_VERSION = "max3010x-app-v3";

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
  algorithmVersion: ALGORITHM_VERSION,
  sampleRateHz: 0,
  windowSamples: 0,
  red: null,
  ir: null,
  clipped: false,
  dcLevel: null,
  acAmplitude: null,
};

const round = (value: number, places: number) => Number(value.toFixed(places));

/** Coefficient of variation of beat intervals (std / mean). */
export function intervalVariation(intervalsMs: readonly number[]): number | null {
  const value = variationOf(intervalsMs);
  return value === null ? null : round(value, 3);
}

/** Pearson correlation of two equally sized signals. */
export function channelCorrelation(
  first: readonly number[],
  second: readonly number[],
): number | null {
  const value = pearson(first, second);
  return value === null ? null : round(value, 3);
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

/** Remove ectopic/noise intervals before PRV, without discarding the window. */
function robustRmssd(intervalsMs: readonly number[]): number | null {
  if (intervalsMs.length < 2) return null;
  const centre = median(intervalsMs);
  const kept = intervalsMs.filter(
    (value) => value >= centre * 0.65 && value <= centre * 1.5,
  );
  if (kept.length < 2) return null;
  const cv = intervalVariation(kept);
  // A highly irregular interval set is an artefact, not PRV.
  if (cv === null || cv > 0.2) return null;
  return rmssd(kept);
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
  private readonly minAnalysisSeconds: number;
  private readonly maxBufferSeconds: number;
  private readonly signalMinIr: number;
  private readonly contactMinIr: number;
  private readonly contactMinAc: number;
  private readonly minHeartRate: number;
  private readonly maxHeartRate: number;
  private readonly minSpo2: number;
  private readonly maxSpo2: number;
  private readonly minCorrelation: number;
  private readonly maxIntervalCv: number;
  private readonly maxMotionRmsG: number;
  private readonly prvMinIntervals: number;

  constructor(options: Max30102Options = {}) {
    this.targetHz = options.targetHz ?? FREQ_S;
    this.windowSeconds = options.windowSeconds ?? 10;
    this.minAnalysisSeconds = options.minAnalysisSeconds ?? 4;
    this.maxBufferSeconds = options.maxBufferSeconds ?? 65;
    // Deliberately low: reflection from a table can reach 77k counts, so DC
    // alone is not contact. AC and pulsatility carry the real decision.
    this.signalMinIr = options.signalMinIr ?? 3000;
    this.contactMinIr = options.contactMinIr ?? 2500;
    this.contactMinAc = options.contactMinAc ?? 1.5;
    this.minHeartRate = options.minHeartRate ?? 30;
    this.maxHeartRate = options.maxHeartRate ?? 220;
    this.minSpo2 = options.minSpo2 ?? 70;
    this.maxSpo2 = options.maxSpo2 ?? 100;
    this.minCorrelation = options.minCorrelation ?? 0.5;
    this.maxIntervalCv = options.maxIntervalCv ?? 0.2;
    this.maxMotionRmsG = options.maxMotionRmsG ?? 0.5;
    this.prvMinIntervals = options.prvMinIntervals ?? 12;
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
    const availableMs = last.t - this.buffer[0].t;
    const meanIr = this.meanIr();
    const rawAc = this.rawAc();

    if (availableMs < this.minAnalysisSeconds * 1000) {
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
        acAmplitude: Math.round(rawAc),
      };
      return this.result;
    }

    const analysisSeconds = Math.min(
      this.windowSeconds,
      availableMs / 1000,
    );
    const count = Math.max(
      1,
      Math.round(analysisSeconds * this.targetHz),
    );
    const t0 = last.t - (count - 1) * (1000 / this.targetHz);
    const resampled = this.resample(t0, 1000 / this.targetHz, count);
    const analysis = analysePpg(resampled.ir, resampled.red, this.targetHz, {
      minHeartRate: this.minHeartRate,
      maxHeartRate: this.maxHeartRate,
      minSpo2: this.minSpo2,
      maxSpo2: this.maxSpo2,
      minCorrelation: this.minCorrelation,
      maxIntervalCv: this.maxIntervalCv,
    });

    const dcLevel = analysis.dcIr;
    const acAmplitude = analysis.acIr;
    const opticalSignalPresent = dcLevel >= this.signalMinIr;
    const contactLikely =
      dcLevel >= this.contactMinIr && acAmplitude >= this.contactMinAc;
    const motionCorrupted = this.motionRmsG > this.maxMotionRmsG;
    // Quantisation on a flat signal can look periodic at 1 count. Require a
    // real AC excursion before calling it a pulse.
    const pulseDetected = analysis.pulseDetected && acAmplitude >= 2.5;

    if (
      opticalSignalPresent &&
      contactLikely &&
      !clipped &&
      !motionCorrupted &&
      pulseDetected
    ) {
      this.appendIntervals(analysis.intervals, last.t, count);
    } else if (!opticalSignalPresent) {
      this.intervals = [];
      this.lastIntervalEnd = Number.NEGATIVE_INFINITY;
    }

    const intervalCv = analysis.intervalCv;
    const pulseQualityOk =
      (intervalCv ?? 1) <= this.maxIntervalCv &&
      Math.abs(analysis.correlation ?? 0) >= this.minCorrelation;
    const usable = contactLikely && !clipped && !motionCorrupted;

    const hrValid =
      usable &&
      pulseDetected &&
      pulseQualityOk &&
      analysis.hrValid &&
      analysis.heartRateBpm !== null &&
      analysis.heartRateBpm >= this.minHeartRate &&
      analysis.heartRateBpm <= this.maxHeartRate;

    const spo2Valid =
      usable &&
      pulseDetected &&
      pulseQualityOk &&
      analysis.spo2Valid &&
      analysis.spo2Percent !== null &&
      analysis.spo2Percent >= this.minSpo2 &&
      analysis.spo2Percent <= this.maxSpo2;

    const perfusionIndexPercent =
      opticalSignalPresent && dcLevel > 0
        ? round((acAmplitude / dcLevel) * 100, 2)
        : null;

    const prvValues = this.intervals.map((entry) => entry.ms);
    const prvRmssdMs =
      usable && prvValues.length >= this.prvMinIntervals
        ? robustRmssd(prvValues)
        : null;

    let state: OpticalState;
    let ppgQuality: OpticalResult["ppgQuality"];

    if (!opticalSignalPresent) {
      state = "no_signal";
      ppgQuality = "insufficient";
    } else if (clipped || motionCorrupted) {
      state = "poor_signal";
      ppgQuality = "poor";
    } else if (hrValid || spo2Valid) {
      state = "measurement_valid";
      ppgQuality = "good";
    } else if (pulseDetected && (!contactLikely || !pulseQualityOk)) {
      state = "poor_signal";
      ppgQuality = "poor";
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
      heartRateBpm: hrValid ? analysis.heartRateBpm : null,
      heartRateValid: hrValid,
      spo2Percent: spo2Valid ? analysis.spo2Percent : null,
      spo2Valid,
      perfusionIndexPercent,
      prvRmssdMs,
      prvBeats: prvValues.length,
      algorithmVersion: ALGORITHM_VERSION,
      sampleRateHz: Math.round(batch.rateHz),
      windowSamples: count,
      red: newest[0],
      ir: newest[1],
      clipped,
      dcLevel: Math.round(dcLevel),
      acAmplitude: Math.round(acAmplitude),
    };
    return this.result;
  }

  private appendIntervals(
    intervals: Array<{
      ms: number;
      endSample: number;
      startSample?: number;
    }>,
    windowEndMs: number,
    count: number,
  ): void {
    for (const interval of intervals) {
      const endMs =
        windowEndMs -
        (count - 1 - interval.endSample) * (1000 / this.targetHz);
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

  private rawAc(): number {
    if (this.buffer.length < 2) return 0;
    const values = this.buffer.map((sample) => sample.ir);
    return percentile(values, 0.95) - percentile(values, 0.05);
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
