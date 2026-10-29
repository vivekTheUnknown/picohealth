import { base64ToBytes, bytesToBase64, createId } from "@/utils/format";

describe("base64", () => {
  it("decodes known values, including padding", () => {
    expect(Array.from(base64ToBytes("AAECAwQ="))).toEqual([0, 1, 2, 3, 4]);
    expect(Array.from(base64ToBytes("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(base64ToBytes("/w=="))).toEqual([255]);
  });

  it("round-trips arbitrary bytes", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("round-trips every length remainder", () => {
    for (let length = 1; length <= 8; length += 1) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index * 37) % 256);
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it("returns an empty array for an empty string", () => {
    expect(base64ToBytes("")).toHaveLength(0);
  });
});

describe("createId", () => {
  it("is prefixed and unique across calls", () => {
    const first = createId("m");
    const second = createId("m");
    expect(first.startsWith("m_")).toBe(true);
    expect(first).not.toBe(second);
  });
});
