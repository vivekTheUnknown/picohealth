/** Small dependency-free helpers (tested where the logic is non-trivial). */

let counter = 0;

export function createId(prefix: string, now: number = Date.now()): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${now.toString(36)}_${counter.toString(36)}`;
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const BASE64_LOOKUP: Record<string, number> = Object.fromEntries(
  Array.from(BASE64_ALPHABET).map((character, index) => [character, index]),
);

/**
 * Decodes the base64 `value` that react-native-ble-plx returns.
 *
 * Implemented locally because Hermes does not guarantee `atob`, and because a
 * decoder can be unit-tested without a native runtime.
 */
export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, "");
  if (clean.length === 0) return new Uint8Array(0);

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const character of clean) {
    const value = BASE64_LOOKUP[character];
    if (value === undefined) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return Uint8Array.from(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let output = "";
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    output += BASE64_ALPHABET[(chunk >> 18) & 63];
    output += BASE64_ALPHABET[(chunk >> 12) & 63];
    output += BASE64_ALPHABET[(chunk >> 6) & 63];
    output += BASE64_ALPHABET[chunk & 63];
  }
  const remaining = bytes.length - index;
  if (remaining === 1) {
    const chunk = bytes[index] << 16;
    output += BASE64_ALPHABET[(chunk >> 18) & 63];
    output += BASE64_ALPHABET[(chunk >> 12) & 63];
    output += "==";
  } else if (remaining === 2) {
    const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8);
    output += BASE64_ALPHABET[(chunk >> 18) & 63];
    output += BASE64_ALPHABET[(chunk >> 12) & 63];
    output += BASE64_ALPHABET[(chunk >> 6) & 63];
    output += "=";
  }
  return output;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
