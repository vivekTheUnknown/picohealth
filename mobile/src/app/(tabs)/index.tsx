import { Ionicons } from "@expo/vector-icons";
import { Linking, StyleSheet, Text, View } from "react-native";

import {
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  InfoRow,
  SectionTitle,
} from "@/components/ui/primitives";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Screen, ScreenHeader } from "@/components/ui/layout";
import { usePicoHealth } from "@/features/app/PicoHealthProvider";
import { describeAge, freshnessFor } from "@/features/measurements/staleness";
import { opticalStateView } from "@/features/measurements/optical";
import { temperatureTrend } from "@/features/measurements/trends";
import {
  ACTIVITY_LABELS,
  ORIENTATION_LABELS,
} from "@/features/measurements/labels";
import {
  imuDetail,
  imuValue,
  opticalDetail,
  opticalPresentation,
  opticalValue,
  sensorStatus,
  temperatureDetail,
  temperatureValue,
} from "@/features/measurements/present";
import { formatDateTime } from "@/utils/format";
import { spacing, type, useTheme } from "@/theme/tokens";
import type { ConnectionState } from "@/types/health";

const CONNECTION: Record<
  ConnectionState,
  { label: string; tone: "neutral" | "accent" | "success" | "warning" | "danger" | "info"; icon: React.ComponentProps<typeof Ionicons>["name"] }
> = {
  idle: { label: "Disconnected", tone: "neutral", icon: "bluetooth-outline" },
  "bluetooth-off": { label: "Bluetooth off", tone: "danger", icon: "bluetooth-outline" },
  "requesting-permission": { label: "Requesting permission", tone: "info", icon: "shield-outline" },
  "permission-denied": { label: "Permission denied", tone: "danger", icon: "shield-outline" },
  scanning: { label: "Scanning", tone: "info", icon: "search-outline" },
  connecting: { label: "Connecting", tone: "info", icon: "bluetooth-outline" },
  connected: { label: "Connected", tone: "success", icon: "checkmark-circle" },
  reconnecting: { label: "Reconnecting", tone: "warning", icon: "refresh-outline" },
  error: { label: "Connection error", tone: "danger", icon: "close-circle" },
};

const BUSY = new Set<ConnectionState>([
  "requesting-permission",
  "scanning",
  "connecting",
  "reconnecting",
]);

export default function DashboardScreen() {
  const { colors } = useTheme();
  const { settings, ble, frame, now, frameCount, series } = usePicoHealth();

  const connection = CONNECTION[ble.state];
  const streaming = settings.demoMode || ble.state === "connected";
  const freshness = frame
    ? freshnessFor(frame.receivedAt, now, settings.staleAfterMs)
    : "none";
  const isStale = streaming && freshness === "stale";
  const busy = BUSY.has(ble.state);
  const pulse = frame?.signalQuality
    ? opticalStateView(frame.signalQuality)
    : {
        label: "No estimate",
        tone: "neutral" as const,
        icon: "remove-circle" as const,
        detail: "No optical state is available yet.",
      };
  const trend = temperatureTrend(series, 5 * 60_000, now);

  return (
    <Screen>
      <ScreenHeader title="PicoHealth" subtitle="Wearable prototype" />

      {settings.demoMode ? (
        <Banner tone="warning" title="DEMO DATA">
          These values are generated on this phone. They are not from a wearable and are never
          uploaded.
        </Banner>
      ) : null}

      <Card>
        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Device</Text>
          <Badge label={connection.label} tone={connection.tone} icon={connection.icon} />
        </View>

        <Text
          style={[styles.deviceName, { color: colors.text }]}
          accessibilityLiveRegion="polite"
        >
          {settings.demoMode ? "Demo source" : settings.deviceName}
        </Text>

        <Text style={[styles.deviceMeta, { color: colors.textMuted }]}>
          {frame
            ? `Last update ${formatDateTime(new Date(frame.receivedAt).toISOString())} · ${describeAge(frame.receivedAt, now)}`
            : "No data received yet"}
        </Text>

        {isStale ? (
          <Banner tone="warning" title="Data is stale">
            No frame has arrived for more than {Math.round(settings.staleAfterMs / 1000)} seconds.
            The values below are the last known reading, not current measurements.
          </Banner>
        ) : null}

        {ble.transportMessage ? (
          <Banner tone="info" title="TEST message received">
            {ble.transportMessage} — this proves the notification path works. It is not a sensor
            reading.
          </Banner>
        ) : null}

        {ble.protocolError ? (
          <Text style={[styles.technical, { color: colors.danger }]}>
            Protocol: {ble.protocolError}
          </Text>
        ) : null}

        {ble.error ? (
          <ErrorState
            title="Bluetooth problem"
            description={ble.error}
            onRetry={
              ble.state === "permission-denied"
                ? () => {
                    void Linking.openSettings();
                  }
                : ble.state === "bluetooth-off" || ble.state === "error"
                  ? () => {
                      void ble.connect();
                    }
                  : undefined
            }
            retryLabel={ble.state === "permission-denied" ? "Open settings" : "Retry"}
          />
        ) : null}

        <Divider />

        <View style={styles.buttonRow}>
          {streaming && !settings.demoMode ? (
            <View style={styles.flex}>
              <Button
                label="Disconnect"
                variant="secondary"
                icon="close"
                onPress={() => {
                  void ble.disconnect();
                }}
                accessibilityHint="Stops receiving data from the wearable"
              />
            </View>
          ) : (
            <View style={styles.flex}>
              <Button
                label={ble.state === "reconnecting" ? "Reconnect now" : "Connect device"}
                onPress={() => {
                  void ble.connect();
                }}
                icon="bluetooth"
                loading={busy}
                disabled={settings.demoMode}
                accessibilityHint="Scans for the PicoHealth wearable and subscribes to notifications"
              />
            </View>
          )}
        </View>

        {settings.demoMode ? (
          <Text style={[styles.technical, { color: colors.textSubtle }]}>
            Turn off Demo data in Settings to connect a real device.
          </Text>
        ) : null}

        {ble.droppedFrames > 0 ? (
          <Text style={[styles.technical, { color: colors.textSubtle }]}>
            {ble.droppedFrames} malformed or incomplete frame
            {ble.droppedFrames === 1 ? "" : "s"} discarded.
          </Text>
        ) : null}
      </Card>

      <SectionTitle
        right={
          streaming && freshness === "live" ? (
            <Badge label="Live" tone="success" icon="radio" />
          ) : freshness === "stale" ? (
            <Badge label="Stale" tone="warning" icon="time-outline" />
          ) : (
            <Badge label="No data" tone="neutral" icon="remove-circle" />
          )
        }
      >
        Sensor status
      </SectionTitle>

      {frame ? (
        <>
          <Card>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Ionicons name="heart" size={18} color={colors.accent} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Pulse & oxygen</Text>
              </View>
              <Badge
                label={pulse.label}
                tone={pulse.tone}
                icon={pulse.icon}
              />
            </View>

            <View style={styles.pulseRow}>
              <View style={styles.pulseMetric}>
                <Text style={[styles.pulseValue, { color: colors.text }]}>
                  {frame.heartRateValid && frame.heartRateBpm != null
                    ? Math.round(frame.heartRateBpm)
                    : "--"}
                </Text>
                <Text style={[styles.pulseUnit, { color: colors.textMuted }]}>
                  bpm (estimate)
                </Text>
              </View>
              <View style={styles.pulseMetric}>
                <Text style={[styles.pulseValue, { color: colors.text }]}>
                  {frame.spo2Valid && frame.spo2Percent != null
                    ? frame.spo2Percent
                    : "--"}
                </Text>
                <Text style={[styles.pulseUnit, { color: colors.textMuted }]}>
                  % SpO₂ (estimate)
                </Text>
              </View>
            </View>

            <View style={styles.derivedRow}>
              <View style={styles.derivedItem}>
                <Text style={[styles.derivedLabel, { color: colors.textSubtle }]}>
                  Perfusion index (IR)
                </Text>
                <Text style={[styles.derivedValue, { color: colors.text }]}>
                  {frame.perfusionIndexPercent != null
                    ? `${frame.perfusionIndexPercent.toFixed(2)}%`
                    : "--"}
                </Text>
              </View>
              <View style={styles.derivedItem}>
                <Text style={[styles.derivedLabel, { color: colors.textSubtle }]}>
                  PRV (RMSSD)
                </Text>
                <Text style={[styles.derivedValue, { color: colors.text }]}>
                  {frame.prvRmssdMs != null
                    ? `${frame.prvRmssdMs} ms`
                    : "--"}
                </Text>
                <Text style={[styles.derivedHint, { color: colors.textSubtle }]}>
                  {frame.prvBeats ? `${frame.prvBeats} beats` : "needs 12 beats"}
                </Text>
              </View>
            </View>

            <Text style={[styles.detail, { color: colors.textMuted }]}>
              {pulse.detail}
            </Text>
            <Text style={[styles.technical, { color: colors.textSubtle }]}>
              Derived in the app from raw MAX30102 red/IR samples using the
              adaptive PPG detector. Not clinically calibrated.
            </Text>
          </Card>

          <Card>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Ionicons name="pulse" size={18} color={colors.accent} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Optical sensor</Text>
              </View>
              <Badge
                label={opticalPresentation(frame).label}
                tone={opticalPresentation(frame).tone}
                icon={opticalPresentation(frame).icon}
              />
            </View>
            <Text style={[styles.metric, { color: colors.text }]}>{opticalValue(frame)}</Text>
            <Text style={[styles.detail, { color: colors.textMuted }]}>
              {opticalDetail(frame)}
            </Text>
            <Text style={[styles.technical, { color: colors.textSubtle }]}>
              Raw optical counts. Not heart rate and not SpO₂; no pulse algorithm is applied.
            </Text>
          </Card>

          <Card>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Ionicons name="thermometer" size={18} color={colors.accent} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Temperature</Text>
              </View>
              <Badge
                label={sensorStatus(frame.temperature.status).label}
                tone={sensorStatus(frame.temperature.status).tone}
                icon={sensorStatus(frame.temperature.status).icon}
              />
            </View>
            <Text style={[styles.metric, { color: colors.text }]}>
              {temperatureValue(frame)}
            </Text>
            <Text style={[styles.detail, { color: colors.textMuted }]}>
              {temperatureDetail(frame)}
            </Text>
            <Text style={[styles.technical, { color: colors.textSubtle }]}>
              {trend.deltaC !== null
                ? `${trend.deltaC >= 0 ? "+" : ""}${trend.deltaC.toFixed(2)} °C over ${trend.windowMinutes} min · average ${trend.averageC?.toFixed(2)} °C`
                : "Trend needs at least two samples in the last 5 minutes."}
            </Text>
          </Card>

          <Card>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Ionicons name="body" size={18} color={colors.accent} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Motion (IMU)</Text>
              </View>
              <Badge
                label={sensorStatus(frame.imu.status).label}
                tone={sensorStatus(frame.imu.status).tone}
                icon={sensorStatus(frame.imu.status).icon}
              />
            </View>
            <Text style={[styles.imuValue, { color: colors.text }]}>{imuValue(frame)}</Text>
            <Text style={[styles.detail, { color: colors.textMuted }]}>{imuDetail(frame)}</Text>
          </Card>

          <Card>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Ionicons name="walk" size={18} color={colors.accent} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>
                  Movement & orientation
                </Text>
              </View>
              <Badge
                label={ACTIVITY_LABELS[frame.activityLevel ?? "unknown"]}
                tone={
                  frame.activityLevel === "high_activity"
                    ? "warning"
                    : frame.activityLevel === "moderate_activity"
                      ? "info"
                      : "neutral"
                }
                icon="walk"
              />
            </View>
            <InfoRow
              label="Dynamic RMS"
              value={
                frame.activityRmsG != null
                  ? `${frame.activityRmsG.toFixed(3)} g`
                  : "—"
              }
            />
            <InfoRow
              label="Device orientation"
              value={ORIENTATION_LABELS[frame.orientationClass ?? "unknown"]}
            />
            <Text style={[styles.technical, { color: colors.textSubtle }]}>
              Movement thresholds are uncalibrated for wearing position. This is device
              orientation, not body posture.
            </Text>
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState
            icon="hardware-chip-outline"
            title="No sensor data yet"
            description={
              settings.demoMode
                ? "The demo source starts on the next tick."
                : ble.state === "connected"
                  ? "Connected. Waiting for the first frame; the device normally sends one per second."
                  : "Connect the wearable to see live sensor status. Nothing is simulated while disconnected."
            }
          />
        </Card>
      )}

      <Card>
        <InfoRow label="Frames this session" value={String(frameCount)} />
        <InfoRow label="Source" value={settings.demoMode ? "Demo (generated)" : "Bluetooth LE"} />
        <Text style={[styles.footer, { color: colors.textSubtle }]}>
          Prototype only. Not a medical device, not validated for diagnosis, and not an emergency
          monitoring service.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1 },
  cardTitle: { fontSize: type.section, fontWeight: "700" },
  deviceName: { fontSize: type.body, fontWeight: "600" },
  deviceMeta: { fontSize: type.small, lineHeight: 19 },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  pulseRow: {
    flexDirection: "row",
    gap: spacing.xxl,
    marginTop: spacing.xs,
  },
  pulseMetric: { flex: 1, gap: 2 },
  pulseValue: {
    fontSize: 30,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.5,
  },
  pulseUnit: { fontSize: type.caption },
  derivedRow: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  derivedItem: { flex: 1, gap: 1 },
  derivedLabel: { fontSize: type.caption },
  derivedValue: {
    fontSize: 16,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  derivedHint: { fontSize: 10 },
  metric: {
    fontSize: type.metric,
    fontWeight: "700",
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  imuValue: {
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  detail: { fontSize: type.small, lineHeight: 20 },
  technical: { fontSize: type.caption, lineHeight: 17 },
  footer: { fontSize: type.caption, lineHeight: 17, marginTop: spacing.xs },
});
