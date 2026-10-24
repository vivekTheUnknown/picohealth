"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isAbortError, toApiError, type ApiError } from "@/lib/api-client";

export interface ApiResource<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs an API loader and re-runs it when the dependency key changes or reload()
 * is called. Data is cleared when the key changes so an old window's values are
 * never displayed under a new filter label.
 */
export function useApi<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[] = [],
  options: { enabled?: boolean } = {},
): ApiResource<T> {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const depsKey = `${enabled ? "1" : "0"}:${JSON.stringify(deps)}`;
  const lastKeyRef = useRef(depsKey);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const keyChanged = lastKeyRef.current !== depsKey;
    lastKeyRef.current = depsKey;
    if (keyChanged) {
      setData(null);
      setError(null);
    }

    const controller = new AbortController();
    let active = true;
    setLoading(true);

    loaderRef.current(controller.signal)
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active || isAbortError(caught)) return;
        setError(toApiError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [depsKey, enabled]);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  return { data, error, loading, reload };
}

export interface AsyncAction<Args extends unknown[]> {
  run: (...args: Args) => Promise<boolean>;
  pending: boolean;
  error: ApiError | null;
  reset: () => void;
}

/** Wraps a mutation with pending/error state and normalized errors. */
export function useAsyncAction<Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown>,
): AsyncAction<Args> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const actionRef = useRef(action);
  actionRef.current = action;

  const run = useCallback(async (...args: Args): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      await actionRef.current(...args);
      return true;
    } catch (caught) {
      setError(toApiError(caught));
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, reset };
}
