/**
 * Small, dependency-free runtime guards used by the API normalizers.
 *
 * The backend is being built in parallel, so responses are treated as unknown
 * data. These helpers let us degrade to a neutral "not reported" state instead
 * of throwing on an unexpected shape.
 */

export type UnknownDict = Record<string, unknown>;

export function isDict(value: unknown): value is UnknownDict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asDict(value: unknown): UnknownDict | null {
  return isDict(value) ? value : null;
}

export function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function walk(source: unknown, path: string): unknown {
  const segments = path.split(".");
  let current: unknown = source;
  for (const segment of segments) {
    if (!isDict(current)) return undefined;
    current = current[segment];
  }
  return current;
}

/** Read the first present key from an object (supports dotted paths). */
export function pick(source: unknown, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = walk(source, key);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/** Read the first non-empty string among the given keys. */
export function firstString(source: unknown, keys: string[]): string | null {
  for (const key of keys) {
    const value = asString(walk(source, key));
    if (value !== null) return value;
  }
  return null;
}

/** Read the first finite number among the given keys. */
export function firstNumber(source: unknown, keys: string[]): number | null {
  for (const key of keys) {
    const value = asNumber(walk(source, key));
    if (value !== null) return value;
  }
  return null;
}

/**
 * Find an array either at the root or under one of `keys`.
 * Returns null when no array exists, so callers can distinguish "empty" from
 * "shape not recognised".
 */
export function findArray(source: unknown, keys: string[]): unknown[] | null {
  if (Array.isArray(source)) return source;
  if (!isDict(source)) return null;
  for (const key of keys) {
    const value = walk(source, key);
    if (Array.isArray(value)) return value;
  }
  return null;
}

/** Find an object either at the root or under one of `keys`. */
export function findObject(source: unknown, keys: string[]): unknown {
  if (!isDict(source)) return null;
  for (const key of keys) {
    const value = walk(source, key);
    if (isDict(value)) return value;
  }
  return source;
}

/** Timestamp values are kept as strings; unparseable values become null. */
export function asTimestamp(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return null;
  return raw;
}

/** Safely parse a JSON-encoded column (evidence/settings) into an object. */
export function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (isDict(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isDict(parsed) ? parsed : { value: parsed };
  } catch {
    return null;
  }
}

export function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry : asString(entry)))
    .filter((entry): entry is string => Boolean(entry));
}

export function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Render an unknown value for a technical detail table, without crashing. */
export function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
