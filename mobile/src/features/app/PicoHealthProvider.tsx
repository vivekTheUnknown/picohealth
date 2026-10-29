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
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  normalizeSettings,
  parseStoredSettings,
  type Settings,
} from "@/features/settings/settings";
import { testBackend, uploadMeasurement, type ConnectionTestResult } from "@/services/api/client";
import {
  acknowledgeAlert as acknowledgeAlertRow,
  clearAlerts,
  clearMeasurements,
  countMeasurements,
  deleteMeasurementsBefore,
  hasOpenAlert,
  insertAlert,
  insertMeasurement,
  listAlerts,
  markUploaded,
} from "@/services/storage/db";
import type { AlertRecord, MeasurementRecord, SensorFrame } from "@/types/health";
import { createId } from "@/utils/format";

export interface UploadStatus {
  state: "off" | "idle" | "uploading" | "uploaded" | "failed";
  detail: string;
}

interface PicoHealthContextValue {
  settings: Settings;
  settingsLoaded: boolean;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;

  ble: ReturnType<typeof useBleSession>;
  demoFrame: SensorFrame | null;
  /** Most recent frame from either source. */
  frame: SensorFrame | null;
  frameCount: number;
  now: number;

  alerts: AlertRecord[];
  alertsLoading: boolean;
  acknowledgeAlert: (id: string) => Promise<void>;
  refreshAlerts: () => Promise<void>;

  storedCount: number;
  refreshCount: () => Promise<void>;
  clearAllData: () => Promise<void>;

  uploadStatus: UploadStatus;
  testConnection: () => Promise<ConnectionTestResult>;
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
  const [frameCount, setFrameCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    state: "off",
    detail: "Upload is disabled.",
  });

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const alertStateRef = useRef<AlertEpisodeState>(initialAlertState());
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const previousConnectionRef = useRef<string>("idle");

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

  const enqueueUpload = useCallback((record: MeasurementRecord) => {
    uploadChainRef.current = uploadChainRef.current.then(async () => {
      const current = settingsRef.current;
      if (!current.uploadEnabled || !current.backendUrl) return;

      setUploadStatus({ state: "uploading", detail: "Uploading one sample…" });
      const result = await uploadMeasurement(record, {
        baseUrl: current.backendUrl,
        deviceId: current.deviceName,
        patientId: current.patientId,
      });

      if (result.ok) {
        await markUploaded(record.id);
        setUploadStatus({ state: "uploaded", detail: result.detail });
      } else {
        setUploadStatus({ state: "failed", detail: result.detail });
      }
    });
  }, []);

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

      if (frame.source === "live" && settingsRef.current.uploadEnabled) {
        enqueueUpload(record);
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
    [enqueueUpload, persistAlert],
  );

  const ble = useBleSession({
    deviceName: settings.deviceName,
    autoReconnect: settings.autoReconnect,
    enabled: !settings.demoMode,
    onFrame: handleFrame,
  });

  const frame = settings.demoMode ? demoFrame : ble.lastFrame;

  // Labelled demo source. Never uploaded, and never presented as a device.
  useEffect(() => {
    if (!settings.demoMode) {
      setDemoFrame(null);
      return;
    }

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

  useEffect(() => {
    if (!settingsLoaded) return;
    void refreshAlerts();
    void refreshCount();
    const cutoff = Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000;
    void deleteMeasurementsBefore(cutoff).then(() => refreshCount());
  }, [settingsLoaded, settings.retentionDays, refreshAlerts, refreshCount]);

  useEffect(() => {
    if (!settings.uploadEnabled) {
      setUploadStatus({ state: "off", detail: "Upload is disabled." });
    } else {
      setUploadStatus({ state: "idle", detail: "Waiting for a live sample." });
    }
  }, [settings.uploadEnabled, settings.backendUrl]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const next = normalizeSettings({ ...settingsRef.current, ...patch });
    setSettings(next);
    try {
      await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The in-memory value still applies for this session.
    }
  }, []);

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
    await Promise.all([refreshAlerts(), refreshCount()]);
  }, [refreshAlerts, refreshCount]);

  const testConnection = useCallback(async () => {
    const result = await testBackend(settingsRef.current.backendUrl);
    if (result.ok) {
      setUploadStatus({ state: "idle", detail: result.detail });
    } else {
      setUploadStatus({ state: "failed", detail: result.detail });
    }
    return result;
  }, []);

  const value = useMemo<PicoHealthContextValue>(
    () => ({
      settings,
      settingsLoaded,
      updateSettings,
      ble,
      demoFrame: settings.demoMode ? demoFrame : null,
      frame,
      frameCount,
      now,
      alerts,
      alertsLoading,
      acknowledgeAlert,
      refreshAlerts,
      storedCount,
      refreshCount,
      clearAllData,
      uploadStatus,
      testConnection,
    }),
    [
      settings,
      settingsLoaded,
      updateSettings,
      ble,
      demoFrame,
      frame,
      frameCount,
      now,
      alerts,
      alertsLoading,
      acknowledgeAlert,
      refreshAlerts,
      storedCount,
      refreshCount,
      clearAllData,
      uploadStatus,
      testConnection,
    ],
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
