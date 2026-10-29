import {
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
    expect(() => parseNotification(packet)).toThrow(/allows 16/);
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
