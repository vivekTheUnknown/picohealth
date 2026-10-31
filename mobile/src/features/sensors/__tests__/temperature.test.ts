import { decodeLm75a } from "@/features/sensors/temperature";

describe("decodeLm75a", () => {
  // The register holds an 11-bit two's-complement value in bits 15..5.
  const encode = (celsius: number): number => ((Math.round(celsius / 0.125) & 0x7ff) << 5) & 0xffff;

  it("decodes positive temperatures", () => {
    expect(decodeLm75a(encode(31.375))).toMatchObject({
      valueC: 31.375,
      valid: true,
      status: "ok",
    });
    expect(decodeLm75a(encode(25))).toMatchObject({ valueC: 25, valid: true });
  });

  it("decodes negative temperatures with two's complement", () => {
    expect(decodeLm75a(encode(-10.5))).toMatchObject({
      valueC: -10.5,
      valid: true,
    });
  });

  it("rejects non-register values", () => {
    expect(decodeLm75a(70000).status).toBe("error");
    expect(decodeLm75a(-1).status).toBe("error");
    expect(decodeLm75a(12.5).status).toBe("error");
  });

  it("rejects implausible temperatures rather than displaying them", () => {
    const result = decodeLm75a(encode(-60));
    expect(result.valid).toBe(false);
    expect(result.valueC).toBe(-60);
    expect(result.status).toBe("error");
  });
});
