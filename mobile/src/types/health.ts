/** Domain types shared by the BLE pipeline, storage, and screens. */

export const SERVICE_UUID = "8f2a0001-6b6d-4f9e-9f6d-6c2b2d0a0001";
export const DATA_CHARACTERISTIC_UUID =
  "8f2a0002-6b6d-4f9e-9f6d-6c2b2d0a0001";
export const DEFAULT_DEVICE_NAME = "PicoHealth-DEV";

/** Documented in docs/ble-protocol.md. The firmware is authoritative. */
export const PROTOCOL_FRAME_BYTES = 28;
export const NOTIFICATION_HEADER_BYTES = 4;
// Default ATT MTU 23 minus the 3-byte notification header.
export const MAX_FRAGMENT_PAYLOAD_BYTES = 20;

export type SensorStatus = "ok" | "unavailable" | "error" | "unvalidated";

export type SignalQuality =
  | "no_contact"
  | "collecting"
  | "poor_signal"
  | "valid"
  | "sensor_error";

export interface OpticalReading {
  status: SensorStatus;
  red: number | null;
  ir: number | null;
  samples: number;
}

export interface TemperatureReading {
  status: SensorStatus;
  valueC: number | null;
}

export interface ImuReading {
  status: SensorStatus;
  accelG: [number, number, number] | null;
  gyroDps: [number, number, number] | null;
}

export interface SensorFrame {
  /** Device uptime in ms — not wall-clock time. Never presented as UTC. */
  uptimeMs: number;
  flags: number;
  optical: OpticalReading;
  temperature: TemperatureReading;
  imu: ImuReading;
  /** Phone clock, epoch ms. */
  receivedAt: number;
  /** Documented as "live" for BLE, "demo" for the labelled demo source. */
  source: "live" | "demo";
  sequence: number | null;
  /** Derived in the app from the MAX30102 raw waveform. */
  heartRateBpm?: number | null;
  spo2Percent?: number | null;
  heartRateValid?: boolean;
  spo2Valid?: boolean;
  signalQuality?: SignalQuality;
}

export interface MeasurementRecord extends SensorFrame {
  id: string;
  uploaded: boolean;
  uploadedAt: string | null;
}

export type AlertSeverity = "info" | "warning" | "error";

export interface AlertRecord {
  id: string;
  createdAt: string;
  code: string;
  sensor: string | null;
  severity: AlertSeverity;
  title: string;
  message: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

export type ConnectionState =
  | "idle"
  | "bluetooth-off"
  | "requesting-permission"
  | "permission-denied"
  | "scanning"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";
