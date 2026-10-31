/**
 * Port of the Maxim MAXREFDES117 / SparkFun spo2_algorithm.cpp.
 *
 * Source:
 * https://github.com/sparkfun/SparkFun_MAX3010x_Sensor_Library
 * (algorithm.cpp, algorithm.h — MIT licence, Copyright (C) 2016 Maxim
 * Integrated Products, Inc.)
 *
 * The original assumes a 25 Hz sample rate and a 100-sample (4 s) window.
 * The app resamples the 25-28 Hz BLE stream to exactly 25 Hz before calling
 * this function, so the algorithm's timing assumptions are preserved.
 *
 * The signal-processing stages are ported in full: DC removal, 4-point moving
 * average, valley detection, AC/DC ratio of ratios, median filtering and the
 * lookup table. The polynomial is NOT used on its own.
 */

export const FREQ_S = 25;
export const BUFFER_SIZE = FREQ_S * 4; // 100 samples = 4 s
const MA4_SIZE = 4;

/** Approximates -45.060*r^2 + 30.354*r + 94.845, precomputed in the original. */
const SPO2_TABLE: readonly number[] = [
  95, 95, 95, 96, 96, 96, 97, 97, 97, 97, 97, 98, 98, 98, 98, 98, 99, 99, 99, 99,
  99, 99, 99, 99, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
  100, 100, 100, 100, 99, 99, 99, 99, 99, 99, 99, 99, 98, 98, 98, 98, 98, 98, 97, 97,
  97, 97, 96, 96, 96, 96, 95, 95, 95, 94, 94, 94, 93, 93, 93, 92, 92, 92, 91, 91,
  90, 90, 89, 89, 89, 88, 88, 87, 87, 86, 86, 85, 85, 84, 84, 83, 82, 82, 81, 81,
  80, 80, 79, 78, 78, 77, 76, 76, 75, 74, 74, 73, 72, 72, 71, 70, 69, 69, 68, 67,
  66, 66, 65, 64, 63, 62, 62, 61, 60, 59, 58, 57, 56, 56, 55, 54, 53, 52, 51, 50,
  49, 48, 47, 46, 45, 44, 43, 42, 41, 40, 39, 38, 37, 36, 35, 34, 33, 31, 30, 29,
  28, 27, 26, 25, 23, 22, 21, 20, 19, 17, 16, 15, 14, 12, 11, 10, 9, 7, 6, 5,
  3, 2, 1,
];

export interface PulseInterval {
  /** Beat-to-beat interval in milliseconds. */
  ms: number;
  /** Sample index of the later valley, for window-relative timing. */
  endSample: number;
}

export interface Spo2Result {
  spo2: number;
  spo2Valid: boolean;
  heartRate: number;
  hrValid: boolean;
  /** Accepted, plausible intervals from this window (PRV input). */
  intervals: PulseInterval[];
  /** Number of detected valleys before interval filtering. */
  valleyCount: number;
}

const INVALID: Spo2Result = {
  spo2: -999,
  spo2Valid: false,
  heartRate: -999,
  hrValid: false,
  intervals: [],
  valleyCount: 0,
};

/** C integer division truncates toward zero. */
const idiv = (value: number, divisor: number): number => Math.trunc(value / divisor);

function sortAscend(values: number[], length: number): void {
  for (let i = 1; i < length; i += 1) {
    const value = values[i];
    let j = i;
    while (j > 0 && value < values[j - 1]) {
      values[j] = values[j - 1];
      j -= 1;
    }
    values[j] = value;
  }
}

function sortIndicesDescend(x: number[], indices: number[]): void {
  for (let i = 1; i < indices.length; i += 1) {
    const index = indices[i];
    let j = i;
    while (j > 0 && x[index] > x[indices[j - 1]]) {
      indices[j] = indices[j - 1];
      j -= 1;
    }
    indices[j] = index;
  }
}

function peaksAboveMinHeight(x: number[], size: number, minHeight: number): number[] {
  const locations: number[] = [];
  let i = 1;

  while (i < size - 1) {
    if (x[i] > minHeight && x[i] > x[i - 1]) {
      let width = 1;
      while (i + width < size && x[i] === x[i + width]) width += 1;
      if (x[i] > x[i + width] && locations.length < 15) {
        locations.push(i);
        i += width + 1;
      } else {
        i += width;
      }
    } else {
      i += 1;
    }
  }

  return locations;
}

function removeClosePeaks(locations: number[], x: number[], minDistance: number): void {
  sortIndicesDescend(x, locations);
  let count = locations.length;

  for (let i = -1; i < count; i += 1) {
    const previousCount = count;
    count = i + 1;
    for (let j = i + 1; j < previousCount; j += 1) {
      const distance = locations[j] - (i === -1 ? -1 : locations[i]);
      if (distance > minDistance || distance < -minDistance) {
        locations[count] = locations[j];
        count += 1;
      }
    }
  }

  locations.length = count;
  sortAscend(locations, locations.length);
}

function findPeaks(
  x: number[],
  size: number,
  minHeight: number,
  minDistance: number,
  maxNum: number,
): number[] {
  const locations = peaksAboveMinHeight(x, size, minHeight);
  removeClosePeaks(locations, x, minDistance);
  return locations.slice(0, maxNum);
}

/**
 * Calculates heart rate and SpO2 from paired raw red/IR buffers.
 *
 * Both buffers must contain at least 100 samples at 25 Hz. Returns -999 and
 * `false` for any value that could not be validated.
 */
export function maximHeartRateAndSpo2(
  irBuffer: readonly number[],
  redBuffer: readonly number[],
): Spo2Result {
  if (irBuffer.length < BUFFER_SIZE || redBuffer.length < BUFFER_SIZE) {
    return INVALID;
  }

  const anX = new Array<number>(BUFFER_SIZE).fill(0);
  const anY = new Array<number>(BUFFER_SIZE).fill(0);

  // DC mean of IR, then remove DC and invert so the peak detector finds valleys.
  let irMean = 0;
  for (let k = 0; k < BUFFER_SIZE; k += 1) irMean += irBuffer[k];
  irMean = idiv(irMean, BUFFER_SIZE);
  for (let k = 0; k < BUFFER_SIZE; k += 1) anX[k] = -1 * (irBuffer[k] - irMean);

  // 4-point moving average.
  //
  // The reference stops at BUFFER_SIZE - MA4_SIZE, leaving the last four
  // samples unsmoothed. On a sliding window that creates a step at the buffer
  // edge which the peak detector can mistake for a beat. Clamping the indices
  // smooths the tail too; every other stage is unchanged.
  for (let k = 0; k < BUFFER_SIZE; k += 1) {
    const a = anX[k];
    const b = anX[Math.min(k + 1, BUFFER_SIZE - 1)];
    const c = anX[Math.min(k + 2, BUFFER_SIZE - 1)];
    const d = anX[Math.min(k + 3, BUFFER_SIZE - 1)];
    anX[k] = idiv(a + b + c + d, 4);
  }

  let threshold = 0;
  for (let k = 0; k < BUFFER_SIZE; k += 1) threshold += anX[k];
  threshold = idiv(threshold, BUFFER_SIZE);
  if (threshold < 30) threshold = 30;
  if (threshold > 60) threshold = 60;

  const valleys = findPeaks(anX, BUFFER_SIZE, threshold, 4, 15);

  let heartRate = -999;
  let hrValid = false;
  const intervals: PulseInterval[] = [];
  if (valleys.length >= 2) {
    let intervalSum = 0;
    for (let k = 1; k < valleys.length; k += 1) {
      const samples = valleys[k] - valleys[k - 1];
      intervalSum += samples;
      const ms = (samples * 1000) / FREQ_S;
      // Plausible human beat interval: 300 ms (200 bpm) to 2000 ms (30 bpm).
      if (ms >= 300 && ms <= 2000) {
        intervals.push({ ms: Math.round(ms), endSample: valleys[k] });
      }
    }
    const meanInterval = idiv(intervalSum, valleys.length - 1);
    if (meanInterval > 0) {
      heartRate = idiv(FREQ_S * 60, meanInterval);
      hrValid = true;
    }
  }

  // Reload raw values for the ratio-of-ratios calculation.
  for (let k = 0; k < BUFFER_SIZE; k += 1) {
    anX[k] = irBuffer[k];
    anY[k] = redBuffer[k];
  }

  for (const valley of valleys) {
    if (valley > BUFFER_SIZE) return INVALID;
  }

  const ratios = [0, 0, 0, 0, 0];
  let ratioCount = 0;

  for (let k = 0; k < valleys.length - 1; k += 1) {
    let yDcMax = -16777216;
    let xDcMax = -16777216;
    let yDcMaxIndex = 0;
    let xDcMaxIndex = 0;

    if (valleys[k + 1] - valleys[k] <= 3) continue;

    for (let i = valleys[k]; i < valleys[k + 1]; i += 1) {
      if (anX[i] > xDcMax) {
        xDcMax = anX[i];
        xDcMaxIndex = i;
      }
      if (anY[i] > yDcMax) {
        yDcMax = anY[i];
        yDcMaxIndex = i;
      }
    }

    // Red AC, subtracting the linear DC component between the two valleys.
    let yAc = (anY[valleys[k + 1]] - anY[valleys[k]]) * (yDcMaxIndex - valleys[k]);
    yAc = anY[valleys[k]] + idiv(yAc, valleys[k + 1] - valleys[k]);
    yAc = anY[yDcMaxIndex] - yAc;

    // IR AC. The reference implementation indexes an_x with the *red* maximum
    // index here; ported faithfully, and noted as a known reference quirk.
    let xAc = (anX[valleys[k + 1]] - anX[valleys[k]]) * (xDcMaxIndex - valleys[k]);
    xAc = anX[valleys[k]] + idiv(xAc, valleys[k + 1] - valleys[k]);
    xAc = anX[yDcMaxIndex] - xAc;

    const numerator = idiv(yAc * xDcMax, 128);
    const denominator = idiv(xAc * yDcMax, 128);

    if (denominator > 0 && ratioCount < 5 && numerator !== 0) {
      ratios[ratioCount] = idiv(numerator * 100, denominator);
      ratioCount += 1;
    }
  }

  sortAscend(ratios, ratioCount);
  const middle = idiv(ratioCount, 2);
  const ratioAverage =
    middle > 1
      ? idiv(ratios[middle - 1] + ratios[middle], 2)
      : ratios[middle];

  if (ratioAverage > 2 && ratioAverage < 184) {
    return {
      spo2: SPO2_TABLE[ratioAverage],
      spo2Valid: true,
      heartRate,
      hrValid,
      intervals,
      valleyCount: valleys.length,
    };
  }

  return {
    spo2: -999,
    spo2Valid: false,
    heartRate,
    hrValid,
    intervals,
    valleyCount: valleys.length,
  };
}
