import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Screen, ScreenHeader } from "@/components/ui/layout";
import { Badge, Banner, Button, Card, SectionTitle } from "@/components/ui/primitives";
import { EmptyState, LoadingState } from "@/components/ui/states";
import { usePicoHealth } from "@/features/app/PicoHealthProvider";
import { spacing, type, useTheme } from "@/theme/tokens";
import type { AlertRecord } from "@/types/health";
import { formatDateTime } from "@/utils/format";

const SEVERITY = {
  info: { label: "Info", tone: "info", icon: "information-circle" },
  warning: { label: "Warning", tone: "warning", icon: "alert-circle" },
  error: { label: "Error", tone: "danger", icon: "close-circle" },
} as const;

export default function AlertsScreen() {
  const { colors } = useTheme();
  const { alerts, alertsLoading, acknowledgeAlert, refreshAlerts } = usePicoHealth();
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshAlerts();
    }, [refreshAlerts]),
  );

  const acknowledge = async (alert: AlertRecord) => {
    setAcknowledging(alert.id);
    try {
      await acknowledgeAlert(alert.id);
    } finally {
      setAcknowledging(null);
    }
  };

  const open = alerts.filter((alert) => !alert.acknowledged).length;

  return (
    <Screen
      refreshing={alertsLoading}
      onRefresh={() => {
        void refreshAlerts();
      }}
    >
      <ScreenHeader
        title="Alerts"
        subtitle={
          alerts.length === 0
            ? "Informational notices from this phone"
            : `${open} open · ${alerts.length} total`
        }
      />

      <Banner tone="info" title="Informational only">
        These notices describe this prototype's own sensors and connection. They are not clinical
        alerts, not a diagnosis, and this app is not an emergency-monitoring service.
      </Banner>

      <SectionTitle>Recent notices</SectionTitle>

      {alertsLoading && alerts.length === 0 ? (
        <LoadingState label="Loading notices…" />
      ) : alerts.length === 0 ? (
        <Card>
          <EmptyState
            icon="notifications-off-outline"
            title="No alerts yet"
            description="Alerts appear when a sensor becomes unavailable, data goes stale, or the device disconnects. Repeated conditions are de-duplicated."
          />
        </Card>
      ) : (
        alerts.map((alert) => {
          const severity = SEVERITY[alert.severity];
          return (
            <Card key={alert.id}>
              <View style={styles.header}>
                <Badge
                  label={severity.label}
                  tone={severity.tone}
                  icon={severity.icon}
                />
                <Text style={[styles.time, { color: colors.textSubtle }]}>
                  {formatDateTime(alert.createdAt)}
                </Text>
              </View>

              <Text style={[styles.title, { color: colors.text }]}>{alert.title}</Text>
              <Text style={[styles.message, { color: colors.textMuted }]}>{alert.message}</Text>

              <View style={styles.footer}>
                {alert.acknowledged ? (
                  <Badge label="Acknowledged" tone="neutral" icon="checkmark-done" />
                ) : (
                  <Badge label="Open" tone="warning" icon="ellipse" />
                )}
              </View>

              {!alert.acknowledged ? (
                <Button
                  label="Acknowledge"
                  variant="secondary"
                  icon="checkmark"
                  loading={acknowledging === alert.id}
                  onPress={() => {
                    void acknowledge(alert);
                  }}
                  accessibilityHint="Dismisses this notice. The underlying event is kept."
                />
              ) : alert.acknowledgedAt ? (
                <Text style={[styles.time, { color: colors.textSubtle }]}>
                  Acknowledged {formatDateTime(alert.acknowledgedAt)}
                </Text>
              ) : null}
            </Card>
          );
        })
      )}

      <Text style={[styles.footerNote, { color: colors.textSubtle }]}>
        Acknowledging only dismisses the notice. Measurement history is never deleted by it.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: { fontSize: type.body, fontWeight: "700" },
  message: { fontSize: type.small, lineHeight: 20 },
  time: { fontSize: type.caption },
  footer: { flexDirection: "row", justifyContent: "flex-start" },
  footerNote: {
    fontSize: type.caption,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
});
