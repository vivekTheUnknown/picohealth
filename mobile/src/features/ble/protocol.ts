import {
  MAX_FRAGMENT_PAYLOAD_BYTES,
  NOTIFICATION_HEADER_BYTES,
  PROTOCOL_FRAME_BYTES,
  type ImuReading,
  type OpticalReading,
  type SensorFrame,
  type SensorStatus,
  type TemperatureReading,
} from "@/types/health";

/**
 * Binary protocol v1, as implemented by `firmware/main.py` and documented in
 * `docs/ble-protocol.md`.
 *
 * This is deliberately NOT the JSON example in the design document: the
 * firmware sends a 28-byte big-endian frame
 * (`>IBhIIhhhhhhB`) in 16-byte fragments, each prefixed with
 * `>HBB` (sequence, fragment index, fragment count). The design document warns
 * against inventing a schema that disagrees with the firmware, so the firmware
 * format is the one implemented.
 */
export type ProtocolErrorCode =
  | "too_short"
  | "bad_length"
  | "bad_header"
  | "bad_fragment"
  | "fragment_timeout"
  | "duplicate_conflict"
  | "too_large"
  | "superseded";

export class ProtocolError extends Error {
  constructor(
    readonly code: ProtocolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProtocolError";
  }
}

export const INVALID_I16 = -32768;
export const INVALID_U32 = 0xffffffff;

export const FLAG_TEMP_VALID = 1 << 0;
export const FLAG_OPTICAL_VALID = 1 << 1;
export const FLAG_IMU_VALID = 1 << 2;
export const FLAG_TEMP_PRESENT = 1 << 3;
export const FLAG_OPTICAL_PRESENT = 1 << 4;
export const FLAG_IMU_PRESENT = 1 << 5;

export interface DecodedFrame {
  uptimeMs: number;
  flags: number;
  optical: OpticalReading;
  temperature: TemperatureReading;
  imu: ImuReading;
}

/**
 * Status is derived from three independent facts: was the sensor present, did
 * the firmware mark the driver valid, and did the values actually arrive.
 * Unavailable data is never replaced with zero.
 */
function statusFor(options: {
  present: boolean;
  valid: boolean;
  hasValues: boolean;
}): SensorStatus {
  if (!options.present) return "unavailable";
  if (!options.valid) return "unvalidated";
  if (!options.hasValues) return "error";
  return "ok";
}

export function decodeFrame(input: Uint8Array): DecodedFrame {
  if (input.byteLength !== PROTOCOL_FRAME_BYTES) {
    throw new ProtocolError(
      "bad_length",
      `Expected a ${PROTOCOL_FRAME_BYTES}-byte frame, received ${input.byteLength}.`,
    );
  }

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);

  const uptimeMs = view.getUint32(0, false);
  const flags = view.getUint8(4);

  const tempRaw = view.getInt16(5, false);
  const redRaw = view.getUint32(7, false);
  const irRaw = view.getUint32(11, false);

  const accelRaw: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    accelRaw.push(view.getInt16(15 + index * 2, false));
  }
  const gyroRaw: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    gyroRaw.push(view.getInt16(21 + index * 2, false));
  }

  const samples = view.getUint8(27);

  const temperatureC =
    tempRaw === INVALID_I16 ? null : Number((tempRaw / 100).toFixed(2));
  const red = redRaw === INVALID_U32 ? null : redRaw;
  const ir = irRaw === INVALID_U32 ? null : irRaw;

  const accelHasValues = accelRaw.every((value) => value !== INVALID_I16);
  const gyroHasValues = gyroRaw.every((value) => value !== INVALID_I16);

  const temperature: TemperatureReading = {
    status: statusFor({
      present: (flags & FLAG_TEMP_PRESENT) !== 0,
      valid: (flags & FLAG_TEMP_VALID) !== 0,
      hasValues: temperatureC !== null,
    }),
    valueC: temperatureC,
  };

  const optical: OpticalReading = {
    status: statusFor({
      present: (flags & FLAG_OPTICAL_PRESENT) !== 0,
      valid: (flags & FLAG_OPTICAL_VALID) !== 0,
      hasValues: red !== null && ir !== null,
    }),
    red,
    ir,
    samples,
  };

  const imu: ImuReading = {
    status: statusFor({
      present: (flags & FLAG_IMU_PRESENT) !== 0,
      valid: (flags & FLAG_IMU_VALID) !== 0,
      hasValues: accelHasValues && gyroHasValues,
    }),
    accelG: accelHasValues
      ? (accelRaw.map((value) => Number((value / 1000).toFixed(4))) as [
          number,
          number,
          number,
        ])
      : null,
    gyroDps: gyroHasValues
      ? (gyroRaw.map((value) => Number((value / 100).toFixed(3))) as [
          number,
          number,
          number,
        ])
      : null,
  };

  return { uptimeMs, flags, optical, temperature, imu };
}

export function toSensorFrame(
  decoded: DecodedFrame,
  options: { receivedAt: number; sequence: number | null; source: "live" | "demo" },
): SensorFrame {
  return {
    ...decoded,
    receivedAt: options.receivedAt,
    sequence: options.sequence,
    source: options.source,
  };
}

export interface FragmentHeader {
  sequence: number;
  index: number;
  count: number;
  payload: Uint8Array;
}

export function parseNotification(bytes: Uint8Array): FragmentHeader {
  if (bytes.byteLength <= NOTIFICATION_HEADER_BYTES) {
    throw new ProtocolError(
      "too_short",
      `Notification has no payload (${bytes.byteLength} bytes).`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sequence = view.getUint16(0, false);
  const index = view.getUint8(2);
  const count = view.getUint8(3);
  const payload = bytes.subarray(NOTIFICATION_HEADER_BYTES);

  if (count < 1 || index >= count) {
    throw new ProtocolError(
      "bad_header",
      `Invalid fragment ${index} of ${count}.`,
    );
  }
  if (payload.byteLength > MAX_FRAGMENT_PAYLOAD_BYTES) {
    throw new ProtocolError(
      "bad_fragment",
      `Fragment carries ${payload.byteLength} bytes; protocol allows ${MAX_FRAGMENT_PAYLOAD_BYTES}.`,
    );
  }

  return { sequence, index, count, payload };
}

const TEST_PREFIX = [0x54, 0x45, 0x53, 0x54, 0x3a]; // "TEST:"

/**
 * The firmware's transport-proof messages (`TEST:0001`) are raw ASCII and do
 * not carry the fragment header. Detecting them separately keeps the binary
 * path honest instead of guessing at a header.
 */
export function readTestMessage(bytes: Uint8Array): string | null {
  if (bytes.byteLength < TEST_PREFIX.length) return null;
  const startsWithPrefix = TEST_PREFIX.every((byte, index) => bytes[index] === byte);
  if (!startsWithPrefix) return null;
  const printable = Array.from(bytes).every((byte) => byte >= 0x20 && byte <= 0x7e);
  // Hermes does not guarantee TextDecoder; these messages are ASCII.
  return printable ? String.fromCharCode(...bytes) : null;
}
