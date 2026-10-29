import type { MeasurementRecord } from "@/types/health";
import { toBackendMeasurement } from "@/services/api/payload";

/**
 * Adapter for the starter FastAPI (`/health`, `POST /measurements`).
 *
 * The design document suggests a different endpoint shape, but this is the
 * server that actually exists in the starter bundle, so the app targets it and
 * documents the difference rather than inventing a second API.
 */
const DEMO_TOKEN = process.env.EXPO_PUBLIC_DEMO_TOKEN ?? "dev-only-change-me";

export interface ConnectionTestResult {
  ok: boolean;
  status: number | null;
  endpoint: string | null;
  detail: string;
}

export interface UploadResult {
  ok: boolean;
  status: number | null;
  detail: string;
}

async function request(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** The starter server exposes `/health`; the portal API uses `/health/live`. */
const HEALTH_PATHS = ["/health", "/health/live"];

export async function testBackend(
  baseUrl: string,
  timeoutMs = 6000,
): Promise<ConnectionTestResult> {
  if (!baseUrl) {
    return { ok: false, status: null, endpoint: null, detail: "No backend URL configured." };
  }

  let lastDetail = "No response.";
  for (const path of HEALTH_PATHS) {
    const endpoint = `${baseUrl}${path}`;
    try {
      const response = await request(endpoint, { method: "GET" }, timeoutMs);
      if (response.ok) {
        return { ok: true, status: response.status, endpoint, detail: `Reachable (${response.status}).` };
      }
      lastDetail = `HTTP ${response.status} from ${path}.`;
      if (response.status !== 404 && response.status !== 405) break;
    } catch (error) {
      lastDetail =
        error instanceof Error && error.name === "AbortError"
          ? `Timed out after ${Math.round(timeoutMs / 1000)} s.`
          : "Network error. Check the URL, Wi-Fi, and that the server is running.";
    }
  }

  return { ok: false, status: null, endpoint: null, detail: lastDetail };
}

export async function uploadMeasurement(
  record: MeasurementRecord,
  options: { baseUrl: string; deviceId: string; patientId: number; token?: string },
  timeoutMs = 8000,
): Promise<UploadResult> {
  if (!options.baseUrl) {
    return { ok: false, status: null, detail: "Upload is not configured." };
  }

  const payload = toBackendMeasurement(record, {
    patientId: options.patientId,
    deviceId: options.deviceId,
  });

  try {
    const response = await request(
      `${options.baseUrl}/measurements`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.token ?? DEMO_TOKEN}`,
        },
        body: JSON.stringify(payload),
      },
      timeoutMs,
    );

    if (response.ok) {
      return { ok: true, status: response.status, detail: `Uploaded (${response.status}).` };
    }
    return {
      ok: false,
      status: response.status,
      detail:
        response.status === 401
          ? "Rejected: the demo token is wrong."
          : `Server returned HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      detail:
        error instanceof Error && error.name === "AbortError"
          ? "Upload timed out."
          : "Network error while uploading. The sample stays queued locally.",
    };
  }
}
