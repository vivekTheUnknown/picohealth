import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AccelerationVector } from "@/components/charts/AccelerationVector";
import {
  TimeSeriesChart,
  type ChartSeries,
} from "@/components/charts/TimeSeriesChart";
import { Screen, ScreenHeader } from "@/components/ui/layout";
import { Badge, Card, SectionTitle } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/states";
import { usePicoHealth } from "@/features/app/PicoHealthProvider";
import { describeAge } from "@/features/measurements/staleness";
import { spacing, type, useTheme } from "@/theme/tokens";

const RANGES = [
  { id: 60_000, label: "1 min" },
  { id: 300_000, label: "5 min" },
  { id: 900_000, label: "15 min" },
] as const;

export default function LiveScreen() {
  const { colors } = useTheme();
  const { series, now, frame, settings } = usePicoHealth();
  const [windowMs, setWindowMs] = useState<number>(300_000);

  const latest = series.at(-1) ?? null;
  const stale = latest ? now - latest.t : null;

  const temperatureSeries: ChartSeries[] = [
    {
      key: "temp",
      label: "Temperature",
      color: colors.accent,
      points: series.map((point) => ({ t: point.t, v: point.temperatureC })),
    },
  ];
  const heartRateSeries: ChartSeries[] = [
    {
      key: "hr",
      label: "Heart rate",
      color: colors.danger,
      points: series.map((point) => ({ t: point.t, v: point.heartRateBpm })),
    },
  ];
  const spo2Series: ChartSeries[] = [
    {
      key: "spo2",
      label: "SpO₂",
      color: colors.info,
      points: series.map((point) => ({ t: point.t, v: point.spo2Percent })),
    },
  ];
  const orientationSeries: ChartSeries[] = [
    {
      key: "roll",
      label: "Roll",
      color: colors.accent,
      points: series.map((point) => ({ t: point.t, v: point.roll })),
    },
    {
      key: "pitch",
      label: "Pitch",
      color: colors.info,
      points: series.map((point) => ({ t: point.t, v: point.pitch })),
    },
    {
      key: "yaw",
      label: "Yaw",
      color: colors.warning,
      points: series.map((point) => ({ t: point.t, v: point.yaw })),
    },
  ];

  const trail = series
    .slice(-40)
    .map((point) => point.lateralG)
    .filter((vector): vector is [number, number, number] => vector !== null)
    .map((vector) => [vector[0], vector[1]] as [number, number]);

  return (
    <Screen>
      <ScreenHeader
        title="Live"
        subtitle="Rolling graphs from the raw streams. Values update once per second."
      />

      {!latest ? (
        <Card>
          <EmptyState
            icon="analytics-outline"
            title="No live data yet"
            description={
              settings.demoMode
                ? "Demo mode generates processed frames, not raw sensor streams, so there is nothing to graph."
                : "Connect the wearable. Temperature and orientation appear with the first raw message; pulse graphs need a valid optical window."
            }
          />
        </Card>
      ) : (
        <>
          <View style={styles.toolbar}>
            <View style={styles.chips}>
              {RANGES.map((range) => {
                const selected = range.id === windowMs;
                return (
                  <Pressable
                    key={range.id}
                    onPress={() => setWindowMs(range.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: selected ? colors.accentSoft : colors.surface,
                        borderColor: selected ? colors.accent : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: selected ? colors.accent : colors.textMuted,
                        fontSize: type.small,
                        fontWeight: "600",
                      }}
                    >
                      {range.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.meta, { color: colors.textSubtle }]}>
              Last sample {describeAge(latest.t, now)}
            </Text>
          </View>

          {frame?.signalQuality ? (
            <Badge
              label={
                frame.signalQuality === "valid"
                  ? "Pulse estimate available"
                  : frame.signalQuality === "collecting"
                    ? "Collecting optical window"
                    : frame.signalQuality === "no_contact"
                      ? "Place finger for pulse"
                      : frame.signalQuality === "poor_signal"
                        ? "Optical signal poor"
                        : "Optical sensor error"
              }
              tone={
                frame.signalQuality === "valid"
                  ? "success"
                  : frame.signalQuality === "sensor_error"
                    ? "danger"
                    : frame.signalQuality === "collecting"
                      ? "info"
                      : "warning"
              }
            />
          ) : null}

          <SectionTitle
            right={
              <Text style={[styles.current, { color: colors.text }]}>
                {latest.temperatureC !== null
                  ? `${latest.temperatureC.toFixed(1)} °C`
                  : "--"}
              </Text>
            }
          >
            Temperature
          </SectionTitle>
          <Card>
            <TimeSeriesChart
              series={temperatureSeries}
              windowMs={windowMs}
              now={now}
              unit="°C"
              yMin={15}
              yMax={40}
              formatValue={(value) => value.toFixed(1)}
              emptyLabel="No decoded temperature in this window"
            />
          </Card>

          <SectionTitle
            right={
              <Text style={[styles.current, { color: colors.text }]}>
                {latest.heartRateBpm !== null
                  ? `${Math.round(latest.heartRateBpm)} bpm`
                  : "--"}
              </Text>
            }
          >
            Heart rate <Text style={[styles.estimate, { color: colors.textSubtle }]}>estimate</Text>
          </SectionTitle>
          <Card>
            <TimeSeriesChart
              series={heartRateSeries}
              windowMs={windowMs}
              now={now}
              unit="bpm"
              formatValue={(value) => String(Math.round(value))}
              emptyLabel="No valid pulse window yet — place a finger on the sensor"
            />
          </Card>

          <SectionTitle
            right={
              <Text style={[styles.current, { color: colors.text }]}>
                {latest.spo2Percent !== null ? `${latest.spo2Percent}%` : "--"}
              </Text>
            }
          >
            SpO₂ <Text style={[styles.estimate, { color: colors.textSubtle }]}>estimate</Text>
          </SectionTitle>
          <Card>
            <TimeSeriesChart
              series={spo2Series}
              windowMs={windowMs}
              now={now}
              unit="%"
              yMin={70}
              yMax={100}
              formatValue={(value) => String(Math.round(value))}
              emptyLabel="No valid SpO₂ window yet"
            />
          </Card>

          <SectionTitle>Lateral / centripetal acceleration</SectionTitle>
          <Card>
            <AccelerationVector vector={latest.lateralG} trail={trail} />
            <Text style={[styles.note, { color: colors.textSubtle }]}>
              Gravity-removed acceleration in the sensor's X-Y plane, updated at 20 Hz.
              True centripetal acceleration also needs the rotation radius, which one IMU
              cannot measure; this diagram shows the lateral component instead.
            </Text>
          </Card>

          <SectionTitle
            right={
              <Text style={[styles.current, { color: colors.text }]}>
                {latest.roll !== null
                  ? `${Math.round(latest.roll)}° / ${Math.round(latest.pitch ?? 0)}° / ${Math.round(latest.yaw ?? 0)}°`
                  : "--"}
              </Text>
            }
          >
            Orientation
          </SectionTitle>
          <Card>
            <TimeSeriesChart
              series={orientationSeries}
              windowMs={windowMs}
              now={now}
              unit="degrees"
              yMin={-180}
              yMax={180}
              formatValue={(value) => `${Math.round(value)}°`}
              emptyLabel="No orientation samples yet"
            />
            <View style={styles.readouts}>
              <Readout label="Roll" value={latest.roll} />
              <Readout label="Pitch" value={latest.pitch} />
              <Readout label="Yaw" value={latest.yaw} />
            </View>
            <Text style={[styles.note, { color: colors.textSubtle }]}>
              Roll and pitch come from gravity. Yaw is integrated from the gyroscope and
              drifts over time — there is no magnetometer, so it is not an absolute heading.
            </Text>
          </Card>

          {stale !== null && stale > 10_000 ? (
            <Text style={[styles.stale, { color: colors.warning }]}>
              <Ionicons name="alert-circle" size={13} /> Graphs are frozen: no sample for{" "}
              {describeAge(latest.t, now)}. Values are not live.
            </Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Readout({ label, value }: { label: string; value: number | null }) {
  const { colors } = useTheme();
  return (
    <View style={styles.readout}>
      <Text style={[styles.readoutLabel, { color: colors.textSubtle }]}>{label}</Text>
      <Text style={[styles.readoutValue, { color: colors.text }]}>
        {value === null ? "--" : `${Math.round(value)}°`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  chips: { flexDirection: "row", gap: spacing.xs },
  chip: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
  },
  meta: { fontSize: type.caption },
  current: { fontSize: type.body, fontWeight: "700", fontVariant: ["tabular-nums"] },
  estimate: { fontSize: type.caption, fontWeight: "400" },
  note: { fontSize: type.caption, lineHeight: 17, marginTop: spacing.xs },
  readouts: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  readout: { flex: 1, alignItems: "center" },
  readoutLabel: { fontSize: type.caption },
  readoutValue: {
    fontSize: 18,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  stale: { fontSize: type.caption, textAlign: "center", marginTop: spacing.sm },
});
