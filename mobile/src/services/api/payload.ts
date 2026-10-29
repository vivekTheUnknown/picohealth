import type { MeasurementRecord } from "@/types/health";

/**
 * Upload payload for the starter FastAPI.
 *
 * Only values whose sensor status is `ok` are sent. Unavailable, unvalidated,
 * and errored readings become `null` — never zero, and never a number the
 * firmware did not mark valid.
 *
 * `client_measurement_id` is included so a future backend can enforce
 * idempotency; the starter API ignores unknown fields and does not yet
 * de-duplicate. See README ("Known limitations").
 */
export interface BackendMeasurement {
  patient_id: number;
  device_id: string;
  uptime_ms: number;
  sensor_flags: number;
  temperature_c: number | null;
  red_raw: number | null;
  ir_raw: number | null;
  accel_g: number[] | null;
  gyro_dps: number[] | null;
  optical_samples: number;
  client_measurement_id: string;
}

export function toBackendMeasurement(
  record: MeasurementRecord,
  options: { patientId: number; deviceId: string },
): BackendMeasurement {
  const opticalOk = record.optical.status === "ok";
  const temperatureOk = record.temperature.status === "ok";
  const imuOk = record.imu.status === "ok";

  return {
    patient_id: options.patientId,
    device_id: options.deviceId,
    uptime_ms: record.uptimeMs,
    sensor_flags: record.flags,
    temperature_c: temperatureOk ? record.temperature.valueC : null,
    red_raw: opticalOk ? record.optical.red : null,
    ir_raw: opticalOk ? record.optical.ir : null,
    accel_g: imuOk ? record.imu.accelG : null,
    gyro_dps: imuOk ? record.imu.gyroDps : null,
    optical_samples: opticalOk ? record.optical.samples : 0,
    client_measurement_id: record.id,
  };
}
