/**
 * PPG analysis for the MAX30102 red/IR stream.
 *
 * This replaces the fixed 4 s Maxim/SparkFun port with a detector designed for
 * the app's 25-30 Hz stream:
 *
 *   1. Remove DC and slow baseline drift with a centred moving average.
 *   2. Low-pass with a short symmetric kernel.
 *   3. Detect systolic extrema with an adaptive threshold and refractory
 *      period. Both polarities are tried, because the optical front end can
 *      invert the plethysmogram.
 *   4. Fall back to normalised autocorrelation when individual peaks are too
 *      noisy to resolve; this recovers heart rate from weak but periodic
 *      signals.
 *   5. Compute SpO2 from a robust per-beat ratio of ratios (median, not mean).
 *   6. Return every plausible interval; the processor accumulates them for a
 *      longer-window PRV.
 *
 * All functions are pure and operate on a resampled, uniform time base.
 */

export interface PpgOptions {
  minHeartRate?: number;
  maxHeartRate?: number;
  minSpo2?: number;
  maxSpo2?: number;
  /** Minimum absolute red/IR correlation for a publishable SpO2. */
  minCorrelation?: number;
  /** Maximum coefficient of variation for accepted beat intervals. */
  maxIntervalCv?: number;
}

export interface PulseInterval {
  /** Beat-to-beat interval in milliseconds. */
  ms: number;
  /** Sample index of the later extremum. */
  endSample: number;
  /** Sample index of the earlier extremum. */
  startSample?: number;
}

export interface PpgAnalysis {
  heartRateBpm: number | null;
  hrValid: boolean;
  spo2Percent: number | null;
  spo2Valid: boolean;
  intervals: PulseInterval[];
  beatCount: number;
  pulseDetected: boolean;
  intervalCv: number | null;
  /** Normalised autocorrelation at the detected period, 0-1. */
  periodicity: number;
  correlation: number | null;
  acIr: number;
  dcIr: number;
  acRed: number;
  dcRed: number;
  perfusionIndexPercent: number | null;
  source: "peaks" | "autocorrelation" | "none";
}

const EPS = 1e-9;
const MIN_INTERVAL_MS = 300;
const MAX_INTERVAL_MS = 2000;

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.min(1, Math.max(0, fraction)) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}

/** Median absolute deviation, a noise estimate that tolerates pulse peaks. */
export function medianAbsoluteDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const centre = median(values);
  return median(values.map((value) => Math.abs(value - centre)));
}

export function pearson(
  first: readonly number[],
  second: readonly number[],
): number | null {
  const length = Math.min(first.length, second.length);
  if (length < 3) return null;
  const meanFirst = mean(first.slice(0, length));
  const meanSecond = mean(second.slice(0, length));
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
  return denominator > EPS ? covariance / denominator : null;
}

/** Centred moving average. Edges use the samples that exist. */
function movingAverage(values: readonly number[], window: number): number[] {
  const length = values.length;
  const width = Math.max(1, Math.min(length, window));
  const prefix = new Array<number>(length + 1).fill(0);
  for (let index = 0; index < length; index += 1) {
    prefix[index + 1] = prefix[index] + values[index];
  }
  const half = Math.floor(width / 2);
  return values.map((_value, index) => {
    const start = Math.max(0, index - half);
    const end = Math.min(length, index + half + 1);
    return (prefix[end] - prefix[start]) / (end - start);
  });
}

/**
 * High-pass by subtracting a ~1.2 s baseline, then a three-point low-pass.
 * At 25 Hz this keeps the 0.5-4 Hz band where a human pulse lives.
 */
export function bandpass(values: readonly number[], hz: number): number[] {
  if (values.length < 3) return [...values];
  const baseline = movingAverage(values, Math.max(3, Math.round(hz * 1.2)));
  const high = values.map((value, index) => value - baseline[index]);
  return high.map((value, index) => {
    const previous = high[Math.max(0, index - 1)];
    const next = high[Math.min(high.length - 1, index + 1)];
    return (previous + 2 * value + next) / 4;
  });
}

/**
 * Parabolic interpolation around each extremum. At 25 Hz a raw peak index only
 * resolves beat timing to 40 ms; interpolating the local parabola recovers a
 * fraction of a sample, which matters for RMSSD.
 */
function refinePeaks(
  signal: readonly number[],
  peaks: readonly number[],
  polarity: 1 | -1,
): number[] {
  const oriented = signal.map((value) => value * polarity);
  return peaks.map((index) => {
    if (index <= 0 || index >= oriented.length - 1) return index;
    const before = oriented[index - 1];
    const centre = oriented[index];
    const after = oriented[index + 1];
    const denominator = before - 2 * centre + after;
    if (Math.abs(denominator) < EPS) return index;
    const offset = (0.5 * (before - after)) / denominator;
    return index + Math.max(-0.5, Math.min(0.5, offset));
  });
}

function intervalsFromPeaks(
  peaks: readonly number[],
  hz: number,
): PulseInterval[] {
  const intervals: PulseInterval[] = [];
  for (let index = 1; index < peaks.length; index += 1) {
    const samples = peaks[index] - peaks[index - 1];
    const ms = (samples * 1000) / hz;
    if (ms >= MIN_INTERVAL_MS && ms <= MAX_INTERVAL_MS) {
      intervals.push({
        ms: Number(ms.toFixed(1)),
        endSample: peaks[index],
        startSample: peaks[index - 1],
      });
    }
  }
  return intervals;
}

export function intervalVariation(intervalsMs: readonly number[]): number | null {
  if (intervalsMs.length < 2) return null;
  const centre = mean(intervalsMs);
  if (centre <= 0) return null;
  const variance =
    intervalsMs.reduce((sum, value) => sum + (value - centre) ** 2, 0) /
    intervalsMs.length;
  return Math.sqrt(variance) / centre;
}

function robustIntervals(intervals: readonly PulseInterval[]): PulseInterval[] {
  if (intervals.length < 2) return [...intervals];
  const middle = median(intervals.map((interval) => interval.ms));
  const kept = intervals.filter(
    (interval) =>
      interval.ms >= middle * 0.65 && interval.ms <= middle * 1.5,
  );
  return kept.length >= 2 ? kept : [...intervals];
}

/**
 * Adaptive extremum detector.
 *
 * `polarity` 1 finds maxima, -1 finds minima. The threshold is relative to the
 * strongest excursion and the upper quartile, so a weak pulse in a quiet
 * window still crosses it. A 280 ms refractory period suppresses dicrotic and
 * noise peaks, keeping the higher candidate when two collide.
 */
export function findPeaks(
  signal: readonly number[],
  hz: number,
  polarity: 1 | -1,
): number[] {
  const length = signal.length;
  if (length < 5) return [];
  const oriented = signal.map((value) => value * polarity);
  const strongest = Math.max(...oriented);
  const upperQuartile = percentile(oriented, 0.75);
  const threshold = Math.max(strongest * 0.22, upperQuartile * 0.3, 0.5);
  const edge = Math.max(1, Math.round(hz * 0.4));
  const refractory = Math.max(2, Math.round(hz * 0.28));
  const peaks: number[] = [];

  for (let index = edge; index < length - edge; index += 1) {
    const value = oriented[index];
    if (value <= threshold) continue;
    if (value < oriented[index - 1] || value < oriented[index + 1]) continue;

    const last = peaks[peaks.length - 1];
    if (last !== undefined && index - last < refractory) {
      if (value > oriented[last]) peaks[peaks.length - 1] = index;
      continue;
    }
    peaks.push(index);
  }
  return peaks;
}

interface AutocorrelationResult {
  lag: number;
  score: number;
}

/**
 * Normalised autocorrelation over plausible pulse lags.
 *
 * When several lags score almost equally (a clean sine), the shortest is
 * chosen so the detector reports the fundamental rate rather than a harmonic.
 */
export function autocorrelationRate(
  signal: readonly number[],
  hz: number,
  minBpm: number,
  maxBpm: number,
): AutocorrelationResult | null {
  const length = signal.length;
  const minLag = Math.max(2, Math.floor((hz * 60) / maxBpm));
  const maxLag = Math.min(length - 2, Math.ceil((hz * 60) / minBpm));
  if (maxLag <= minLag) return null;

  const scores: Array<{ lag: number; score: number }> = [];
  let best = { lag: minLag, score: -1 };
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let numerator = 0;
    let energyFirst = 0;
    let energySecond = 0;
    for (let index = 0; index < length - lag; index += 1) {
      const first = signal[index];
      const second = signal[index + lag];
      numerator += first * second;
      energyFirst += first * first;
      energySecond += second * second;
    }
    const score =
      numerator / Math.sqrt(energyFirst * energySecond + EPS);
    scores.push({ lag, score });
    if (score > best.score) best = { lag, score };
  }

  if (best.score <= 0) return null;
  const chosen =
    scores.find((entry) => entry.score >= best.score * 0.9) ?? best;
  return chosen;
}

interface BeatChoice {
  peaks: number[];
  intervals: PulseInterval[];
  polarity: 1 | -1;
}

function chooseBeats(signal: readonly number[], hz: number): BeatChoice {
  const raw: Array<{ polarity: 1 | -1; peaks: number[] }> = [
    { polarity: 1, peaks: findPeaks(signal, hz, 1) },
    { polarity: -1, peaks: findPeaks(signal, hz, -1) },
  ];
  const candidates: BeatChoice[] = raw.map((candidate) => {
    const peaks = refinePeaks(signal, candidate.peaks, candidate.polarity);
    return {
      ...candidate,
      peaks,
      intervals: intervalsFromPeaks(peaks, hz),
    };
  });

  let best = candidates[0];
  let bestScore = -1;
  for (const candidate of candidates) {
    if (candidate.peaks.length < 2) continue;
    const cv =
      intervalVariation(candidate.intervals.map((interval) => interval.ms)) ??
      1;
    // Prefer more beats, then more regular intervals.
    const score = Math.min(candidate.peaks.length, 14) * (1 / (1 + cv));
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function spo2FromRatio(
  ratio: number,
  minSpo2: number,
  maxSpo2: number,
): number | null {
  // Maxim's empirical curve: -45.060 R^2 + 30.354 R + 94.845.
  const value = -45.06 * ratio * ratio + 30.354 * ratio + 94.845;
  if (!Number.isFinite(value) || value < minSpo2 || value > maxSpo2) {
    return null;
  }
  return Math.round(value);
}

function requiredIntervals(heartRateBpm: number, windowSeconds: number): number {
  const expected = Math.max(
    1,
    Math.round((windowSeconds * heartRateBpm) / 60) - 1,
  );
  return Math.max(2, Math.ceil(expected * 0.6));
}

/**
 * Analyse one uniform window. The window should be at least 4 s; 8-10 s is
 * better because it contains more beats and a more stable autocorrelation.
 */
export function analysePpg(
  ir: readonly number[],
  red: readonly number[],
  hz: number,
  options: PpgOptions = {},
): PpgAnalysis {
  const minHeartRate = options.minHeartRate ?? 30;
  const maxHeartRate = options.maxHeartRate ?? 220;
  const minSpo2 = options.minSpo2 ?? 70;
  const maxSpo2 = options.maxSpo2 ?? 100;
  const minCorrelation = options.minCorrelation ?? 0.5;
  const maxIntervalCv = options.maxIntervalCv ?? 0.2;

  const length = Math.min(ir.length, red.length);
  const irWindow = ir.slice(0, length);
  const redWindow = red.slice(0, length);
  const dcIr = mean(irWindow);
  const dcRed = mean(redWindow);
  const acIr =
    length > 1 ? percentile(irWindow, 0.95) - percentile(irWindow, 0.05) : 0;
  const acRed =
    length > 1 ? percentile(redWindow, 0.95) - percentile(redWindow, 0.05) : 0;
  const perfusionIndexPercent =
    dcIr > 0 ? Number(((acIr / dcIr) * 100).toFixed(2)) : null;

  const filteredIr = bandpass(irWindow, hz);
  const filteredRed = bandpass(redWindow, hz);
  const correlation = pearson(filteredRed, filteredIr);
  const beatChoice = chooseBeats(filteredIr, hz);
  const intervals = robustIntervals(beatChoice.intervals);
  const intervalCv = intervalVariation(intervals.map((entry) => entry.ms));
  const autocorrelation = autocorrelationRate(
    filteredIr,
    hz,
    minHeartRate,
    maxHeartRate,
  );
  const periodicity = Math.max(0, autocorrelation?.score ?? 0);

  let heartRateBpm: number | null = null;
  let hrValid = false;
  let source: PpgAnalysis["source"] = "none";

  const windowSeconds = length / hz;

  if (intervals.length >= 2 && intervalCv !== null) {
    const centre = median(intervals.map((entry) => entry.ms));
    if (centre > 0) {
      heartRateBpm = Math.round(60000 / centre);
      // A periodic artefact often yields only a handful of peaks in a window
      // that should contain many more. Require at least 60% of the beats the
      // reported rate implies.
      const required = requiredIntervals(heartRateBpm, windowSeconds);
      hrValid =
        intervalCv <= maxIntervalCv &&
        periodicity >= 0.25 &&
        Math.abs(correlation ?? 0) >= minCorrelation &&
        intervals.length >= required;
      source = "peaks";
    }
  }

  if (!hrValid && autocorrelation && autocorrelation.score >= 0.5) {
    heartRateBpm = Math.round((hz * 60) / autocorrelation.lag);
    hrValid =
      heartRateBpm >= minHeartRate &&
      heartRateBpm <= maxHeartRate &&
      periodicity >= 0.5 &&
      Math.abs(correlation ?? 0) >= 0.5;
    source = "autocorrelation";
  }

  // Per-beat ratio of ratios, median-filtered.
  const ratios: number[] = [];
  const beatRate =
    intervals.length > 0
      ? 60000 / median(intervals.map((entry) => entry.ms))
      : 0;
  const requiredForSpo2 =
    beatRate > 0 ? requiredIntervals(beatRate, windowSeconds) : Infinity;
  if (
    intervals.length >= 2 &&
    intervals.length >= requiredForSpo2 &&
    intervalCv !== null &&
    intervalCv <= maxIntervalCv &&
    Math.abs(correlation ?? 0) >= minCorrelation
  ) {
    for (const interval of intervals) {
      if (interval.startSample === undefined) continue;
      const start = Math.round(interval.startSample);
      const end = Math.round(interval.endSample);
      if (end <= start) continue;
      const irSlice = irWindow.slice(start, end + 1);
      const redSlice = redWindow.slice(start, end + 1);
      if (irSlice.length < 3) continue;
      const dcIrBeat = mean(irSlice);
      const dcRedBeat = mean(redSlice);
      const acIrBeat = percentile(irSlice, 0.9) - percentile(irSlice, 0.1);
      const acRedBeat = percentile(redSlice, 0.9) - percentile(redSlice, 0.1);
      if (dcIrBeat <= 0 || dcRedBeat <= 0) continue;
      if (acIrBeat < 0.5 || acRedBeat < 0.5) continue;
      const ratio = (acRedBeat / dcRedBeat) / (acIrBeat / dcIrBeat);
      if (Number.isFinite(ratio) && ratio >= 0.1 && ratio <= 4) {
        ratios.push(ratio);
      }
    }
  }

  let spo2Percent: number | null = null;
  let spo2Valid = false;
  if (ratios.length >= 3) {
    const ratio = median(ratios);
    const value = spo2FromRatio(ratio, minSpo2, maxSpo2);
    if (value !== null) {
      spo2Percent = value;
      spo2Valid = true;
    }
  }

  const pulseDetected =
    (intervals.length >= 1 && periodicity >= 0.25) ||
    (autocorrelation !== null && autocorrelation.score >= 0.3);

  return {
    heartRateBpm,
    hrValid,
    spo2Percent,
    spo2Valid,
    intervals,
    beatCount: beatChoice.peaks.length,
    pulseDetected,
    intervalCv,
    periodicity,
    correlation,
    acIr,
    dcIr,
    acRed,
    dcRed,
    perfusionIndexPercent,
    source,
  };
}
