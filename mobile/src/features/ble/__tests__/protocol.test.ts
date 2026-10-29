import { FragmentAssembler, type AssemblyResult } from "@/features/ble/assembler";
import {
  decodeJsonRecord,
  looksLikeJson,
  FLAG_IMU_PRESENT,
  FLAG_IMU_VALID,
  FLAG_OPTICAL_PRESENT,
  FLAG_OPTICAL_VALID,
  FLAG_TEMP_PRESENT,
  FLAG_TEMP_VALID,
  INVALID_I16,
  INVALID_U32,
  ProtocolError,
  decodeFrame,
  parseNotification,
  readTestMessage,
} from "@/features/ble/protocol";
import { buildFrame, fragment } from "@/features/ble/__tests__/fixtures";

describe("decodeFrame", () => {
  it("decodes a fully valid frame", () => {
    const decoded = decodeFrame(buildFrame());

    expect(decoded.uptimeMs).toBe(1000);
    expect(decoded.temperature).toEqual({ status: "ok", valueC: 36.5 });
    expect(decoded.optical).toEqual({
      status: "ok",
      red: 12345,
      ir: 11780,
      samples: 18,
    });
    expect(decoded.imu.status).toBe("ok");
    expect(decoded.imu.accelG).toEqual([0.02, -0.01, 1]);
    expect(decoded.imu.gyroDps).toEqual([1, -2, 3]);
  });

  it("keeps unavailable sensors null instead of zero", () => {
    const decoded = decodeFrame(
      buildFrame({
        flags: 0,
        tempCenti: INVALID_I16,
        red: INVALID_U32,
        ir: INVALID_U32,
        accel: [INVALID_I16, INVALID_I16, INVALID_I16],
        gyro: [INVALID_I16, INVALID_I16, INVALID_I16],
        samples: 0,
      }),
    );

    expect(decoded.temperature).toEqual({ status: "unavailable", valueC: null });
    expect(decoded.optical.red).toBeNull();
    expect(decoded.optical.ir).toBeNull();
    expect(decoded.optical.status).toBe("unavailable");
    expect(decoded.imu.accelG).toBeNull();
    expect(decoded.imu.gyroDps).toBeNull();
    expect(decoded.imu.status).toBe("unavailable");
  });

  it("reports present-but-unverified sensors as unvalidated", () => {
    const decoded = decodeFrame(
      buildFrame({
        flags: FLAG_TEMP_PRESENT | FLAG_IMU_PRESENT | FLAG_OPTICAL_PRESENT | FLAG_OPTICAL_VALID,
        tempCenti: INVALID_I16,
        accel: [INVALID_I16, INVALID_I16, INVALID_I16],
        gyro: [INVALID_I16, INVALID_I16, INVALID_I16],
      }),
    );

    expect(decoded.temperature.status).toBe("unvalidated");
    expect(decoded.temperature.valueC).toBeNull();
    expect(decoded.imu.status).toBe("unvalidated");
    expect(decoded.optical.status).toBe("ok");
  });

  it("treats a valid flag without values as an error, not a measurement", () => {
    const decoded = decodeFrame(
      buildFrame({
        flags: FLAG_TEMP_PRESENT | FLAG_TEMP_VALID | FLAG_IMU_PRESENT | FLAG_IMU_VALID,
        tempCenti: INVALID_I16,
        accel: [INVALID_I16, INVALID_I16, INVALID_I16],
      }),
    );

    expect(decoded.temperature.status).toBe("error");
    expect(decoded.temperature.valueC).toBeNull();
    expect(decoded.imu.status).toBe("error");
  });

  it("rejects a frame of the wrong length", () => {
    expect(() => decodeFrame(new Uint8Array(10))).toThrow(ProtocolError);
    expect(() => decodeFrame(new Uint8Array(10))).toThrow(/28-byte frame/);
  });

  it("does not treat device uptime as wall-clock time", () => {
    const decoded = decodeFrame(buildFrame({ uptimeMs: 0xffffffff }));
    expect(decoded.uptimeMs).toBe(0xffffffff);
  });
});

describe("parseNotification", () => {
  it("reads the sequence and fragment metadata", () => {
    const packets = fragment(buildFrame(), 513);
    const header = parseNotification(packets[0]);

    expect(header.sequence).toBe(513);
    expect(header.index).toBe(0);
    expect(header.count).toBe(2);
    expect(header.payload.length).toBe(16);
  });

  it("rejects an out-of-range fragment index", () => {
    const packet = new Uint8Array(8);
    packet[3] = 2; // count 2
    packet[2] = 2; // index 2 is invalid
    expect(() => parseNotification(packet)).toThrow(/Invalid fragment/);
  });

  it("rejects an oversized fragment payload", () => {
    const packet = new Uint8Array(4 + 32);
    packet[3] = 1;
    expect(() => parseNotification(packet)).toThrow(/allows 20/);
  });

  it("rejects a notification with no payload", () => {
    expect(() => parseNotification(new Uint8Array(4))).toThrow(/no payload/);
  });
});

describe("readTestMessage", () => {
  it("recognises the firmware's transport-proof message", () => {
    const bytes = Uint8Array.from(Buffer.from("TEST:0001", "ascii"));
    expect(readTestMessage(bytes)).toBe("TEST:0001");
  });

  it("does not mistake binary frames for text", () => {
    expect(readTestMessage(buildFrame())).toBeNull();
  });
});

describe("JSON protocol v2", () => {
  const encode = (value: unknown) =>
    Uint8Array.from(Buffer.from(JSON.stringify(value), "utf8"));

  const valid = {
    v: 2,
    seq: 39,
    up: 45316,
    o: { s: "ok", r: 1520, i: 1427, n: 32 },
    t: { s: "unvalidated" },
    i: { s: "unvalidated" },
  };

  it("decodes a valid JSON record", () => {
    const decoded = decodeJsonRecord(encode(valid));
    expect(decoded.uptimeMs).toBe(45316);
    expect(decoded.optical).toEqual({
      status: "ok",
      red: 1520,
      ir: 1427,
      samples: 32,
    });
    expect(decoded.temperature).toEqual({ status: "unvalidated", valueC: null });
    expect(decoded.imu.status).toBe("unvalidated");
    expect(decoded.imu.accelG).toBeNull();
  });

  it("downgrades an ok sensor that sent no values to error", () => {
    const decoded = decodeJsonRecord(
      encode({
        ...valid,
        o: { s: "ok", r: null, i: null, n: 0 },
        t: { s: "ok" },
        i: { s: "ok" },
      }),
    );
    expect(decoded.optical.status).toBe("error");
    expect(decoded.temperature.status).toBe("error");
    expect(decoded.imu.status).toBe("error");
  });

  it("keeps a validated value when status is ok", () => {
    const decoded = decodeJsonRecord(
      encode({
        ...valid,
        t: { s: "ok", c: 36.5 },
        i: { s: "ok", a: [0.01, 0, 1], g: [0, 0, 0] },
      }),
    );
    expect(decoded.temperature).toEqual({ status: "ok", valueC: 36.5 });
    expect(decoded.imu.status).toBe("ok");
    expect(decoded.imu.accelG).toEqual([0.01, 0, 1]);
  });

  it("rejects a different protocol version", () => {
    expect(() => decodeJsonRecord(encode({ ...valid, v: 1 }))).toThrow(
      /protocol v2/,
    );
  });

  it("rejects malformed JSON", () => {
    expect(() => decodeJsonRecord(Uint8Array.from(Buffer.from("{nope")))).toThrow(
      /not valid JSON/,
    );
  });

  it("rejects an unknown sensor status", () => {
    expect(() =>
      decodeJsonRecord(encode({ ...valid, t: { s: "good" } })),
    ).toThrow(/protocol v2/);
  });

  it("distinguishes JSON from binary payloads", () => {
    expect(looksLikeJson(encode(valid))).toBe(true);
    expect(looksLikeJson(Uint8Array.from(Buffer.from("  \n" + JSON.stringify(valid))))).toBe(true);
    expect(looksLikeJson(buildFrame())).toBe(false);
  });

  it("reassembles a multi-fragment JSON record end to end", () => {
    const message = encode(valid);
    const packets = fragment(message, 99, 20);
    const assembler = new FragmentAssembler();

    let result: AssemblyResult | null = null;
    for (const packet of packets) result = assembler.add(packet);

    expect(result?.kind).toBe("complete");
    if (result?.kind !== "complete") return;
    const decoded = decodeJsonRecord(result.bytes);
    expect(decoded.optical.red).toBe(1520);
  });
});

describe("captured device payload", () => {
  // Captured from the Pico over BLE after the v2 firmware rewrite.
  const captured = '{"o": {"i": 1427, "n": 32, "s": "ok", "r": 1520}, "v": 2, "t": {"s": "unvalidated"}, "i": {"s": "unvalidated"}, "seq": 39, "up": 45316}';

  it("parses what the hardware actually sends", () => {
    const decoded = decodeJsonRecord(Uint8Array.from(Buffer.from(captured, "utf8")));
    expect(decoded.uptimeMs).toBe(45316);
    expect(decoded.optical).toEqual({ status: "ok", red: 1520, ir: 1427, samples: 32 });
    expect(decoded.temperature).toEqual({ status: "unvalidated", valueC: null });
    expect(decoded.imu.status).toBe("unvalidated");
  });
});
