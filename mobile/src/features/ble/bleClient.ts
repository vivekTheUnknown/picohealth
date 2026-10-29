import {
  BleManager,
  State,
  type Characteristic,
  type Device,
  type Subscription,
} from "react-native-ble-plx";

import { DATA_CHARACTERISTIC_UUID, SERVICE_UUID } from "@/types/health";

/**
 * Thin wrapper over react-native-ble-plx.
 *
 * Kept deliberately small: the hook owns lifecycle and retry policy, this
 * module only performs the BLE operations and normalises errors.
 */
let manager: BleManager | null = null;

export function getBleManager(): BleManager {
  if (!manager) {
    manager = new BleManager();
  }
  return manager;
}

export class BleError extends Error {
  constructor(
    readonly code:
      | "bluetooth-off"
      | "scan-timeout"
      | "not-found"
      | "connect-failed"
      | "service-missing"
      | "characteristic-missing"
      | "subscribe-failed",
    message: string,
  ) {
    super(message);
    this.name = "BleError";
  }
}

/** Waits briefly for the adapter to report PoweredOn (state is Unknown at boot). */
export async function waitForPoweredOn(
  ble: BleManager,
  timeoutMs = 4000,
): Promise<boolean> {
  const current = await ble.state();
  if (current === State.PoweredOn) return true;
  if (current === State.PoweredOff || current === State.Unauthorized) return false;

  return new Promise((resolve) => {
    let settled = false;
    const subscription = ble.onStateChange((state) => {
      if (state === State.PoweredOn) {
        if (!settled) {
          settled = true;
          subscription.remove();
          resolve(true);
        }
      } else if (state === State.PoweredOff || state === State.Unauthorized) {
        if (!settled) {
          settled = true;
          subscription.remove();
          resolve(false);
        }
      }
    }, true);

    setTimeout(() => {
      if (!settled) {
        settled = true;
        subscription.remove();
        resolve(false);
      }
    }, timeoutMs);
  });
}

function nameOf(device: Device): string {
  return device.name ?? device.localName ?? "";
}

/** Scans for a device by advertised service and name, then stops the scan. */
export function scanForDevice(
  ble: BleManager,
  options: { deviceName: string; timeoutMs?: number },
): Promise<Device> {
  const timeoutMs = options.timeoutMs ?? 10_000;

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error?: Error, device?: Device) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ble.stopDeviceScan().catch(() => undefined);
      if (device) resolve(device);
      else reject(error ?? new BleError("scan-timeout", "No device found."));
    };

    const timer = setTimeout(() => {
      finish(
        new BleError(
          "scan-timeout",
          `No ${options.deviceName} found within ${Math.round(timeoutMs / 1000)} s. Check that the Pico is powered and advertising.`,
        ),
      );
    }, timeoutMs);

    ble
      .startDeviceScan([SERVICE_UUID], { allowDuplicates: false }, (error, device) => {
        if (error) {
          finish(new BleError("scan-timeout", error.message));
          return;
        }
        if (!device) return;
        if (nameOf(device) === options.deviceName) {
          finish(undefined, device);
        }
      })
      .catch((error: Error) => finish(new BleError("scan-timeout", error.message)));
  });
}

export async function connectAndSubscribe(
  ble: BleManager,
  device: Device,
  handlers: {
    onNotification: (value: string) => void;
    onDisconnected: () => void;
    onMonitorError: (message: string) => void;
  },
): Promise<{ device: Device; characteristic: Characteristic; subscriptions: Subscription[] }> {
  const connected = await device.connect({ timeout: 15_000 });

  await connected.discoverAllServicesAndCharacteristics();

  const characteristics = await connected.characteristicsForService(SERVICE_UUID);
  const characteristic = characteristics.find(
    (candidate) => candidate.uuid.toLowerCase() === DATA_CHARACTERISTIC_UUID.toLowerCase(),
  );

  if (!characteristic) {
    connected.cancelConnection().catch(() => undefined);
    throw new BleError(
      "characteristic-missing",
      `Service found but characteristic ${DATA_CHARACTERISTIC_UUID} is missing.`,
    );
  }

  if (!characteristic.isNotifiable) {
    connected.cancelConnection().catch(() => undefined);
    throw new BleError(
      "subscribe-failed",
      "The data characteristic does not advertise notify.",
    );
  }

  const monitor: Subscription = characteristic.monitor((error, value) => {
    if (error) {
      handlers.onMonitorError(error.message);
      return;
    }
    if (value?.value) handlers.onNotification(value.value);
  });

  const disconnectSubscription = connected.onDisconnected(() => {
    monitor.remove();
    handlers.onDisconnected();
  });

  // The subscription is only considered established after monitor() returns.
  return {
    device: connected,
    characteristic,
    subscriptions: [monitor, disconnectSubscription],
  };
}

export async function disconnectDevice(device: Device | null): Promise<void> {
  if (!device) return;
  try {
    await device.cancelConnection();
  } catch {
    // Already disconnected.
  }
}

export async function stopScan(ble: BleManager): Promise<void> {
  try {
    await ble.stopDeviceScan();
  } catch {
    // Not scanning.
  }
}
