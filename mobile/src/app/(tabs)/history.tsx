import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ui/layout";
import { Badge, Card, Divider, InfoRow } from "@/components/ui/primitives";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { usePicoHealth } from "@/features/app/PicoHealthProvider";
import {
  frameSummary,
  imuDetail,
  opticalDetail,
  sensorStatus,
  temperatureDetail,
} from "@/features/measurements/present";
import {
  describeAge,
  describeDuration,
  isHistoryGap,
} from "@/features/measurements/staleness";
import { listMeasurements } from "@/services/storage/db";
import { spacing, type, useTheme } from "@/theme/tokens";
import type { MeasurementRecord } from "@/types/health";
import { formatDateTime, formatTime } from "@/utils/format";

type Period = "today" | "7d" | "30d" | "all";

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All" },
];

type Row =
  | { kind: "sample"; record: MeasurementRecord }
  | { kind: "gap"; ms: number };

function sinceFor(period: Period): number | undefined {
  if (period === "all") return undefined;
  if (period === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }
  const days = period === "7d" ? 7 : 30;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

export default function HistoryScreen() {
  const { colors } = useTheme();
  const { settings, now } = usePicoHealth();

  const [period, setPeriod] = useState<Period>("today");
  const [records, setRecords] = useState<MeasurementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setRecords(await listMeasurements({ sinceMs: sinceFor(period), limit: 500 }));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not read local history.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => {
        void load();
      }, 5000);
      return () => clearInterval(timer);
    }, [load]),
  );

  const rows = useMemo<Row[]>(() => {
    const ascending = [...records].sort((a, b) => a.receivedAt - b.receivedAt);
    const output: Row[] = [];

    ascending.forEach((record, index) => {
      if (index > 0) {
        const previous = ascending[index - 1];
        if (isHistoryGap(previous.receivedAt, record.receivedAt, settings.staleAfterMs)) {
          output.push({ kind: "gap", ms: record.receivedAt - previous.receivedAt });
        }
      }
      output.push({ kind: "sample", record });
    });

    // Newest first for reading, while gaps were computed chronologically.
    return output.reverse();
  }, [records, settings.staleAfterMs]);

  const refresh = () => {
    setRefreshing(true);
    void load();
  };

  return (
    <SafeAreaView edges={["top"]} style={[styles.fill, { backgroundColor: colors.background }]}>
      <FlatList
        data={rows}
        keyExtractor={(row, index) =>
          row.kind === "sample" ? row.record.id : `gap_${row.ms}_${index}`
        }
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader
              title="History"
              subtitle={`${records.length} sample${records.length === 1 ? "" : "s"} stored on this phone`}
            />

            <View style={styles.filters} accessibilityRole="tablist">
              {PERIODS.map((option) => {
                const selected = option.id === period;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => setPeriod(option.id)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Show ${option.label}`}
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
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {error ? (
              <ErrorState title="History unavailable" description={error} onRetry={load} />
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === "gap") {
            return (
              <View
                style={[styles.gap, { borderColor: colors.border }]}
                accessibilityLabel={`No data for ${describeDuration(item.ms)}`}
              >
                <Ionicons name="cut-outline" size={15} color={colors.textSubtle} />
                <Text style={[styles.gapText, { color: colors.textSubtle }]}>
                  No data for {describeDuration(item.ms)} — the device was disconnected or stopped
                  sending. Nothing is interpolated.
                </Text>
              </View>
            );
          }

          const record = item.record;
          const open = expanded === record.id;

          return (
            <Pressable
              onPress={() => setExpanded(open ? null : record.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`Sample at ${formatTime(new Date(record.receivedAt).toISOString())}. ${open ? "Collapse" : "Expand"} details.`}
            >
              <Card>
                <View style={styles.rowHeader}>
                  <Text style={[styles.time, { color: colors.text }]}>
                    {formatTime(new Date(record.receivedAt).toISOString())}
                  </Text>
                  <View style={styles.rowBadges}>
                    {record.source === "demo" ? (
                      <Badge label="DEMO" tone="warning" icon="flask" />
                    ) : null}
                    <Badge
                      label={describeAge(record.receivedAt, now)}
                      tone="neutral"
                      icon="time-outline"
                    />
                  </View>
                </View>

                <Text style={[styles.summary, { color: colors.textMuted }]}>
                  {frameSummary(record)}
                </Text>

                <View style={styles.rowHeader}>
                  <Text style={[styles.technical, { color: colors.textSubtle }]}>
                    Uptime {record.uptimeMs} ms · seq {record.sequence ?? "—"}
                  </Text>
                  <Ionicons
                    name={open ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.textSubtle}
                  />
                </View>

                {open ? (
                  <View style={styles.detail}>
                    <Divider />
                    <InfoRow
                      label="Recorded"
                      value={formatDateTime(new Date(record.receivedAt).toISOString())}
                    />
                    <InfoRow
                      label="Optical"
                      value={`${sensorStatus(record.optical.status).label} · ${record.optical.red ?? "—"} / ${record.optical.ir ?? "—"}`}
                    />
                    <Text style={[styles.technical, { color: colors.textSubtle }]}>
                      {opticalDetail(record)}
                    </Text>
                    <InfoRow
                      label="Temperature"
                      value={
                        record.temperature.status === "ok" && record.temperature.valueC !== null
                          ? `${record.temperature.valueC.toFixed(2)} °C`
                          : sensorStatus(record.temperature.status).label
                      }
                    />
                    <Text style={[styles.technical, { color: colors.textSubtle }]}>
                      {temperatureDetail(record)}
                    </Text>
                    <InfoRow
                      label="IMU"
                      value={
                        record.imu.status === "ok" && record.imu.accelG
                          ? record.imu.accelG.map((axis) => axis.toFixed(2)).join(", ") + " g"
                          : sensorStatus(record.imu.status).label
                      }
                    />
                    <Text style={[styles.technical, { color: colors.textSubtle }]}>
                      {imuDetail(record)}
                    </Text>
                    <InfoRow label="Sensor flags" value={`0x${record.flags.toString(16).padStart(2, "0")}`} />
                    <InfoRow
                      label="Upload"
                      value={record.uploaded ? "Uploaded" : "Not uploaded"}
                    />
                    {record.source === "demo" ? (
                      <Text style={[styles.technical, { color: colors.warning }]}>
                        Demo sample — generated on the phone, never uploaded.
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <LoadingState label="Reading local history…" />
          ) : (
            <EmptyState
              icon="time-outline"
              title={period === "all" ? "No samples stored" : "No samples in this period"}
              description={
                period === "all"
                  ? "Samples appear here after the app receives a valid frame. Nothing is pre-filled."
                  : "Try a wider time range. Only samples received by this phone are listed."
              }
            />
          )
        }
        ListFooterComponent={
          rows.length > 0 ? (
            <Text style={[styles.footer, { color: colors.textSubtle }]}>
              Stored locally in SQLite. Gaps are shown as gaps; missing values stay missing.
            </Text>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowBadges: { flexDirection: "row", gap: spacing.xs, flexShrink: 1, flexWrap: "wrap" },
  time: { fontSize: type.body, fontWeight: "700", fontVariant: ["tabular-nums"] },
  summary: { fontSize: type.small, lineHeight: 19 },
  technical: { fontSize: type.caption, lineHeight: 17 },
  detail: { gap: 4 },
  gap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    marginVertical: spacing.xs,
  },
  gapText: { flex: 1, fontSize: type.caption, lineHeight: 17 },
  footer: { fontSize: type.caption, lineHeight: 17, marginTop: spacing.md },
});
