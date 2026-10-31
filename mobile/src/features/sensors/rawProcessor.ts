import {
  GyroBiasEstimator,
  decodeImuRaw,
  type ImuResult,
  type ImuRawAxes,
} from "@/features/sensors/imu";
import {
  Max30102Processor,
  type OpticalResult,
} from "@/features/sensors/max30102/processor";
import {
  decodeLm75a,
  type TemperatureResult,
} from "@/features/sensors/temperature";
import {
  activityLevelFromRms,
  dynamicAcceleration,
  integrateYaw,
  magnitude,
  orientationClassFromAccel,
  rollPitchFromAccel,
  updateGravity,
  type Vec3,
} from "@/features/sensors/orientation";
import type { ActivityLevel, DeviceOrientation } from "@/types/health";
import type { RawMessage } from "@/features/sensors/rawProtocol";

/**
 * Turns the raw BLE streams into validated sensor state.
 *
 * All engineering-unit conversion happens here or in the sensor modules; the
 * UI only reads this snapshot.
 */
export interface RawSnapshot {
  /** Phone wall-clock time of the sample that produced this snapshot. */
  receivedAt: number;
  /** Device uptime for the newest optical batch. Not a wall clock. */
  uptimeMs: number;
  temperature: TemperatureResult | null;
  imu: ImuResult | null;
  optical: OpticalResult;
  whoAmI: number | null;
  tempAddr: number | null;
  lastSeq: number | null;
  sensorError: { sensor: string; message: string } | null;
  /** Roll/pitch from gravity; yaw integrated from gyro (drifts). */
  orientation: { roll: number; pitch: number; yaw: number } | null;
  /** Gravity-removed acceleration (lateral / centripetal-style). */
  lateralG: Vec3 | null;
  activityRmsG: number | null;
  activityLevel: ActivityLevel;
  orientationClass: DeviceOrientation | null;
}

export class RawSensorProcessor {
  private whoAmI: number | null = null;
  private tempAddr: number | null = null;
  private temperature: TemperatureResult | null = null;
  private imu: ImuResult | null = null;
  private readonly optical = new Max30102Processor();
  private readonly bias = new GyroBiasEstimator();
  private lastSeq: number | null = null;
  private sensorError: { sensor: string; message: string } | null = null;
  private lastEmitAt = 0;
  private latest: RawSnapshot | null = null;
  private gravity: Vec3 | null = null;
  private yaw = 0;
  private lastImuMs: number | null = null;
  private roll = 0;
  private pitch = 0;
  private lateralG: Vec3 | null = null;
  private activityWindow: number[] = [];
  private activityRmsG: number | null = null;
  private activityLevel: ActivityLevel = "unknown";
  private orientationClass: DeviceOrientation | null = null;

  constructor(
    private readonly onSnapshot: (snapshot: RawSnapshot) => void,
    private readonly minIntervalMs = 1900,
  ) {}

  get snapshot(): RawSnapshot | null {
    return this.latest;
  }

  ingest(message: RawMessage, receivedAt: number = Date.now()): void {
    switch (message.kind) {
      case "status": {
        this.whoAmI = message.whoAmI;
        this.tempAddr = message.tempAddr;
        // Re-evaluate the current IMU reading if the identity arrives later.
        if (this.imu && message.whoAmI !== null) {
          this.imu = decodeImuRaw(this.imu.raw, message.whoAmI);
          this.applyBias();
        }
        break;
      }
      case "temperature_raw": {
        this.lastSeq = message.seq;
        this.temperature = decodeLm75a(message.raw);
        this.sensorError =
          this.temperature.status === "ok" ? null : this.sensorError;
        this.emit(receivedAt, message.ms, false);
        break;
      }
      case "imu_raw": {
        this.lastSeq = message.seq;
        this.imu = decodeImuRaw(message.axes, this.whoAmI);
        this.applyBias();
        this.updateOrientation(message.ms);
        this.emit(receivedAt, message.ms, false);
        break;
      }
      case "optical_batch": {
        const { batch } = message;
        const lastIndex = batch.samples.length - 1;
        const uptimeMs = batch.firstMs + (lastIndex * 1000) / batch.rateHz;
        this.optical.addBatch(batch);
        this.emit(receivedAt, uptimeMs, true);
        break;
      }
      case "sensor_error": {
        this.sensorError = { sensor: message.sensor, message: message.message };
        this.emit(receivedAt, message.ms, true);
        break;
      }
      default:
        break;
    }
  }

  reset(): void {
    this.whoAmI = null;
    this.tempAddr = null;
    this.temperature = null;
    this.imu = null;
    this.bias.reset();
    this.optical.reset();
    this.lastSeq = null;
    this.sensorError = null;
    this.latest = null;
    this.lastEmitAt = 0;
    this.gravity = null;
    this.yaw = 0;
    this.lastImuMs = null;
    this.roll = 0;
    this.pitch = 0;
    this.lateralG = null;
    this.activityWindow = [];
    this.activityRmsG = null;
    this.activityLevel = "unknown";
    this.orientationClass = null;
  }

  /** Runs at the IMU rate (20 Hz), not the 1 Hz snapshot rate. */
  private updateOrientation(imuMs: number): void {
    const accel = this.imu?.valid ? this.imu.accelG : null;
    const gyro = this.imu?.valid ? this.imu.gyroDps : null;
    if (!accel || !gyro) return;

    const dt = this.lastImuMs === null ? 0 : imuMs - this.lastImuMs;
    this.lastImuMs = imuMs;

    this.yaw = integrateYaw(this.yaw, gyro[2], dt);
    this.gravity = updateGravity(this.gravity, accel);
    const angles = rollPitchFromAccel(accel);
    this.roll = angles.roll;
    this.pitch = angles.pitch;
    this.lateralG = dynamicAcceleration(accel, this.gravity);
    this.orientationClass = orientationClassFromAccel(accel);

    this.activityWindow.push(magnitude(this.lateralG));
    if (this.activityWindow.length > 100) this.activityWindow.shift();
    const meanSquare =
      this.activityWindow.reduce((sum, value) => sum + value * value, 0) /
      this.activityWindow.length;
    this.activityRmsG = Number(Math.sqrt(meanSquare).toFixed(3));
    this.activityLevel = activityLevelFromRms(this.activityRmsG);
    this.optical.setMotionRms(this.activityRmsG);
  }

  private applyBias(): void {
    if (!this.imu?.valid || !this.imu.gyroDps) return;
    this.bias.add(this.imu.accelG ?? [0, 0, 0], this.imu.gyroDps);
    this.imu = { ...this.imu, gyroDps: this.bias.apply(this.imu.gyroDps) };
  }

  private emit(receivedAt: number, uptimeMs: number, force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastEmitAt < this.minIntervalMs) return;
    this.lastEmitAt = now;

    this.latest = {
      receivedAt,
      uptimeMs,
      temperature: this.temperature,
      imu: this.imu,
      optical: this.optical.latest,
      whoAmI: this.whoAmI,
      tempAddr: this.tempAddr,
      lastSeq: this.lastSeq,
      sensorError: this.sensorError,
      orientation: this.imu?.valid
        ? { roll: this.roll, pitch: this.pitch, yaw: this.yaw }
        : null,
      lateralG: this.lateralG,
      activityRmsG: this.activityRmsG,
      activityLevel: this.activityLevel,
      orientationClass: this.orientationClass,
    };
    this.onSnapshot(this.latest);
  }
}

export type { ImuRawAxes, TemperatureResult, OpticalResult };
