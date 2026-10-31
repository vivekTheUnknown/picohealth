import {
  parseRawPayload,
  isRawPayload,
  RAW_TYPE_JSON,
  RAW_TYPE_OPTICAL,
} from "@/features/sensors/rawProtocol";

const utf8 = (value: unknown): Uint8Array =>
  Uint8Array.from(Buffer.from(JSON.stringify(value), "utf8"));

function jsonPayload(value: unknown): Uint8Array {
  const body = utf8(value);
  const payload = new Uint8Array(body.length + 1);
  payload[0] = RAW_TYPE_JSON;
  payload.set(body, 1);
  return payload;
}

function opticalPayload(
  firstMs: number,
  rateHz: number,
  samples: Array<[number, number]>,
): Uint8Array {
  const payload = new Uint8Array(9 + samples.length * 8);
  payload[0] = RAW_TYPE_OPTICAL;
  payload[1] = (samples.length >> 8) & 0xff;
  payload[2] = samples.length & 0xff;
  payload[3] = (firstMs >>> 24) & 0xff;
  payload[4] = (firstMs >>> 16) & 0xff;
  payload[5] = (firstMs >>> 8) & 0xff;
  payload[6] = firstMs & 0xff;
  payload[7] = (rateHz >> 8) & 0xff;
  payload[8] = rateHz & 0xff;
  samples.forEach(([red, ir], index) => {
    const offset = 9 + index * 8;
    payload[offset] = (red >>> 24) & 0xff;
    payload[offset + 1] = (red >>> 16) & 0xff;
    payload[offset + 2] = (red >>> 8) & 0xff;
    payload[offset + 3] = red & 0xff;
    payload[offset + 4] = (ir >>> 24) & 0xff;
    payload[offset + 5] = (ir >>> 16) & 0xff;
    payload[offset + 6] = (ir >>> 8) & 0xff;
    payload[offset + 7] = ir & 0xff;
  });
  return payload;
}

describe("raw protocol v3", () => {
  it("parses a raw temperature message", () => {
    expect(
      parseRawPayload(
        jsonPayload({ v: 3, type: "temperature_raw", seq: 7, ms: 1234, raw: 8032 }),
      ),
    ).toEqual({ kind: "temperature_raw", seq: 7, ms: 1234, raw: 8032 });
  });

  it("parses raw IMU axes without converting them", () => {
    expect(
      parseRawPayload(
        jsonPayload({
          v: 3,
          type: "imu_raw",
          seq: 8,
          ms: 1300,
          ax: 100,
          ay: -200,
          az: 16384,
          gx: 1,
          gy: 2,
          gz: 3,
        }),
      ),
    ).toEqual({
      kind: "imu_raw",
      seq: 8,
      ms: 1300,
      axes: { ax: 100, ay: -200, az: 16384, gx: 1, gy: 2, gz: 3 },
    });
  });

  it("parses status messages with sensor identity", () => {
    expect(
      parseRawPayload(
        jsonPayload({
          v: 3,
          type: "status",
          seq: 1,
          ms: 100,
          who_am_i: 112,
          temp_addr: 76,
          imu_identity: "mpu6500",
          optical_ready: true,
          temperature_ready: false,
          imu_ready: true,
        }),
      ),
    ).toMatchObject({
      kind: "status",
      whoAmI: 0x70,
      tempAddr: 0x4c,
      imuIdentity: "mpu6500",
      opticalReady: true,
      temperatureReady: false,
    });
  });

  it("parses a binary optical batch", () => {
    const parsed = parseRawPayload(
      opticalPayload(250000, 28, [
        [66967, 78216],
        [67000, 78250],
      ]),
    );
    expect(parsed).toEqual({
      kind: "optical_batch",
      batch: {
        firstMs: 250000,
        rateHz: 28,
        samples: [
          [66967, 78216],
          [67000, 78250],
        ],
      },
    });
  });

  it("accepts a single-sample batch", () => {
    const parsed = parseRawPayload(opticalPayload(0, 25, [[1, 2]]));
    expect(parsed).toMatchObject({ kind: "optical_batch", batch: { rateHz: 25 } });
  });

  it("rejects malformed binary batches", () => {
    expect(parseRawPayload(opticalPayload(0, 0, [[1, 2]]))).toBeNull(); // rate 0
    expect(parseRawPayload(new Uint8Array([RAW_TYPE_OPTICAL, 0, 2, 0, 0, 0, 0, 0, 25]))).toBeNull(); // count 2, no samples
    const truncated = opticalPayload(0, 25, [[1, 2]]).subarray(0, 12);
    expect(parseRawPayload(truncated)).toBeNull();
  });

  it("rejects malformed JSON but reports unknown message types", () => {
    const bad = new Uint8Array([RAW_TYPE_JSON, 0x7b, 0x6e, 0x6f]); // "{no"
    expect(parseRawPayload(bad)).toBeNull();

    const unknown = parseRawPayload(jsonPayload({ v: 3, type: "mystery" }));
    expect(unknown).toEqual({ kind: "unknown", type: "mystery" });
  });

  it("rejects an out-of-range temperature register", () => {
    const parsed = parseRawPayload(
      jsonPayload({ v: 3, type: "temperature_raw", seq: 1, ms: 1, raw: 70000 }),
    );
    expect(parsed).toMatchObject({ kind: "unknown" });
  });

  it("distinguishes raw v3 from legacy payloads", () => {
    expect(isRawPayload(jsonPayload({ v: 3 }))).toBe(true);
    expect(isRawPayload(opticalPayload(0, 25, [[1, 2]]))).toBe(true);
    expect(isRawPayload(Uint8Array.from(Buffer.from('{"v":2}', "utf8")))).toBe(false);
  });
});
