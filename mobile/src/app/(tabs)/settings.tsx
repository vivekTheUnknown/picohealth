import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Alert, Linking, StyleSheet, Text, View } from "react-native";
import { useCallback, useEffect, useState } from "react";

import { Field, Screen, ScreenHeader } from "@/components/ui/layout";
import {
  Badge,
  Banner,
  Button,
  Card,
  Divider,
  InfoRow,
  SectionTitle,
  SwitchRow,
} from "@/components/ui/primitives";
import { usePicoHealth } from "@/features/app/PicoHealthProvider";
import {
  isInsecureRemoteUrl,
  normalizeBaseUrl,
} from "@/features/settings/settings";
import { spacing, type, useTheme } from "@/theme/tokens";

function DraftField({
  label,
  value,
  onCommit,
  keyboardType,
  helper,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
  keyboardType?: "default" | "numeric" | "url";
  helper?: string;
  placeholder?: string;
  error?: string | null;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <Field
      label={label}
      value={draft}
      onChangeText={setDraft}
      onBlur={commit}
      onSubmit={commit}
      keyboardType={keyboardType === "url" ? "url" : keyboardType}
      autoCapitalize={keyboardType === "url" ? "none" : "sentences"}
      helper={helper}
      placeholder={placeholder}
      error={error}
    />
  );
}

export default function SettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const {
    settings,
    updateSettings,
    ble,
    storedCount,
    clearAllData,
    uploadStatus,
    testConnection,
  } = usePicoHealth();

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  const commitBackendUrl = useCallback(
    async (raw: string) => {
      if (!raw.trim()) {
        setBackendError(null);
        setTestResult(null);
        await updateSettings({ backendUrl: "", uploadEnabled: false });
        return;
      }
      const normalized = normalizeBaseUrl(raw);
      if (!normalized) {
        setBackendError("Enter a full URL starting with http:// or https://");
        return;
      }
      setBackendError(null);
      await updateSettings({ backendUrl: normalized });
    },
    [updateSettings],
  );

  const runConnectionTest = async () => {
    setTesting(true);
    try {
      const result = await testConnection();
      setTestResult({ ok: result.ok, detail: result.detail });
    } finally {
      setTesting(false);
    }
  };

  const confirmEnableUpload = () => {
    Alert.alert(
      "Upload measurements?",
      "While connected, each live sample is sent to the configured backend: raw sensor values, sensor validity flags, device uptime, device id, and the demo patient id. No name, contact detail, or location is sent. Demo samples are never uploaded.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Enable upload",
          onPress: () => {
            void updateSettings({ uploadEnabled: true });
          },
        },
      ],
    );
  };

  const confirmClear = () => {
    Alert.alert(
      "Delete local data?",
      "This removes every measurement and alert stored on this phone. The backend is not changed. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void clearAllData();
          },
        },
      ],
    );
  };

  const canUpload = Boolean(normalizeBaseUrl(settings.backendUrl));
  const insecure = isInsecureRemoteUrl(settings.backendUrl);
  const appVersion = Constants.expoConfig?.version ?? "0.1.0";

  return (
    <Screen>
      <ScreenHeader title="Settings" subtitle="Device, data, and privacy controls" />

      <SectionTitle>Connection</SectionTitle>
      <Card>
        <InfoRow
          label="Status"
          value={
            <Badge
              label={ble.state === "connected" ? "Connected" : "Not connected"}
              tone={ble.state === "connected" ? "success" : "neutral"}
              icon={ble.state === "connected" ? "checkmark-circle" : "bluetooth-outline"}
            />
          }
        />
        <InfoRow label="Service" value="8f2a0001…0001" />
        <Divider />
        <DraftField
          label="Device name"
          value={settings.deviceName}
          onCommit={(next) => {
            void updateSettings({ deviceName: next });
          }}
          placeholder="PicoHealth-DEV"
          helper="Must match the name advertised by the Pico W firmware."
        />
        <SwitchRow
          label="Reconnect automatically"
          description="Retries with exponential backoff while the app is open. Stops after 8 attempts so a flat battery is not hammered."
          value={settings.autoReconnect}
          onValueChange={(next) => {
            void updateSettings({ autoReconnect: next });
          }}
        />
      </Card>

      <SectionTitle>Freshness and retention</SectionTitle>
      <Card>
        <DraftField
          label="Mark data stale after (seconds)"
          value={String(Math.round(settings.staleAfterMs / 1000))}
          keyboardType="numeric"
          onCommit={(next) => {
            const seconds = Number.parseInt(next, 10);
            if (Number.isFinite(seconds)) {
              void updateSettings({ staleAfterMs: seconds * 1000 });
            }
          }}
          helper="The prototype streams roughly one frame per second. 2–60 seconds."
        />
        <DraftField
          label="Keep local history (days)"
          value={String(settings.retentionDays)}
          keyboardType="numeric"
          onCommit={(next) => {
            const days = Number.parseInt(next, 10);
            if (Number.isFinite(days)) {
              void updateSettings({ retentionDays: days });
            }
          }}
          helper="Older samples are pruned when the app starts."
        />
        <InfoRow label="Samples stored" value={String(storedCount)} />
        <Button
          label="Delete local data"
          variant="danger"
          icon="trash-outline"
          onPress={confirmClear}
          accessibilityHint="Removes all measurements and alerts stored on this phone"
        />
      </Card>

      <SectionTitle>Backend upload (optional)</SectionTitle>
      <Card>
        <Banner tone="info" title="Upload is off until you enable it">
          The app works fully offline. Nothing is sent anywhere until you configure a backend and
          turn upload on.
        </Banner>

        <DraftField
          label="Backend URL"
          value={settings.backendUrl}
          keyboardType="url"
          placeholder="https://192.168.1.20:8000"
          onCommit={(next) => {
            void commitBackendUrl(next);
          }}
          helper="Laptop LAN address or an HTTPS host. Do not use localhost on a phone."
          error={backendError}
        />

        {settings.backendUrl ? (
          <>
            <Button
              label="Test connection"
              variant="secondary"
              icon="wifi-outline"
              loading={testing}
              onPress={() => {
                void runConnectionTest();
              }}
            />

            {testResult ? (
              <Banner
                tone={testResult.ok ? "success" : "danger"}
                title={testResult.ok ? "Backend reachable" : "Backend unreachable"}
              >
                {testResult.detail}
              </Banner>
            ) : null}

            {insecure ? (
              <Banner tone="warning" title="Unencrypted HTTP">
                This host is not on a private network. Use HTTPS before sending any real data.
              </Banner>
            ) : null}
          </>
        ) : null}

        <SwitchRow
          label="Upload live measurements"
          description="Live samples only. Demo samples are never uploaded."
          value={settings.uploadEnabled}
          disabled={!canUpload}
          onValueChange={(next) => {
            if (next) confirmEnableUpload();
            else void updateSettings({ uploadEnabled: false });
          }}
        />

        <InfoRow
          label="Upload status"
          value={
            <Badge
              label={
                uploadStatus.state === "uploaded"
                  ? "Uploaded"
                  : uploadStatus.state === "uploading"
                    ? "Uploading"
                    : uploadStatus.state === "failed"
                      ? "Failed"
                      : settings.uploadEnabled
                        ? "Pending"
                        : "Not enabled"
              }
              tone={
                uploadStatus.state === "uploaded"
                  ? "success"
                  : uploadStatus.state === "failed"
                    ? "danger"
                    : settings.uploadEnabled
                      ? "info"
                      : "neutral"
              }
            />
          }
        />
        <Text style={[styles.helper, { color: colors.textSubtle }]}>
          {uploadStatus.detail}
        </Text>

        <Divider />
        <DraftField
          label="Demo patient id"
          value={String(settings.patientId)}
          keyboardType="numeric"
          onCommit={(next) => {
            const id = Number.parseInt(next, 10);
            if (Number.isFinite(id)) void updateSettings({ patientId: id });
          }}
          helper="The starter backend has no accounts; samples are attached to this id."
        />
      </Card>

      <SectionTitle>Prototype alert thresholds</SectionTitle>
      <Card>
        <Banner tone="warning" title="Not clinical thresholds">
          These are sanity bounds for a prototype. They do not represent medical limits and must not
          be used for care decisions.
        </Banner>
        <DraftField
          label="Raw optical count limit"
          value={String(settings.opticalMaxCount)}
          keyboardType="numeric"
          onCommit={(next) => {
            const value = Number.parseInt(next.replace(/[^0-9]/g, ""), 10);
            if (Number.isFinite(value)) void updateSettings({ opticalMaxCount: value });
          }}
          helper="Applies to raw red/IR counts, never to heart rate or SpO₂."
        />
        <View style={styles.pair}>
          <View style={styles.pairItem}>
            <DraftField
              label="Temp min (°C)"
              value={String(settings.temperatureMinC)}
              keyboardType="numeric"
              onCommit={(next) => {
                const value = Number.parseFloat(next);
                if (Number.isFinite(value)) void updateSettings({ temperatureMinC: value });
              }}
            />
          </View>
          <View style={styles.pairItem}>
            <DraftField
              label="Temp max (°C)"
              value={String(settings.temperatureMaxC)}
              keyboardType="numeric"
              onCommit={(next) => {
                const value = Number.parseFloat(next);
                if (Number.isFinite(value)) void updateSettings({ temperatureMaxC: value });
              }}
            />
          </View>
        </View>
        <Text style={[styles.helper, { color: colors.textSubtle }]}>
          Temperature rules run only when the app decodes a plausible LM75A value. The raw
          register is converted on the phone, not on the Pico.
        </Text>
      </Card>

      <SectionTitle>Demo mode</SectionTitle>
      <Card>
        <SwitchRow
          label="Generate demo data"
          description="Produces clearly labelled synthetic frames on this phone so the UI can be exercised without hardware. Never uploaded, never shown as a device."
          value={settings.demoMode}
          onValueChange={(next) => {
            void updateSettings({ demoMode: next });
          }}
        />
        {settings.demoMode ? (
          <Banner tone="warning" title="DEMO DATA is active">
            Bluetooth is disconnected while demo mode is on. Turn it off to connect the wearable.
          </Banner>
        ) : null}
      </Card>

      <SectionTitle>Diagnostics</SectionTitle>
      <Card>
        <Text style={[styles.helper, { color: colors.textMuted }]}>
          Raw counts, device identities, sample rate and sequence numbers. Use this when
          a reading looks wrong; the dashboard only shows validated values.
        </Text>
        <Button
          label="Open raw diagnostics"
          variant="secondary"
          icon="analytics-outline"
          onPress={() => router.push("/diagnostics")}
        />
      </Card>

      <SectionTitle>App and privacy</SectionTitle>
      <Card>
        <InfoRow label="App version" value={appVersion} />
        <InfoRow label="BLE protocol" value="v3 · raw JSON + optical batches" />
        <InfoRow label="Firmware" value="Not reported by the device" />
        <InfoRow label="Data stored" value="Measurements and alerts, on this phone only" />
        <Divider />
        <Text style={[styles.privacy, { color: colors.textMuted }]}>
          Measurements are written to a local SQLite database. Uploading is opt-in and clearly
          marked. Acknowledging an alert never deletes measurement history, and clearing local data
          does not touch the backend. No analytics or crash reporting is configured. This prototype
          is not a medical device and makes no diagnostic claims.
        </Text>
      </Card>

      <SectionTitle>Troubleshooting</SectionTitle>
      <Card>
        <Text style={[styles.bullet, { color: colors.textMuted }]}>
          • No device found: confirm the Pico is powered, running the BLE firmware, and advertising
          as “{settings.deviceName}”. Scans stop after 10 seconds.
        </Text>
        <Text style={[styles.bullet, { color: colors.textMuted }]}>
          • Permission denied: Android 12+ needs Nearby devices. This app does not request location
          on Android 12+. On Android 11 and below, the platform requires location for BLE scans.
        </Text>
        <Text style={[styles.bullet, { color: colors.textMuted }]}>
          • Notifications never arrive: the app must be running a custom development build. Expo Go
          cannot load the BLE native module.
        </Text>
        <Text style={[styles.bullet, { color: colors.textMuted }]}>
          • “Notify interrupted” in firmware logs: capture the full MicroPython traceback before
          trusting the stream.
        </Text>
        <Button
          label="Open Android settings"
          variant="secondary"
          icon="settings-outline"
          onPress={() => {
            void Linking.openSettings();
          }}
          accessibilityHint="Opens system settings to review Bluetooth permissions"
        />
      </Card>

      <Text style={[styles.footer, { color: colors.textSubtle }]}>
        PicoHealth prototype. Not for diagnosis, treatment, or emergency use.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  helper: { fontSize: type.caption, lineHeight: 17 },
  privacy: { fontSize: type.caption, lineHeight: 18 },
  bullet: { fontSize: type.caption, lineHeight: 18 },
  pair: { flexDirection: "row", gap: spacing.md },
  pairItem: { flex: 1 },
  footer: {
    fontSize: type.caption,
    lineHeight: 17,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
