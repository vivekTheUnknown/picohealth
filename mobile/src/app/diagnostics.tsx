import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Screen, ScreenHeader } from "@/components/ui/layout";
import { Badge, Card, Divider, InfoRow, SectionTitle } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import { usePicoHealth } from "@/features/app/PicoHealthProvider";
import { spacing, type, useTheme } from "@/theme/tokens";

/**
 * Raw diagnostics: the unprocessed values as received. This is deliberately
 * separate from the dashboard, which shows only validated/derived state.
 */
export default function DiagnosticsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { rawSnapshot } = usePicoHealth();

  return (
    <Screen>
      <View style={styles.headerRow}>
        <ScreenHeader
          title="Raw diagnostics"
          subtitle="Unprocessed sensor values, exactly as received over BLE."
        />
        <Ionicons name="close" size={24} color={colors.textMuted} onPress={() => router.back()} />
      </View>

      {!rawSnapshot ? (
        <Card>
          <EmptyState
            icon="analytics-outline"
            title="No raw data yet"
            description="Connect the wearable and wait for the first optical batch. Nothing is synthesised here."
          />
        </Card>
      ) : (
        <>
          <SectionTitle>Stream</SectionTitle>
          <Card>
            <InfoRow label="Last sequence" value={String(rawSnapshot.lastSeq ?? "—")} />
            <InfoRow label="Device uptime" value={`${Math.round(rawSnapshot.uptimeMs)} ms`} />
            <InfoRow
              label="IMU identity"
              value={
                rawSnapshot.whoAmI === null
                  ? "not reported"
                  : `0x${rawSnapshot.whoAmI.toString(16)}`
              }
            />
            <InfoRow
              label="Temperature address"
              value={
                rawSnapshot.tempAddr === null
                  ? "not detected"
                  : `0x${rawSnapshot.tempAddr.toString(16)}`
              }
            />
            <InfoRow
              label="Optical rate"
              value={`${rawSnapshot.optical.sampleRateHz} Hz (measured)`}
            />
            <InfoRow
              label="Optical quality"
              value={<Badge label={rawSnapshot.optical.status} tone="neutral" />}
            />
          </Card>

          <SectionTitle>Temperature</SectionTitle>
          <Card>
            <InfoRow label="Raw register" value={String(rawSnapshot.temperature?.raw ?? "—")} />
            <InfoRow
              label="Decoded"
              value={
                rawSnapshot.temperature?.valid && rawSnapshot.temperature.valueC !== null
                  ? `${rawSnapshot.temperature.valueC.toFixed(3)} °C`
                  : "—"
              }
            />
          </Card>

          <SectionTitle>Optical (raw counts)</SectionTitle>
          <Card>
            <InfoRow label="Red" value={String(rawSnapshot.optical.red ?? "—")} />
            <InfoRow label="IR" value={String(rawSnapshot.optical.ir ?? "—")} />
            <InfoRow
              label="Window"
              value={`${rawSnapshot.optical.windowSamples} samples`}
            />
            <InfoRow
              label="Contact"
              value={rawSnapshot.optical.contact ? "yes" : "no"}
            />
            <InfoRow
              label="Clipped"
              value={rawSnapshot.optical.clipped ? "yes" : "no"}
            />
            <InfoRow
              label="DC level (mean IR)"
              value={String(rawSnapshot.optical.dcLevel ?? "—")}
            />
            <InfoRow
              label="AC amplitude"
              value={String(rawSnapshot.optical.acAmplitude ?? "—")}
            />
          </Card>

          <SectionTitle>IMU (raw axes)</SectionTitle>
          <Card>
            <InfoRow
              label="Accel raw"
              value={
                rawSnapshot.imu
                  ? `${rawSnapshot.imu.raw.ax}, ${rawSnapshot.imu.raw.ay}, ${rawSnapshot.imu.raw.az}`
                  : "—"
              }
            />
            <InfoRow
              label="Gyro raw"
              value={
                rawSnapshot.imu
                  ? `${rawSnapshot.imu.raw.gx}, ${rawSnapshot.imu.raw.gy}, ${rawSnapshot.imu.raw.gz}`
                  : "—"
              }
            />
            <Divider />
            <InfoRow
              label="Accel"
              value={
                rawSnapshot.imu?.accelG
                  ? `${rawSnapshot.imu.accelG.map((axis) => axis.toFixed(3)).join(", ")} g`
                  : "—"
              }
            />
            <InfoRow
              label="Gyro"
              value={
                rawSnapshot.imu?.gyroDps
                  ? `${rawSnapshot.imu.gyroDps.map((axis) => axis.toFixed(2)).join(", ")} °/s`
                  : "—"
              }
            />
          </Card>

          {rawSnapshot.sensorError ? (
            <Card>
              <Text style={[styles.error, { color: colors.danger }]}>
                {rawSnapshot.sensorError.sensor}: {rawSnapshot.sensorError.message}
              </Text>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  error: { fontSize: type.small, lineHeight: 20 },
});
