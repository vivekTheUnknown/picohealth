/**
 * Typed fetch wrapper for the portal API.
 *
 * - Always sends cookies (`credentials: "include"`).
 * - Echoes the readable `portal_csrf` cookie in `X-CSRF-Token` on unsafe
 *   methods, matching the backend's double-submit CSRF check.
 * - Normalizes the `{ error: { code, message, retryable } }` envelope into a
 *   typed ApiError.
 * - Distinguishes 401 (session invalid -> sign-in redirect) from 403
 *   (authenticated but not permitted -> access-denied state).
 *
 * The frontend is not a security boundary; the API authorizes every request.
 */

import { asBoolean, asString, isDict } from "@/lib/parse";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

export const CSRF_COOKIE_NAME = "portal_csrf";
export const CSRF_HEADER_NAME = "X-CSRF-Token";
export const UNAUTHORIZED_EVENT = "portal:unauthorized";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const DEFAULT_TIMEOUT_MS = 45_000;

export interface ApiErrorPayload {
  error?: {
    code?: unknown;
    message?: unknown;
    retryable?: unknown;
  };
  detail?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  readonly requestId: string | null;

  constructor(
    status: number,
    code: string,
    message: string,
    retryable = false,
    requestId: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** Missing/expired CSRF cookie: refreshing the page issues a new pair. */
  get isCsrfFailure(): boolean {
    return this.code === "csrf_failed";
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiError(0, "aborted", "The request was cancelled.", true);
  }
  const message =
    error instanceof Error && error.message
      ? error.message
      : "The service could not be reached. Check your connection and try again.";
  return new ApiError(0, "network_error", message, true);
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof ApiError && error.code === "aborted") ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

/**
 * Array values are appended as repeated query parameters (`?metrics=a&metrics=b`),
 * which is what FastAPI expects for `list[...]` query arguments. Joining them
 * into a comma-separated string produces a 422.
 */
type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<string | number>;

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Auth endpoints must not redirect on a failed sign-in attempt. */
  redirectOnUnauthorized?: boolean;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return match.slice(prefix.length);
  }
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = /^https?:\/\//i.test(path)
    ? path
    : `${API_BASE_URL}${normalizedPath}`;

  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(base, origin);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (entry === undefined || entry === null || entry === "") continue;
          url.searchParams.append(key, String(entry));
        }
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function defaultMessage(status: number): string {
  switch (status) {
    case 400:
      return "The request could not be processed.";
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You do not have permission to perform this action.";
    case 404:
      return "The requested record could not be found.";
    case 409:
      return "This conflicts with an existing record. Refresh and try again.";
    case 422:
      return "Some of the submitted values were not accepted.";
    case 429:
      return "Too many requests. Wait a moment, then try again.";
    default:
      if (status >= 500) {
        return "The service is temporarily unavailable. Try again shortly.";
      }
      return `The request failed (HTTP ${status}).`;
  }
}

function extractPayload(payload: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  const body = isDict(payload) ? payload : {};
  const errorBody = isDict(body.error) ? body.error : {};
  const code = asString(errorBody.code) ?? "request_failed";
  const detail = asString(body.detail);
  const message = asString(errorBody.message) ?? detail ?? "";
  const retryable = asBoolean(errorBody.retryable) ?? false;
  return { code, message, retryable };
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const controller = new AbortController();
  let timedOut = false;

  const timeoutId =
    options.timeoutMs === 0
      ? null
      : setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const externalSignal = options.signal;
  const forwardAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", forwardAbort, { once: true });
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  let bodyInit: BodyInit | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(options.body);
  }

  if (UNSAFE_METHODS.has(method)) {
    const csrfToken = readCookie(CSRF_COOKIE_NAME);
    if (csrfToken) headers[CSRF_HEADER_NAME] = csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: bodyInit,
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new ApiError(
        0,
        "timeout",
        "The service took too long to respond. Try again.",
        true,
      );
    }
    if (externalSignal?.aborted) {
      throw new DOMException("The request was aborted.", "AbortError");
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(
      0,
      "network_error",
      "The service could not be reached. Check your connection and try again.",
      true,
    );
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", forwardAbort);
    }
  }

  const requestId = response.headers.get("x-request-id");
  const contentType = response.headers.get("content-type") ?? "";

  let payload: unknown = null;
  if (response.status !== 204) {
    const text = await response.text().catch(() => "");
    if (text) {
      if (contentType.includes("application/json")) {
        try {
          payload = JSON.parse(text) as unknown;
        } catch {
          payload = text;
        }
      } else {
        payload = text;
      }
    }
  }

  if (!response.ok) {
    const extracted = extractPayload(payload);
    const message =
      extracted.message ||
      (response.status === 401
        ? "Your session has expired. Please sign in again."
        : defaultMessage(response.status));

    if (response.status === 401 && options.redirectOnUnauthorized !== false) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
    }

    throw new ApiError(
      response.status,
      extracted.code,
      message,
      extracted.retryable ||
        response.status >= 500 ||
        response.status === 429,
      requestId,
    );
  }

  return payload as T;
}

export const api = {
  get<T>(path: string, options?: Omit<ApiRequestOptions, "method" | "body">): Promise<T> {
    return apiRequest<T>(path, { ...options, method: "GET" });
  },
  post<T>(
    path: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, "method" | "body">,
  ): Promise<T> {
    return apiRequest<T>(path, { ...options, method: "POST", body });
  },
  put<T>(
    path: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, "method" | "body">,
  ): Promise<T> {
    return apiRequest<T>(path, { ...options, method: "PUT", body });
  },
  patch<T>(
    path: string,
    body?: unknown,
    options?: Omit<ApiRequestOptions, "method" | "body">,
  ): Promise<T> {
    return apiRequest<T>(path, { ...options, method: "PATCH", body });
  },
  delete<T>(
    path: string,
    options?: Omit<ApiRequestOptions, "method" | "body">,
  ): Promise<T> {
    return apiRequest<T>(path, { ...options, method: "DELETE" });
  },
};
