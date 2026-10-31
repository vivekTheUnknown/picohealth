import type { MeasurementRecord } from "@/types/health";

/**
 * Direct sync with the health portal API.
 *
 * The phone authenticates once with an account name and password, keeps the
 * bearer token in secure storage, and posts processed snapshots. Every derived
 * metric is already computed on the phone; the portal stores and displays it.
 */

export interface PortalMe {
  id: string;
  email: string;
  display_name: string;
  patient_id: string | null;
  roles: string[];
}

export interface PortalRecord {
  client_record_id: string;
  measured_at: string;
  device_hardware_id: string | null;
  algorithm_version: string | null;
  signal_quality: string | null;
  heart_rate_bpm: number | null;
  spo2_percent: number | null;
  temperature_c: number | null;
  perfusion_index_percent: number | null;
  prv_rmssd_ms: number | null;
  prv_beats: number | null;
  activity_level: string | null;
  activity_rms_g: number | null;
  orientation_class: string | null;
  extra: Record<string, unknown>;
}

export interface PortalSyncResult {
  ok: boolean;
  status: number | null;
  accepted: number;
  duplicates: number;
  detail: string;
  unauthorized?: boolean;
}

export interface PortalLoginResult {
  ok: boolean;
  detail: string;
  token?: string;
  me?: PortalMe;
}

async function request(
  url: string,
  init: RequestInit,
  timeoutMs = 12_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function baseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body?.error?.message) return body.error.message;
  } catch {
    // Non-JSON error body.
  }
  if (response.status === 401) return "The account name or password was rejected.";
  if (response.status === 403) return "This account is not permitted to sync.";
  return `The portal returned HTTP ${response.status}.`;
}

export async function portalLogin(
  portalUrl: string,
  identifier: string,
  password: string,
): Promise<PortalLoginResult> {
  const url = `${baseUrl(portalUrl)}/api/v1/auth/token`;
  try {
    const response = await request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: identifier.trim(), password }),
    });
    if (!response.ok) {
      return { ok: false, detail: await errorDetail(response) };
    }
    const body = (await response.json()) as { access_token?: string; me?: PortalMe };
    if (!body.access_token || !body.me) {
      return { ok: false, detail: "The portal response did not include a token." };
    }
    return { ok: true, detail: "Connected.", token: body.access_token, me: body.me };
  } catch (error) {
    return {
      ok: false,
      detail:
        error instanceof Error && error.name === "AbortError"
          ? "The portal did not respond in time."
          : "Network error. Check the URL, Wi-Fi, and that the portal is running.",
    };
  }
}

export async function portalMe(
  portalUrl: string,
  token: string,
): Promise<{ ok: boolean; me?: PortalMe; detail: string; unauthorized?: boolean }> {
  try {
    const response = await request(`${baseUrl(portalUrl)}/api/v1/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      return { ok: false, unauthorized: true, detail: "The session has expired." };
    }
    if (!response.ok) {
      return { ok: false, detail: await errorDetail(response) };
    }
    return { ok: true, me: (await response.json()) as PortalMe, detail: "Connected." };
  } catch {
    return { ok: false, detail: "Could not reach the portal." };
  }
}

/** Map one local record to the portal's ingestion contract. */
export function toPortalRecord(
  record: MeasurementRecord,
  deviceHardwareId: string,
): PortalRecord {
  return {
    client_record_id: record.id,
    measured_at: new Date(record.receivedAt).toISOString(),
    device_hardware_id: deviceHardwareId || null,
    algorithm_version: record.algorithmVersion ?? null,
    signal_quality: record.signalQuality ?? null,
    heart_rate_bpm: record.heartRateBpm ?? null,
    spo2_percent: record.spo2Percent ?? null,
    temperature_c: record.temperature.valueC,
    perfusion_index_percent: record.perfusionIndexPercent ?? null,
    prv_rmssd_ms: record.prvRmssdMs ?? null,
    prv_beats: record.prvBeats ?? null,
    activity_level: record.activityLevel ?? null,
    activity_rms_g: record.activityRmsG ?? null,
    orientation_class: record.orientationClass ?? null,
    extra: {
      red_raw: record.optical.red,
      ir_raw: record.optical.ir,
      optical_samples: record.optical.samples,
      optical_status: record.optical.status,
      temperature_status: record.temperature.status,
      imu_status: record.imu.status,
      accel_g: record.imu.accelG,
      gyro_dps: record.imu.gyroDps,
      lateral_g: record.lateralG ?? null,
      roll_deg: record.rollDeg ?? null,
      pitch_deg: record.pitchDeg ?? null,
      yaw_deg: record.yawDeg ?? null,
      uptime_ms: record.uptimeMs,
      sequence: record.sequence,
      sensor_flags: record.flags,
      source: record.source,
    },
  };
}

export async function portalSyncRecords(
  portalUrl: string,
  token: string,
  records: MeasurementRecord[],
  deviceHardwareId: string,
): Promise<PortalSyncResult> {
  if (records.length === 0) {
    return { ok: true, status: 200, accepted: 0, duplicates: 0, detail: "Nothing to sync." };
  }

  try {
    const response = await request(`${baseUrl(portalUrl)}/api/v1/patient/records`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        records: records.map((record) => toPortalRecord(record, deviceHardwareId)),
      }),
    });

    if (response.status === 401) {
      return {
        ok: false,
        status: 401,
        accepted: 0,
        duplicates: 0,
        detail: "The portal session expired. Connect again in Settings.",
        unauthorized: true,
      };
    }
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        accepted: 0,
        duplicates: 0,
        detail: await errorDetail(response),
      };
    }

    const body = (await response.json()) as { accepted?: number; duplicates?: number };
    return {
      ok: true,
      status: response.status,
      accepted: body.accepted ?? 0,
      duplicates: body.duplicates ?? 0,
      detail: `Synced ${body.accepted ?? 0} record(s)${
        body.duplicates ? `, ${body.duplicates} already present` : ""
      }.`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      accepted: 0,
      duplicates: 0,
      detail:
        error instanceof Error && error.name === "AbortError"
          ? "Sync timed out. Records stay queued locally."
          : "Network error during sync. Records stay queued locally.",
    };
  }
}
