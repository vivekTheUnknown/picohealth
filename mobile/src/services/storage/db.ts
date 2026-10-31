import * as SQLite from "expo-sqlite";

import type { AlertRecord, MeasurementRecord } from "@/types/health";

/**
 * Local-first history. SQLite is the primary source in this version; the
 * backend is opt-in. Unavailable values are stored as NULL, never zero.
 */
const DATABASE_NAME = "picohealth.db";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS measurements (
          id TEXT PRIMARY KEY NOT NULL,
          received_at TEXT NOT NULL,
          received_ms INTEGER NOT NULL,
          uptime_ms INTEGER NOT NULL,
          sequence INTEGER,
          flags INTEGER NOT NULL,
          optical_status TEXT NOT NULL,
          temperature_status TEXT NOT NULL,
          imu_status TEXT NOT NULL,
          temperature_c REAL,
          red_raw INTEGER,
          ir_raw INTEGER,
          accel_json TEXT,
          gyro_json TEXT,
          samples INTEGER NOT NULL,
          source TEXT NOT NULL,
          heart_rate_bpm REAL,
          spo2_percent REAL,
          hr_valid INTEGER,
          spo2_valid INTEGER,
          signal_quality TEXT,
          perfusion_index_percent REAL,
          prv_rmssd_ms REAL,
          prv_beats INTEGER,
          activity_level TEXT,
          activity_rms_g REAL,
          orientation_class TEXT,
          roll_deg REAL,
          pitch_deg REAL,
          yaw_deg REAL,
          lateral_g_json TEXT,
          algorithm_version TEXT,
          uploaded INTEGER NOT NULL DEFAULT 0,
          uploaded_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_measurements_received
          ON measurements (received_ms DESC);

        CREATE TABLE IF NOT EXISTS alerts (
          id TEXT PRIMARY KEY NOT NULL,
          created_at TEXT NOT NULL,
          created_ms INTEGER NOT NULL,
          code TEXT NOT NULL,
          sensor TEXT,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          acknowledged INTEGER NOT NULL DEFAULT 0,
          acknowledged_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_alerts_created
          ON alerts (created_ms DESC);
      `);
      await ensureMeasurementColumns(database);
      return database;
    })();
  }
  return databasePromise;
}

/**
 * Adds the app-side processing columns to databases created by an earlier
 * build. CREATE TABLE IF NOT EXISTS does not alter existing tables.
 */
async function ensureMeasurementColumns(database: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await database.getAllAsync<{ name: string }>(
    `PRAGMA table_info(measurements)`,
  );
  const existing = new Set(columns.map((column) => column.name));
  const additions: Array<[string, string]> = [
    ["heart_rate_bpm", "REAL"],
    ["spo2_percent", "REAL"],
    ["hr_valid", "INTEGER"],
    ["spo2_valid", "INTEGER"],
    ["signal_quality", "TEXT"],
    ["perfusion_index_percent", "REAL"],
    ["prv_rmssd_ms", "REAL"],
    ["prv_beats", "INTEGER"],
    ["activity_level", "TEXT"],
    ["activity_rms_g", "REAL"],
    ["orientation_class", "TEXT"],
    ["roll_deg", "REAL"],
    ["pitch_deg", "REAL"],
    ["yaw_deg", "REAL"],
    ["lateral_g_json", "TEXT"],
    ["algorithm_version", "TEXT"],
  ];
  for (const [name, type] of additions) {
    if (!existing.has(name)) {
      await database.execAsync(`ALTER TABLE measurements ADD COLUMN ${name} ${type}`);
    }
  }
}

interface MeasurementRow {
  id: string;
  received_at: string;
  received_ms: number;
  uptime_ms: number;
  sequence: number | null;
  flags: number;
  optical_status: string;
  temperature_status: string;
  imu_status: string;
  temperature_c: number | null;
  red_raw: number | null;
  ir_raw: number | null;
  accel_json: string | null;
  gyro_json: string | null;
  samples: number;
  source: string;
  heart_rate_bpm: number | null;
  spo2_percent: number | null;
  hr_valid: number | null;
  spo2_valid: number | null;
  signal_quality: string | null;
  perfusion_index_percent: number | null;
  prv_rmssd_ms: number | null;
  prv_beats: number | null;
  activity_level: string | null;
  activity_rms_g: number | null;
  orientation_class: string | null;
  roll_deg: number | null;
  pitch_deg: number | null;
  yaw_deg: number | null;
  lateral_g_json: string | null;
  algorithm_version: string | null;
  uploaded: number;
  uploaded_at: string | null;
}

function parseTriple(json: string | null): [number, number, number] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (
      Array.isArray(parsed) &&
      parsed.length === 3 &&
      parsed.every((value) => typeof value === "number")
    ) {
      return parsed as [number, number, number];
    }
  } catch {
    /* corrupt row: treat as unavailable rather than guessing */
  }
  return null;
}

function toRecord(row: MeasurementRow): MeasurementRecord {
  return {
    id: row.id,
    receivedAt: row.received_ms,
    uptimeMs: row.uptime_ms,
    sequence: row.sequence,
    flags: row.flags,
    optical: {
      status: row.optical_status as MeasurementRecord["optical"]["status"],
      red: row.red_raw,
      ir: row.ir_raw,
      samples: row.samples,
    },
    temperature: {
      status: row.temperature_status as MeasurementRecord["temperature"]["status"],
      valueC: row.temperature_c,
    },
    imu: {
      status: row.imu_status as MeasurementRecord["imu"]["status"],
      accelG: parseTriple(row.accel_json),
      gyroDps: parseTriple(row.gyro_json),
    },
    source: row.source === "demo" ? "demo" : "live",
    heartRateBpm: row.heart_rate_bpm,
    spo2Percent: row.spo2_percent,
    heartRateValid: row.hr_valid === 1,
    spo2Valid: row.spo2_valid === 1,
    signalQuality:
      (row.signal_quality as MeasurementRecord["signalQuality"]) ?? undefined,
    perfusionIndexPercent: row.perfusion_index_percent,
    prvRmssdMs: row.prv_rmssd_ms,
    prvBeats: row.prv_beats ?? undefined,
    activityLevel:
      (row.activity_level as MeasurementRecord["activityLevel"]) ?? undefined,
    activityRmsG: row.activity_rms_g,
    orientationClass:
      (row.orientation_class as MeasurementRecord["orientationClass"]) ??
      undefined,
    rollDeg: row.roll_deg,
    pitchDeg: row.pitch_deg,
    yawDeg: row.yaw_deg,
    lateralG: parseTriple(row.lateral_g_json),
    algorithmVersion: row.algorithm_version ?? undefined,
    uploaded: row.uploaded === 1,
    uploadedAt: row.uploaded_at,
  };
}

export async function insertMeasurement(record: MeasurementRecord): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR IGNORE INTO measurements (
      id, received_at, received_ms, uptime_ms, sequence, flags,
      optical_status, temperature_status, imu_status,
      temperature_c, red_raw, ir_raw, accel_json, gyro_json, samples,
      source, heart_rate_bpm, spo2_percent, hr_valid, spo2_valid, signal_quality,
      perfusion_index_percent, prv_rmssd_ms, prv_beats,
      activity_level, activity_rms_g, orientation_class,
      roll_deg, pitch_deg, yaw_deg, lateral_g_json, algorithm_version,
      uploaded, uploaded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      new Date(record.receivedAt).toISOString(),
      record.receivedAt,
      record.uptimeMs,
      record.sequence,
      record.flags,
      record.optical.status,
      record.temperature.status,
      record.imu.status,
      record.temperature.valueC,
      record.optical.red,
      record.optical.ir,
      record.imu.accelG ? JSON.stringify(record.imu.accelG) : null,
      record.imu.gyroDps ? JSON.stringify(record.imu.gyroDps) : null,
      record.optical.samples,
      record.source,
      record.heartRateBpm ?? null,
      record.spo2Percent ?? null,
      record.heartRateValid ? 1 : 0,
      record.spo2Valid ? 1 : 0,
      record.signalQuality ?? null,
      record.perfusionIndexPercent ?? null,
      record.prvRmssdMs ?? null,
      record.prvBeats ?? null,
      record.activityLevel ?? null,
      record.activityRmsG ?? null,
      record.orientationClass ?? null,
      record.rollDeg ?? null,
      record.pitchDeg ?? null,
      record.yawDeg ?? null,
      record.lateralG ? JSON.stringify(record.lateralG) : null,
      record.algorithmVersion ?? null,
      record.uploaded ? 1 : 0,
      record.uploadedAt,
    ],
  );
}

export async function listMeasurements(options: {
  sinceMs?: number;
  limit?: number;
} = {}): Promise<MeasurementRecord[]> {
  const database = await getDatabase();
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 2000);
  const rows = options.sinceMs
    ? await database.getAllAsync<MeasurementRow>(
        `SELECT * FROM measurements WHERE received_ms >= ? ORDER BY received_ms DESC LIMIT ?`,
        [options.sinceMs, limit],
      )
    : await database.getAllAsync<MeasurementRow>(
        `SELECT * FROM measurements ORDER BY received_ms DESC LIMIT ?`,
        [limit],
      );
  return rows.map(toRecord);
}

export async function countMeasurements(): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM measurements`,
  );
  return row?.total ?? 0;
}

export async function clearMeasurements(): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`DELETE FROM measurements`);
}

export async function deleteMeasurementsBefore(cutoffMs: number): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `DELETE FROM measurements WHERE received_ms < ?`,
    [cutoffMs],
  );
  return result.changes ?? 0;
}

export async function listPendingUploads(limit = 25): Promise<MeasurementRecord[]> {
  const database = await getDatabase();
  // Demo records are synthetic and must never reach the portal, so they are
  // excluded from the queue rather than marked as uploaded.
  const rows = await database.getAllAsync<MeasurementRow>(
    `SELECT * FROM measurements
     WHERE uploaded = 0 AND source = 'live'
     ORDER BY received_ms ASC LIMIT ?`,
    [limit],
  );
  return rows.map(toRecord);
}

export async function countPendingUploads(): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM measurements
     WHERE uploaded = 0 AND source = 'live'`,
  );
  return row?.total ?? 0;
}

export async function markUploaded(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE measurements SET uploaded = 1, uploaded_at = ? WHERE id = ?`,
    [new Date().toISOString(), id],
  );
}

interface AlertRow {
  id: string;
  created_at: string;
  code: string;
  sensor: string | null;
  severity: string;
  title: string;
  message: string;
  acknowledged: number;
  acknowledged_at: string | null;
}

function toAlert(row: AlertRow): AlertRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    code: row.code,
    sensor: row.sensor,
    severity: row.severity as AlertRecord["severity"],
    title: row.title,
    message: row.message,
    acknowledged: row.acknowledged === 1,
    acknowledgedAt: row.acknowledged_at,
  };
}

/** True when the same condition was already reported recently and not dismissed. */
export async function hasOpenAlert(
  code: string,
  sinceMs: number,
): Promise<boolean> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM alerts
     WHERE code = ? AND acknowledged = 0 AND created_ms >= ?`,
    [code, sinceMs],
  );
  return (row?.total ?? 0) > 0;
}

export async function insertAlert(record: AlertRecord): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR IGNORE INTO alerts (
      id, created_at, created_ms, code, sensor, severity, title, message,
      acknowledged, acknowledged_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.createdAt,
      new Date(record.createdAt).getTime(),
      record.code,
      record.sensor,
      record.severity,
      record.title,
      record.message,
      record.acknowledged ? 1 : 0,
      record.acknowledgedAt,
    ],
  );
}

export async function listAlerts(limit = 200): Promise<AlertRecord[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<AlertRow>(
    `SELECT * FROM alerts ORDER BY created_ms DESC LIMIT ?`,
    [Math.min(Math.max(limit, 1), 500)],
  );
  return rows.map(toAlert);
}

export async function acknowledgeAlert(id: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE alerts SET acknowledged = 1, acknowledged_at = ? WHERE id = ?`,
    [new Date().toISOString(), id],
  );
}

export async function clearAlerts(): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(`DELETE FROM alerts`);
}
