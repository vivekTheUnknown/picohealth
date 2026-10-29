import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { Device, Subscription } from "react-native-ble-plx";

import { FragmentAssembler } from "@/features/ble/assembler";
import {
  BleError,
  connectAndSubscribe,
  disconnectDevice,
  getBleManager,
  scanForDevice,
  stopScan,
  waitForPoweredOn,
} from "@/features/ble/bleClient";
import {
  decodeFrame,
  decodeJsonRecord,
  looksLikeJson,
} from "@/features/ble/protocol";
import { ensureBlePermissions } from "@/services/permissions/ble";
import type { ConnectionState, SensorFrame } from "@/types/health";
import { base64ToBytes } from "@/utils/format";

export interface BleSessionOptions {
  deviceName: string;
  autoReconnect: boolean;
  enabled: boolean;
  onFrame: (frame: SensorFrame) => void;
}

export interface BleSession {
  state: ConnectionState;
  error: string | null;
  protocolError: string | null;
  transportMessage: string | null;
  lastFrame: SensorFrame | null;
  droppedFrames: number;
  now: number;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const MAX_RECONNECT_ATTEMPTS = 8;

/**
 * Owns the BLE lifecycle: permissions → scan → connect → discover → subscribe,
 * plus bounded exponential-backoff reconnection while the app is foregrounded.
 *
 * Connection is only reported as `connected` after the notification monitor is
 * established — never when merely connected at the GATT level.
 */
export function useBleSession(options: BleSessionOptions): BleSession {
  const { deviceName, autoReconnect, enabled, onFrame } = options;

  const [state, setState] = useState<ConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [protocolError, setProtocolError] = useState<string | null>(null);
  const [transportMessage, setTransportMessage] = useState<string | null>(null);
  const [lastFrame, setLastFrame] = useState<SensorFrame | null>(null);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const manager = useMemo(() => getBleManager(), []);
  const assembler = useMemo(() => new FragmentAssembler(), []);

  const deviceRef = useRef<Device | null>(null);
  const subscriptionsRef = useRef<Subscription[]>([]);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const manualRef = useRef(true);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const stateRef = useRef<ConnectionState>("idle");
  const onFrameRef = useRef(onFrame);
  const autoReconnectRef = useRef(autoReconnect);
  const deviceNameRef = useRef(deviceName);

  onFrameRef.current = onFrame;
  autoReconnectRef.current = autoReconnect;
  deviceNameRef.current = deviceName;
  stateRef.current = state;

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
  }, []);

  const cleanupSubscriptions = useCallback(() => {
    subscriptionsRef.current.forEach((subscription) => {
      try {
        subscription.remove();
      } catch {
        // Already removed by the native layer.
      }
    });
    subscriptionsRef.current = [];
  }, []);

  const releaseDevice = useCallback(async () => {
    cleanupSubscriptions();
    const device = deviceRef.current;
    deviceRef.current = null;
    await disconnectDevice(device);
  }, [cleanupSubscriptions]);

  const handleNotification = useCallback(
    (base64Value: string) => {
      const result = assembler.add(base64ToBytes(base64Value));

      if (result.kind === "test") {
        setTransportMessage(result.text);
        return;
      }

      if (result.kind === "pending" || result.kind === "ignored") return;

      if (result.kind === "rejected") {
        setDroppedFrames((count) => count + 1);
        setProtocolError(`${result.reason}: ${result.detail}`);
        return;
      }

      try {
        // v2 firmware sends JSON over the same characteristic; v1 sent the
        // 28-byte binary frame. Both are accepted and validated.
        const decoded = looksLikeJson(result.bytes)
          ? decodeJsonRecord(result.bytes)
          : decodeFrame(result.bytes);
        const frame: SensorFrame = {
          ...decoded,
          receivedAt: Date.now(),
          sequence: result.sequence,
          source: "live",
        };
        setLastFrame(frame);
        setProtocolError(null);
        onFrameRef.current(frame);
      } catch (decodeError) {
        setDroppedFrames((count) => count + 1);
        setProtocolError(
          decodeError instanceof Error ? decodeError.message : "Malformed frame.",
        );
      }
    },
    [assembler],
  );

  const scheduleReconnect = useCallback(() => {
    if (!autoReconnectRef.current || manualRef.current) {
      setState("idle");
      return;
    }
    if (attemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setState("error");
      setError(
        `Automatic reconnection stopped after ${MAX_RECONNECT_ATTEMPTS} attempts. Check the device and tap Connect.`,
      );
      return;
    }

    const delay = Math.min(1000 * 2 ** attemptRef.current, 30_000);
    attemptRef.current += 1;
    setState("reconnecting");
    setError(null);
    clearReconnectTimer();
    reconnectTimer.current = setTimeout(() => {
      void runConnectRef.current();
    }, delay);
  }, [clearReconnectTimer]);

  const runConnect = useCallback(async (): Promise<void> => {
    if (busyRef.current || !mountedRef.current) return;
    busyRef.current = true;
    setError(null);
    setProtocolError(null);

    try {
      setState("requesting-permission");
      const permission = await ensureBlePermissions();
      if (!permission.granted) {
        setState("permission-denied");
        setError(
          permission.blocked
            ? "Bluetooth permission is blocked. Open Android settings and allow Nearby devices for PicoHealth."
            : "Bluetooth permission is required to find the wearable.",
        );
        return;
      }

      setState("connecting");
      const poweredOn = await waitForPoweredOn(manager);
      if (!poweredOn) {
        setState("bluetooth-off");
        setError("Bluetooth is off or unavailable. Turn it on, then try again.");
        return;
      }

      setState("scanning");
      const device = await scanForDevice(manager, {
        deviceName: deviceNameRef.current,
      });

      setState("connecting");
      const { subscriptions } = await connectAndSubscribe(manager, device, {
        onNotification: handleNotification,
        onMonitorError: (message) => setProtocolError(`Notification error: ${message}`),
        onDisconnected: () => {
          cleanupSubscriptions();
          deviceRef.current = null;
          setLastFrame((previous) => previous);
          scheduleReconnect();
        },
      });

      if (!mountedRef.current) {
        subscriptions.forEach((subscription) => subscription.remove());
        await disconnectDevice(device);
        return;
      }

      deviceRef.current = device;
      subscriptionsRef.current = subscriptions;
      attemptRef.current = 0;
      setState("connected");
    } catch (caught) {
      await releaseDevice();
      const message =
        caught instanceof BleError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : "Bluetooth connection failed.";
      setError(message);
      if (autoReconnectRef.current && !manualRef.current) {
        scheduleReconnect();
      } else {
        setState("error");
      }
    } finally {
      busyRef.current = false;
    }
  }, [
    cleanupSubscriptions,
    handleNotification,
    manager,
    releaseDevice,
    scheduleReconnect,
  ]);

  const runConnectRef = useRef(runConnect);
  runConnectRef.current = runConnect;

  const connect = useCallback(async () => {
    manualRef.current = false;
    attemptRef.current = 0;
    clearReconnectTimer();
    await runConnect();
  }, [clearReconnectTimer, runConnect]);

  const disconnect = useCallback(async () => {
    manualRef.current = true;
    clearReconnectTimer();
    attemptRef.current = 0;
    await stopScan(manager);
    await releaseDevice();
    setState("idle");
    setError(null);
  }, [clearReconnectTimer, manager, releaseDevice]);

  // Re-render once a second so "last received" and staleness stay truthful.
  useEffect(() => {
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, []);

  // Do not keep retrying in the background: Android may suspend the radio and
  // a background reconnect loop is not something the user asked for.
  useEffect(() => {
    const handler = (status: AppStateStatus) => {
      if (status === "background" || status === "inactive") {
        clearReconnectTimer();
      } else if (status === "active" && stateRef.current === "reconnecting") {
        void runConnectRef.current();
      }
    };
    const subscription = AppState.addEventListener("change", handler);
    return () => subscription.remove();
  }, [clearReconnectTimer]);

  useEffect(() => {
    if (!enabled) {
      manualRef.current = true;
      clearReconnectTimer();
      void releaseDevice();
      setState("idle");
    }
  }, [enabled, clearReconnectTimer, releaseDevice]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      manualRef.current = true;
      clearReconnectTimer();
      void stopScan(manager);
      void releaseDevice();
    };
  }, [clearReconnectTimer, manager, releaseDevice]);

  return {
    state,
    error,
    protocolError,
    transportMessage,
    lastFrame,
    droppedFrames,
    now,
    connect,
    disconnect,
  };
}
