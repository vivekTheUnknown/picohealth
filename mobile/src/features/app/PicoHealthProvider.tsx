import AsyncStorage from "@react-native-async-storage/async-storage";
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

import {
  DEFAULT_THRESHOLDS,
  evaluateFrame,
  evaluateFreshness,
  initialAlertState,
  type AlertCandidate,
  type AlertEpisodeState,
} from "@/features/alerts/rules";
import { useBleSession } from "@/features/ble/useBleSession";
import { RawSensorProcessor, type RawSnapshot } from "@/features/sensors/rawProcessor";
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  normalizeSettings,
  parseStoredSettings,
  type Settings,
} from "@/features/settings/settings";
import {
  portalLogin,
  portalMe,
  portalSyncRecords,
} from "@/services/api/portal";
import {
  clearPortalSession,
  loadPortalSession,
  savePortalSession,
} from "@/services/portal/session";
import {
  acknowledgeAlert as acknowledgeAlertRow,
  clearAlerts,
  clearMeasurements,
  countMeasurements,
  countPendingUploads,
  deleteMeasurementsBefore,
  hasOpenAlert,
  insertAlert,
  insertMeasurement,
  listAlerts,
  listPendingUploads,
  markUploaded,
} from "@/services/storage/db";
import type {
  AlertRecord,
  LivePoint,
  MeasurementRecord,
  SensorFrame,
} from "@/types/health";
import { createId } from "@/utils/format";

export interface PortalState {
  /** A patient account is connected and the token is held securely. */
  connected: boolean;
  identity: string | null;
  patientId: string | null;
  syncing: boolean;
  pending: number;
  lastSyncAt: string | null;
  detail: string;
  error: string | null;
}

const EMPTY_PORTAL: PortalState = {
  connected: false,
  identity: null,
  patientId: null,
  syncing: false,
  pending: 0,
  lastSyncAt: null,
  detail: "Not connected. Sign in with your patient account to sync.",
  error: null,
};

interface PicoHealthContextValue {
  settings: Settings;
  settingsLoaded: boolean;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;

  ble: ReturnType<typeof useBleSession>;
  demoFrame: SensorFrame | null;
  /** Most recent frame from either source. */
  frame: SensorFrame | null;
  series: LivePoint[];
  rawSnapshot: RawSnapshot | null;
  frameCount: number;
  now: number;

  alerts: AlertRecord[];
  alertsLoading: boolean;
  acknowledgeAlert: (id: string) => Promise<void>;
  refreshAlerts: () => Promise<void>;

  storedCount: number;
  refreshCount: () => Promise<void>;
  clearAllData: () => Promise<void>;

  portal: PortalState;
  connectPortal: (
    identifier: string,
    password: string,
  ) => Promise<{ ok: boolean; detail: string }>;
  disconnectPortal: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const PicoHealthContext = createContext<PicoHealthContextValue | null>(null);

const DEMO_INTERVAL_MS = 1000;

/**
 * Builds a synthetic frame for the labelled demo mode.
 *
 * It mirrors the real firmware's honesty: optical raw counts are "ok", while
 * temperature and IMU remain "unvalidated" because the hardware drivers are.
 */
function buildDemoFrame(now: number, tick: number): SensorFrame {
  const red = 11800 + Math.round(Math.sin(tick / 4) * 700);
  const ir = 11200 + Math.round(Math.cos(tick / 5) * 600);
  return {
    uptimeMs: tick * 1000,
    flags: 0x10 | 0x02 | 0x08 | 0x20,
    optical: { status: "ok", red, ir, samples: 18 + (tick % 5) },
    temperature: { status: "unvalidated", valueC: null },
    imu: { status: "unvalidated", accelG: null, gyroDps: null },
    receivedAt: now,
    sequence: tick & 0xffff,
    source: "demo",
  };
}

export function PicoHealthProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [storedCount, setStoredCount] = useState(0);
  const [demoFrame, setDemoFrame] = useState<SensorFrame | null>(null);
  const [processedFrame, setProcessedFrame] = useState<SensorFrame | null>(null);
  const [rawSnapshot, setRawSnapshot] = useState<RawSnapshot | null>(null);
  const [series, setSeries] = useState<LivePoint[]>([]);
  const [frameCount, setFrameCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [portal, setPortal] = useState<PortalState>(EMPTY_PORTAL);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const alertStateRef = useRef<AlertEpisodeState>(initialAlertState());
  const previousConnectionRef = useRef<string>("idle");
  const portalTokenRef = useRef<string | null>(null);
  const portalBusyRef = useRef(false);
  const syncRef = useRef<() => Promise<void>>(async () => {});
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      setAlerts(await listAlerts());
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  const refreshCount = useCallback(async () => {
    setStoredCount(await countMeasurements());
  }, []);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = normalizeSettings({ ...settingsRef.current, ...patch });
    // Update the ref synchronously so a follow-up call in the same handler
    // (for example connect-then-sync) sees the new value.
    settingsRef.current = next;
    setSettings(next);
    try {
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The in-memory value still applies for this session.
    }
  }, []);


  const persistAlert = useCallback(
    async (candidate: AlertCandidate) => {
      const cooldown = settingsRef.current.staleAfterMs > 0
        ? Math.max(DEFAULT_THRESHOLDS.repeatCooldownMs, 60_000)
        : DEFAULT_THRESHOLDS.repeatCooldownMs;
      const since = Date.now() - cooldown;

      // Durable de-duplication: the in-memory episode state resets when the app
      // restarts, so check the database as well.
      if (await hasOpenAlert(candidate.code, since)) return;

      const record: AlertRecord = {
        id: createId("alert"),
        createdAt: new Date().toISOString(),
        code: candidate.code,
        sensor: candidate.sensor,
        severity: candidate.severity,
        title: candidate.title,
        message: candidate.message,
        acknowledged: false,
        acknowledgedAt: null,
      };
      await insertAlert(record);
      await refreshAlerts();
    },
    [refreshAlerts],
  );

  const refreshPending = useCallback(async () => {
    try {
      const pending = await countPendingUploads();
      setPortal((previous) => ({ ...previous, pending }));
    } catch {
      // A storage read failure must not break the dashboard.
    }
  }, []);

  const runSync = useCallback(async () => {
    const current = settingsRef.current;
    const token = portalTokenRef.current;
    if (!token) {
      setPortal((previous) => ({
        ...previous,
        connected: false,
        detail: "Sign in with your patient account to sync.",
      }));
      return;
    }
    if (!current.backendUrl) {
      setPortal((previous) => ({
        ...previous,
        detail: "Add the portal URL in Settings.",
      }));
      return;
    }
    if (!current.uploadEnabled) {
      setPortal((previous) => ({
        ...previous,
        detail: "Sync is off. Turn on “Sync live measurements”.",
      }));
      return;
    }
    if (portalBusyRef.current) return;

    portalBusyRef.current = true;
    setPortal((previous) => ({ ...previous, syncing: true, error: null }));
    try {
      const records = await listPendingUploads(50);
      if (records.length === 0) {
        setPortal((previous) => ({
          ...previous,
          syncing: false,
          pending: 0,
          detail: "All records are synced.",
        }));
        return;
      }

      const result = await portalSyncRecords(
        current.backendUrl,
        token,
        records,
        current.deviceName,
      );

      if (result.ok) {
        for (const record of records) {
          await markUploaded(record.id);
        }
        const pending = await countPendingUploads();
        setPortal((previous) => ({
          ...previous,
          connected: true,
          syncing: false,
          pending,
          lastSyncAt: new Date().toISOString(),
          detail: result.detail,
          error: null,
        }));
      } else if (result.unauthorized) {
        portalTokenRef.current = null;
        await clearPortalSession();
        const pending = await countPendingUploads();
        setPortal({
          ...EMPTY_PORTAL,
          pending,
          detail: "The portal session expired. Connect again in Settings.",
          error: result.detail,
        });
      } else {
        const pending = await countPendingUploads();
        setPortal((previous) => ({
          ...previous,
          syncing: false,
          pending,
          detail: "Sync failed. Records stay queued locally.",
          error: result.detail,
        }));
      }
    } catch {
      setPortal((previous) => ({
        ...previous,
        syncing: false,
        detail: "Sync failed. Records stay queued locally.",
        error: "Could not read or send local records.",
      }));
    } finally {
      portalBusyRef.current = false;
    }
  }, []);

  syncRef.current = runSync;

  const handleFrame = useCallback(
    async (frame: SensorFrame) => {
      const record: MeasurementRecord = {
        ...frame,
        id: createId("m", frame.receivedAt),
        uploaded: false,
        uploadedAt: null,
      };

      if (frame.source === "demo") setDemoFrame(frame);

      setFrameCount((count) => count + 1);

      try {
        await insertMeasurement(record);
        setStoredCount((count) => count + 1);
      } catch {
        // Persistence failure must not stop live display; the frame is still
        // shown and the failure is visible through the stored count.
      }

      if (frame.source === "live") {
        if (settingsRef.current.uploadEnabled && portalTokenRef.current) {
          setPortal((previous) => ({ ...previous, pending: previous.pending + 1 }));
          // Batch a few seconds of records per request instead of one call per
          // frame. The queue is durable, so a failed batch is retried.
          if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
          syncTimerRef.current = setTimeout(() => {
            syncTimerRef.current = null;
            void syncRef.current();
          }, 4_000);
        } else {
          void refreshPending();
        }
      }

      const thresholds = {
        ...DEFAULT_THRESHOLDS,
        staleAfterMs: settingsRef.current.staleAfterMs,
        opticalMaxCount: settingsRef.current.opticalMaxCount,
        temperatureMinC: settingsRef.current.temperatureMinC,
        temperatureMaxC: settingsRef.current.temperatureMaxC,
      };

      const evaluation = evaluateFrame(
        frame,
        alertStateRef.current,
        thresholds,
        frame.receivedAt,
      );
      alertStateRef.current = evaluation.state;
      for (const candidate of evaluation.candidates) {
        await persistAlert(candidate);
      }
    },
    [persistAlert, refreshPending],
  );

  /**
   * Raw v3 snapshot -> the app's existing display/persistence model.
   * The conversions already happened in the sensor modules.
   */
  const handleRawSnapshot = useCallback(
    (snapshot: RawSnapshot) => {
      const { temperature, imu, optical } = snapshot;

      const frame: SensorFrame = {
        receivedAt: snapshot.receivedAt,
        uptimeMs: Math.max(0, Math.round(snapshot.uptimeMs)),
        flags: 0,
        sequence: snapshot.lastSeq,
        source: "live",
        optical: {
          // Data is arriving whenever we have counts; contact is a quality
          // state, not a sensor failure, so it must not raise "unavailable".
          status: optical.red !== null && optical.ir !== null ? "ok" : "unavailable",
          red: optical.red,
          ir: optical.ir,
          samples: optical.windowSamples,
        },
        temperature: {
          status: temperature
            ? temperature.valid
              ? "ok"
              : "error"
            : "unavailable",
          valueC: temperature?.valid ? temperature.valueC : null,
        },
        imu: {
          status: imu ? (imu.valid ? "ok" : "unvalidated") : "unavailable",
          accelG: imu?.valid ? imu.accelG : null,
          gyroDps: imu?.valid ? imu.gyroDps : null,
        },
        heartRateBpm: optical.heartRateBpm,
        spo2Percent: optical.spo2Percent,
        heartRateValid: optical.heartRateValid,
        spo2Valid: optical.spo2Valid,
        signalQuality: optical.state,
        perfusionIndexPercent: optical.perfusionIndexPercent,
        prvRmssdMs: optical.prvRmssdMs,
        prvBeats: optical.prvBeats,
        algorithmVersion: optical.algorithmVersion,
        activityLevel: snapshot.activityLevel,
        activityRmsG: snapshot.activityRmsG,
        orientationClass: snapshot.orientationClass,
        rollDeg: snapshot.orientation?.roll ?? null,
        pitchDeg: snapshot.orientation?.pitch ?? null,
        yawDeg: snapshot.orientation?.yaw ?? null,
        lateralG: snapshot.lateralG,
      };

      setRawSnapshot(snapshot);
      setProcessedFrame(frame);

      const point: LivePoint = {
        t: snapshot.receivedAt,
        temperatureC: frame.temperature.valueC,
        heartRateBpm:
          frame.heartRateValid ? frame.heartRateBpm ?? null : null,
        spo2Percent: frame.spo2Valid ? frame.spo2Percent ?? null : null,
        accelG: snapshot.imu?.valid ? snapshot.imu.accelG : null,
        gyroDps: snapshot.imu?.valid ? snapshot.imu.gyroDps : null,
        roll: snapshot.orientation?.roll ?? null,
        pitch: snapshot.orientation?.pitch ?? null,
        yaw: snapshot.orientation?.yaw ?? null,
        lateralG: snapshot.lateralG,
        perfusionIndexPercent: snapshot.optical.perfusionIndexPercent,
        prvRmssdMs: snapshot.optical.prvRmssdMs,
        activityRmsG: snapshot.activityRmsG,
        activityLevel: snapshot.activityLevel,
        orientationClass: snapshot.orientationClass,
      };
      setSeries((previous) => {
        const cutoff = point.t - 15 * 60 * 1000;
        const kept = previous.filter((entry) => entry.t >= cutoff);
        kept.push(point);
        return kept.slice(-900);
      });

      void handleFrame(frame);
    },
    [handleFrame],
  );

  const rawProcessor = useMemo(
    () => new RawSensorProcessor(handleRawSnapshot),
    [handleRawSnapshot],
  );

  const ble = useBleSession({
    deviceName: settings.deviceName,
    autoReconnect: settings.autoReconnect,
    enabled: !settings.demoMode,
    onFrame: handleFrame,
    onRawMessage: (message) => rawProcessor.ingest(message),
  });

  const frame = settings.demoMode
    ? demoFrame
    : processedFrame ?? ble.lastFrame;

  // Labelled demo source. Never uploaded, and never presented as a device.
  useEffect(() => {
    if (!settings.demoMode) {
      setDemoFrame(null);
      return;
    }
    rawProcessor.reset();
    setProcessedFrame(null);
    setRawSnapshot(null);
    setSeries([]);

    let tick = 0;
    const emit = () => {
      tick += 1;
      const generated = buildDemoFrame(Date.now(), tick);
      setDemoFrame(generated);
      void handleFrame(generated);
    };
    emit();
    const timer = setInterval(emit, DEMO_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [settings.demoMode, handleFrame]);

  // One-second clock: staleness labels and alert evaluation must not freeze.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const streaming = settings.demoMode || ble.state === "connected";
    const lastReceivedAt = frame?.receivedAt ?? null;
    const evaluation = evaluateFreshness(
      lastReceivedAt,
      now,
      alertStateRef.current,
      { ...DEFAULT_THRESHOLDS, staleAfterMs: settings.staleAfterMs },
      streaming,
    );
    alertStateRef.current = evaluation.state;
    evaluation.candidates.forEach((candidate) => {
      void persistAlert(candidate);
    });
  }, [now, frame, settings.demoMode, settings.staleAfterMs, ble.state, persistAlert]);

  // Disconnection is itself an informational alert, once per episode.
  useEffect(() => {
    const previous = previousConnectionRef.current;
    previousConnectionRef.current = ble.state;
    if (previous === "connected" && ble.state !== "connected" && !settings.demoMode) {
      void persistAlert({
        code: "DEVICE_DISCONNECTED",
        sensor: null,
        severity: "warning",
        title: "Device disconnected",
        message:
          "The wearable stopped sending data. The last reading is preserved but is no longer current.",
      });
    }
  }, [ble.state, persistAlert, settings.demoMode]);

  // Load preferences, then prune history beyond the retention window.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!cancelled && stored) {
          setSettings(parseStoredSettings(stored));
        }
      } catch {
        // Corrupt or unavailable storage falls back to defaults.
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore the saved portal session and verify it against the API.
  useEffect(() => {
    if (!settingsLoaded) return;
    let cancelled = false;
    (async () => {
      const stored = await loadPortalSession();
      if (!stored || cancelled) return;

      portalTokenRef.current = stored.token;
      if (stored.portalUrl && stored.portalUrl !== settingsRef.current.backendUrl) {
        await updateSettings({ backendUrl: stored.portalUrl });
      }

      const verified = await portalMe(stored.portalUrl, stored.token);
      if (cancelled) return;
      if (!verified.ok || !verified.me) {
        portalTokenRef.current = null;
        if (verified.unauthorized) await clearPortalSession();
        setPortal((previous) => ({
          ...previous,
          connected: false,
          detail: verified.unauthorized
            ? "The portal session expired. Connect again in Settings."
            : "Could not verify the saved portal session.",
          error: verified.detail,
        }));
        return;
      }

      setPortal((previous) => ({
        ...previous,
        connected: true,
        identity: verified.me!.display_name,
        patientId: verified.me!.patient_id,
        detail: `Connected as ${verified.me!.display_name}.`,
      }));
      void syncRef.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [settingsLoaded, updateSettings]);

  // Retry queued records while the app is open. Offline failures are harmless:
  // the rows stay marked unsynced and are retried next time.
  useEffect(() => {
    if (!settingsLoaded) return;
    void refreshPending();
    const timer = setInterval(() => {
      if (settingsRef.current.uploadEnabled && portalTokenRef.current) {
        void syncRef.current();
      }
    }, 20_000);
    return () => clearInterval(timer);
  }, [settingsLoaded, refreshPending]);

  useEffect(() => {
    if (!settingsLoaded) return;
    void refreshAlerts();
    void refreshCount();
    const cutoff = Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000;
    void deleteMeasurementsBefore(cutoff).then(() => refreshCount());
  }, [settingsLoaded, settings.retentionDays, refreshAlerts, refreshCount]);

  const acknowledgeAlert = useCallback(
    async (id: string) => {
      await acknowledgeAlertRow(id);
      await refreshAlerts();
    },
    [refreshAlerts],
  );

  const clearAllData = useCallback(async () => {
    await clearMeasurements();
    await clearAlerts();
    alertStateRef.current = initialAlertState();
    setFrameCount(0);
    setDemoFrame(null);
    setSeries([]);
    await Promise.all([refreshAlerts(), refreshCount()]);
  }, [refreshAlerts, refreshCount]);

  const connectPortal = useCallback(
    async (identifier: string, password: string) => {
      const current = settingsRef.current;
      if (!current.backendUrl) {
        return { ok: false, detail: "Enter the portal URL first." };
      }

      setPortal((previous) => ({ ...previous, detail: "Connecting…", error: null }));
      const result = await portalLogin(current.backendUrl, identifier, password);
      if (!result.ok || !result.token || !result.me) {
        setPortal((previous) => ({
          ...previous,
          connected: false,
          detail: "Not connected.",
          error: result.detail,
        }));
        return { ok: false, detail: result.detail };
      }
      if (!result.me.roles.includes("patient")) {
        const detail = "This account is not a patient account.";
        setPortal((previous) => ({
          ...previous,
          connected: false,
          detail: "Not connected.",
          error: detail,
        }));
        return { ok: false, detail };
      }

      portalTokenRef.current = result.token;
      try {
        await savePortalSession({
          portalUrl: current.backendUrl,
          token: result.token,
          identity: result.me.display_name,
          patientId: result.me.patient_id,
        });
      } catch (error) {
        return {
          ok: false,
          detail:
            error instanceof Error ? error.message : "Could not store the session.",
        };
      }

      await updateSettings({
        portalIdentifier: identifier.trim(),
        uploadEnabled: true,
      });
      setPortal((previous) => ({
        ...previous,
        connected: true,
        identity: result.me!.display_name,
        patientId: result.me!.patient_id,
        detail: `Connected as ${result.me!.display_name}.`,
        error: null,
      }));
      void syncRef.current();
      return { ok: true, detail: `Connected as ${result.me.display_name}.` };
    },
    [updateSettings],
  );

  const disconnectPortal = useCallback(async () => {
    portalTokenRef.current = null;
    await clearPortalSession();
    await updateSettings({ uploadEnabled: false });
    setPortal({ ...EMPTY_PORTAL, pending: await countPendingUploads() });
  }, [updateSettings]);

  const value = useMemo<PicoHealthContextValue>(
    () => ({
      settings,
      settingsLoaded,
      updateSettings,
      ble,
      demoFrame: settings.demoMode ? demoFrame : null,
      frame,
      series,
      rawSnapshot,
      frameCount,
      now,
      alerts,
      alertsLoading,
      acknowledgeAlert,
      refreshAlerts,
      storedCount,
      refreshCount,
      clearAllData,
      portal,
      connectPortal,
      disconnectPortal,
      syncNow: runSync,
    }),
    [
      settings,
      settingsLoaded,
      updateSettings,
      ble,
      demoFrame,
      frame,
      series,
      rawSnapshot,
      frameCount,
      now,
      alerts,
      alertsLoading,
      acknowledgeAlert,
      refreshAlerts,
      storedCount,
      refreshCount,
      clearAllData,
      portal,
      connectPortal,
      disconnectPortal,
      runSync,
    ],
  );

  useEffect(
    () => () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    },
    [],
  );

  return <PicoHealthContext.Provider value={value}>{children}</PicoHealthContext.Provider>;
}

export function usePicoHealth(): PicoHealthContextValue {
  const context = useContext(PicoHealthContext);
  if (!context) {
    throw new Error("usePicoHealth must be used inside PicoHealthProvider");
  }
  return context;
}
