import { z } from "zod";

import { DEFAULT_STALE_AFTER_MS } from "@/features/measurements/staleness";

/** User preferences. Stored with AsyncStorage; validated on read. */
export interface Settings {
  deviceName: string;
  autoReconnect: boolean;
  staleAfterMs: number;
  backendUrl: string;
  uploadEnabled: boolean;
  retentionDays: number;
  demoMode: boolean;
  opticalMaxCount: number;
  temperatureMinC: number;
  temperatureMaxC: number;
  /** Demo backend patient id; there is no account system in this prototype. */
  patientId: number;
}

export const SETTINGS_STORAGE_KEY = "picohealth.settings.v1";

export const DEFAULT_SETTINGS: Settings = {
  deviceName: "PicoHealth-DEV",
  autoReconnect: true,
  staleAfterMs: DEFAULT_STALE_AFTER_MS,
  backendUrl: "",
  uploadEnabled: false, // opt-in, per §9 and §12
  retentionDays: 30,
  demoMode: false,
  opticalMaxCount: 250000,
  temperatureMinC: 15,
  temperatureMaxC: 40,
  patientId: 1,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return Math.min(max, Math.max(min, rounded));
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Trims, lowercases the scheme check, and rejects anything but http(s). */
export function normalizeBaseUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".local")) return true;
  if (hostname === "127.0.0.1" || hostname === "::1") return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  return false;
}

/**
 * Plain HTTP is only acceptable on a local/private development network. The
 * UI shows a warning even then, and upload stays off until the user opts in.
 */
export function isInsecureRemoteUrl(url: string): boolean {
  const normalized = normalizeBaseUrl(url);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" && !isPrivateHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function normalizeSettings(raw: unknown): Settings {
  const source = asRecord(raw) ?? {};
  const backendUrl = normalizeBaseUrl(
    typeof source.backendUrl === "string" ? source.backendUrl : "",
  );

  const min = asNumber(source.temperatureMinC, DEFAULT_SETTINGS.temperatureMinC, -40, 85);
  const max = asNumber(source.temperatureMaxC, DEFAULT_SETTINGS.temperatureMaxC, -40, 85);

  return {
    deviceName:
      typeof source.deviceName === "string" && source.deviceName.trim().length > 0
        ? source.deviceName.trim().slice(0, 32)
        : DEFAULT_SETTINGS.deviceName,
    autoReconnect: asBoolean(source.autoReconnect, DEFAULT_SETTINGS.autoReconnect),
    staleAfterMs: asInt(source.staleAfterMs, DEFAULT_SETTINGS.staleAfterMs, 2000, 60_000),
    backendUrl: backendUrl ?? "",
    // Upload cannot be enabled without a destination.
    uploadEnabled: backendUrl
      ? asBoolean(source.uploadEnabled, DEFAULT_SETTINGS.uploadEnabled)
      : false,
    retentionDays: asInt(source.retentionDays, DEFAULT_SETTINGS.retentionDays, 1, 365),
    demoMode: asBoolean(source.demoMode, DEFAULT_SETTINGS.demoMode),
    opticalMaxCount: asInt(
      source.opticalMaxCount,
      DEFAULT_SETTINGS.opticalMaxCount,
      1000,
      0x3ffff,
    ),
    temperatureMinC: Math.min(min, max),
    temperatureMaxC: Math.max(min, max),
    patientId: asInt(source.patientId, DEFAULT_SETTINGS.patientId, 1, 1_000_000),
  };
}

/**
 * Runtime validation for the persisted settings payload.
 *
 * Storage can contain data written by an older build or be edited by another
 * tool, so it is parsed rather than trusted. `normalizeSettings` then clamps
 * numeric ranges; zod rejects the wrong shape before that happens.
 */
const storedSettingsSchema = z
  .object({
    deviceName: z.string().max(200).optional(),
    autoReconnect: z.boolean().optional(),
    staleAfterMs: z.number().optional(),
    backendUrl: z.string().max(2000).optional(),
    uploadEnabled: z.boolean().optional(),
    retentionDays: z.number().optional(),
    demoMode: z.boolean().optional(),
    opticalMaxCount: z.number().optional(),
    temperatureMinC: z.number().optional(),
    temperatureMaxC: z.number().optional(),
    patientId: z.number().optional(),
  })
  .passthrough();

export function parseStoredSettings(raw: string): Settings {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }

  const parsed = storedSettingsSchema.safeParse(json);
  return parsed.success ? normalizeSettings(parsed.data) : DEFAULT_SETTINGS;
}
