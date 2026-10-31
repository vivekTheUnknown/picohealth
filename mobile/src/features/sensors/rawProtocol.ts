import { z } from "zod";

import type { ImuRawAxes } from "@/features/sensors/imu";
import type { OpticalBatch } from "@/features/sensors/max30102/processor";

/**
 * Protocol v3: raw acquisition.
 *
 * Every reassembled payload begins with a one-byte type:
 *   0x01  UTF-8 JSON control/measurement message
 *   0x02  binary optical batch
 *
 * JSON is used for small messages. The optical batch is binary because a
 * 1-second JSON array of paired samples would be several times larger and
 * exceed the notification budget on a default-MTU link.
 */
export const RAW_TYPE_JSON = 0x01;
export const RAW_TYPE_OPTICAL = 0x02;

const temperatureSchema = z.object({
  v: z.literal(3),
  type: z.literal("temperature_raw"),
  seq: z.number().int(),
  ms: z.number(),
  raw: z.number().int().min(0).max(0xffff),
});

const imuSchema = z.object({
  v: z.literal(3),
  type: z.literal("imu_raw"),
  seq: z.number().int(),
  ms: z.number(),
  ax: z.number().int(),
  ay: z.number().int(),
  az: z.number().int(),
  gx: z.number().int(),
  gy: z.number().int(),
  gz: z.number().int(),
});

const statusSchema = z.object({
  v: z.literal(3),
  type: z.literal("status"),
  seq: z.number().int(),
  ms: z.number(),
  who_am_i: z.number().int().nullable().optional(),
  temp_addr: z.number().int().nullable().optional(),
  imu_identity: z.string().nullable().optional(),
  optical_ready: z.boolean().optional(),
  temperature_ready: z.boolean().optional(),
  imu_ready: z.boolean().optional(),
});

const errorSchema = z.object({
  v: z.literal(3),
  type: z.literal("sensor_error"),
  ms: z.number().optional(),
  sensor: z.string(),
  message: z.string().optional(),
});

const jsonSchema = z.discriminatedUnion("type", [
  temperatureSchema,
  imuSchema,
  statusSchema,
  errorSchema,
]);

export type RawMessage =
  | {
      kind: "temperature_raw";
      raw: number;
      ms: number;
      seq: number;
    }
  | { kind: "imu_raw"; axes: ImuRawAxes; ms: number; seq: number }
  | {
      kind: "status";
      whoAmI: number | null;
      tempAddr: number | null;
      imuIdentity: string | null;
      opticalReady: boolean;
      temperatureReady: boolean;
      imuReady: boolean;
      ms: number;
    }
  | { kind: "sensor_error"; sensor: string; message: string; ms: number }
  | { kind: "optical_batch"; batch: OpticalBatch }
  | { kind: "unknown"; type: string };

function readU16(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 8) | bytes[offset + 1]) >>> 0;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

export function parseRawPayload(bytes: Uint8Array): RawMessage | null {
  if (bytes.length < 2) return null;

  if (bytes[0] === RAW_TYPE_OPTICAL) {
    if (bytes.length < 9) return null;
    const count = readU16(bytes, 1);
    const firstMs = readU32(bytes, 3);
    const rateHz = readU16(bytes, 7);

    if (count === 0 || count > 500 || rateHz < 1 || rateHz > 1000) return null;
    if (bytes.length !== 9 + count * 8) return null;

    const samples: Array<[number, number]> = [];
    for (let index = 0; index < count; index += 1) {
      const offset = 9 + index * 8;
      samples.push([readU32(bytes, offset), readU32(bytes, offset + 4)]);
    }

    return { kind: "optical_batch", batch: { firstMs, rateHz, samples } };
  }

  if (bytes[0] !== RAW_TYPE_JSON) return null;

  let parsed: unknown;
  try {
    // Hermes does not guarantee TextDecoder; the payloads are UTF-8 but all
    // current fields are ASCII (digits, punctuation, sensor names).
    parsed = JSON.parse(String.fromCharCode(...bytes.subarray(1)));
  } catch {
    return null;
  }

  const result = jsonSchema.safeParse(parsed);
  if (!result.success) {
    const type =
      typeof parsed === "object" && parsed !== null && "type" in parsed
        ? String((parsed as { type: unknown }).type)
        : "malformed";
    return { kind: "unknown", type };
  }

  const message = result.data;
  if (message.type === "temperature_raw") {
    return {
      kind: "temperature_raw",
      raw: message.raw,
      ms: message.ms,
      seq: message.seq,
    };
  }
  if (message.type === "imu_raw") {
    return {
      kind: "imu_raw",
      axes: {
        ax: message.ax,
        ay: message.ay,
        az: message.az,
        gx: message.gx,
        gy: message.gy,
        gz: message.gz,
      },
      ms: message.ms,
      seq: message.seq,
    };
  }
  if (message.type === "status") {
    return {
      kind: "status",
      whoAmI: message.who_am_i ?? null,
      tempAddr: message.temp_addr ?? null,
      imuIdentity: message.imu_identity ?? null,
      opticalReady: message.optical_ready ?? false,
      temperatureReady: message.temperature_ready ?? false,
      imuReady: message.imu_ready ?? false,
      ms: message.ms,
    };
  }

  return {
    kind: "sensor_error",
    sensor: message.sensor,
    message: message.message ?? "Sensor error reported by firmware.",
    ms: message.ms ?? Date.now(),
  };
}

export function isRawPayload(bytes: Uint8Array): boolean {
  return bytes.length > 0 && (bytes[0] === RAW_TYPE_JSON || bytes[0] === RAW_TYPE_OPTICAL);
}
