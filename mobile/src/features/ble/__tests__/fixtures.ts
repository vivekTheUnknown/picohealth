/** Builders matching firmware/main.py exactly (28-byte, big-endian). */

export interface FrameOptions {
  uptimeMs?: number;
  flags?: number;
  tempCenti?: number;
  red?: number;
  ir?: number;
  accel?: [number, number, number];
  gyro?: [number, number, number];
  samples?: number;
}

export function buildFrame(options: FrameOptions = {}): Uint8Array {
  const {
    uptimeMs = 1000,
    flags = 0x3f,
    tempCenti = 3650,
    red = 12345,
    ir = 11780,
    accel = [20, -10, 1000],
    gyro = [100, -200, 300],
    samples = 18,
  } = options;

  const buffer = new ArrayBuffer(28);
  const view = new DataView(buffer);
  view.setUint32(0, uptimeMs, false);
  view.setUint8(4, flags);
  view.setInt16(5, tempCenti, false);
  view.setUint32(7, red, false);
  view.setUint32(11, ir, false);
  view.setInt16(15, accel[0], false);
  view.setInt16(17, accel[1], false);
  view.setInt16(19, accel[2], false);
  view.setInt16(21, gyro[0], false);
  view.setInt16(23, gyro[1], false);
  view.setInt16(25, gyro[2], false);
  view.setUint8(27, samples);
  return new Uint8Array(buffer);
}

/** Splits a payload into the firmware's `>HBB` + ≤16-byte notifications. */
export function fragment(
  payload: Uint8Array,
  sequence = 1,
  chunkSize = 16,
): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < payload.length; offset += chunkSize) {
    chunks.push(payload.subarray(offset, offset + chunkSize));
  }
  return chunks.map((chunk, index) => {
    const packet = new Uint8Array(4 + chunk.length);
    packet[0] = (sequence >> 8) & 0xff;
    packet[1] = sequence & 0xff;
    packet[2] = index;
    packet[3] = chunks.length;
    packet.set(chunk, 4);
    return packet;
  });
}

export function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
