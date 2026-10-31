/**
 * LM75A temperature decoding, performed in the app.
 *
 * The firmware sends the raw 16-bit temperature register. The LM75A has no
 * identification register, so the app documents the basis for this decoder:
 * 11-bit two's-complement value in bits 15..5, 0.125 °C per LSB.
 */
export const LM75A_MIN_C = -55;
export const LM75A_MAX_C = 125;
export const LM75A_RESOLUTION_C = 0.125;

export interface TemperatureResult {
  raw: number;
  valueC: number | null;
  valid: boolean;
  status: "ok" | "error" | "unavailable";
  reason?: string;
}

export function decodeLm75a(raw: number): TemperatureResult {
  if (!Number.isInteger(raw) || raw < 0 || raw > 0xffff) {
    return {
      raw,
      valueC: null,
      valid: false,
      status: "error",
      reason: "Raw temperature register is not a 16-bit unsigned value.",
    };
  }

  const shifted = (raw >> 5) & 0x7ff; // 11 bits
  const signed = shifted & 0x400 ? shifted - 0x800 : shifted;
  const valueC = Number((signed * LM75A_RESOLUTION_C).toFixed(3));

  if (valueC < LM75A_MIN_C || valueC > LM75A_MAX_C) {
    return {
      raw,
      valueC,
      valid: false,
      status: "error",
      reason: `Decoded value ${valueC} °C is outside the LM75A range.`,
    };
  }

  return { raw, valueC, valid: true, status: "ok" };
}
