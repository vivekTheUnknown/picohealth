"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { getMe, logout } from "@/lib/api";
import { isAbortError, toApiError, UNAUTHORIZED_EVENT, type ApiError } from "@/lib/api-client";
import type { Me } from "@/lib/types";

export const AUTH_NOTICE_KEY = "portal:auth-notice";

export type SessionStatus = "loading" | "ready" | "unauthenticated" | "error";

export interface SessionValue {
  me: Me | null;
  status: SessionStatus;
  error: ApiError | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setStatus((previous) => (previous === "ready" ? previous : "loading"));
    setError(null);

    try {
      const next = await getMe(controller.signal);
      setMe(next);
      setStatus("ready");
    } catch (caught) {
      if (isAbortError(caught)) return;
      const apiError = toApiError(caught);
      if (apiError.isUnauthorized || apiError.code === "unauthenticated") {
        setMe(null);
        setStatus("unauthenticated");
        return;
      }
      setError(apiError);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
    return () => inFlight.current?.abort();
  }, [load]);

  useEffect(() => {
    const handleUnauthorized = () => {
      setMe(null);
      setStatus("unauthenticated");
      try {
        window.sessionStorage.setItem(
          AUTH_NOTICE_KEY,
          "Your session expired. Please sign in again.",
        );
      } catch {
        // Session storage can be unavailable in privacy modes; not critical.
      }
    };
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } catch {
      // Signing out locally must succeed even if the API call fails.
    } finally {
      setMe(null);
      setStatus("unauthenticated");
      try {
        window.sessionStorage.removeItem(AUTH_NOTICE_KEY);
      } catch {
        // Ignore storage failures.
      }
    }
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ me, status, error, refresh: load, signOut }),
    [me, status, error, load, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used inside <SessionProvider>");
  }
  return context;
}
