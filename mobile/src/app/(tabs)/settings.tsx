import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
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
import { useThemePreference, type ThemePreference } from "@/theme/ThemeProvider";
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
  const { preference, setPreference } = useThemePreference();
  const {
    settings,
    updateSettings,
    ble,
    storedCount,
    clearAllData,
    portal,
    connectPortal,
    disconnectPortal,
    syncNow,
  } = usePicoHealth();

  const [urlDraft, setUrlDraft] = useState(settings.backendUrl);
  const [identifier, setIdentifier] = useState(settings.portalIdentifier);
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    setUrlDraft(settings.backendUrl);
  }, [settings.backendUrl]);

  useEffect(() => {
    setIdentifier(settings.portalIdentifier);
  }, [settings.portalIdentifier]);

  const commitBackendUrl = useCallback(
    async (raw: string) => {
      if (!raw.trim()) {
        setBackendError(null);
        await updateSettings({ backendUrl: "", uploadEnabled: false });
        return;
      }
      const normalized = normalizeBaseUrl(raw);
      if (!normalized) {
        setBackendError("Enter a full URL starting with http:// or https://");
        return;
      }
      if (normalized === settings.backendUrl) return;
      setBackendError(null);
      // A different portal cannot reuse the old session.
      if (portal.connected) await disconnectPortal();
      await updateSettings({ backendUrl: normalized });
    },
    [disconnectPortal, portal.connected, settings.backendUrl, updateSettings],
  );

  const handleConnect = async () => {
    setBackendError(null);
    const normalized = normalizeBaseUrl(urlDraft);
    if (!normalized) {
      setBackendError("Enter the portal URL first.");
      return;
    }
    if (!identifier.trim()) {
      setBackendError("Enter your patient account name.");
      return;
    }
    if (!password) {
      setBackendError("Enter your password.");
      return;
    }

    setConnecting(true);
    try {
      if (normalized !== settings.backendUrl) {
        await updateSettings({ backendUrl: normalized });
      }
      const result = await connectPortal(identifier.trim(), password);
      if (result.ok) setPassword("");
      else setBackendError(result.detail);
    } finally {
      setConnecting(false);
    }
  };

  const confirmEnableUpload = () => {
    Alert.alert(
      "Sync measurements to the portal?",
      "While connected, the app sends its processed readings to your health portal: heart rate, SpO₂, temperature, perfusion index, PRV, movement, device orientation, signal quality and the algorithm version, plus the raw sensor context. Demo samples are never sent. Records that fail stay queued on this phone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Enable sync",
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
      "This removes every measurement and alert stored on this phone. The portal is not changed. This cannot be undone.",
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

      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <Text style={[styles.helper, { color: colors.textMuted }]}>
          Theme applies to the whole app and native dialogs. System follows the phone.
        </Text>
        <View style={styles.chipRow}>
          {(
            [
              ["system", "System"],
              ["light", "Light"],
              ["dark", "Dark"],
            ] as Array<[ThemePreference, string]>
          ).map(([value, label]) => {
            const selected = preference === value;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  void setPreference(value);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${label} theme`}
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
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
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

      <SectionTitle>Health portal</SectionTitle>
      <Card>
        <Banner tone="info" title="Direct sync with your patient account">
          Sign in once with the account provided by your clinic. The app keeps the bearer token in
          the device keystore and sends processed readings straight to the portal. No readings are
          sent until sync is enabled.
        </Banner>

        <Field
          label="Portal URL"
          value={urlDraft}
          onChangeText={setUrlDraft}
          onBlur={() => {
            void commitBackendUrl(urlDraft);
          }}
          keyboardType="url"
          placeholder="http://192.168.1.20:8000"
          helper="Laptop LAN address or an HTTPS host. Do not use localhost on a phone."
          error={backendError}
        />

        {isInsecureRemoteUrl(urlDraft) ? (
          <Banner tone="warning" title="Unencrypted HTTP">
            This host is not on a private network. Use HTTPS before sending any real data.
          </Banner>
        ) : null}

        {portal.connected ? (
          <>
            <InfoRow
              label="Account"
              value={portal.identity ?? "connected"}
            />
            <InfoRow
              label="Patient record"
              value={portal.patientId ?? "not reported"}
            />
            <InfoRow
              label="Sync state"
              value={
                <Badge
                  label={
                    portal.syncing
                      ? "Syncing"
                      : portal.error
                        ? "Failed"
                        : portal.pending > 0
                          ? `${portal.pending} queued`
                          : "Synced"
                  }
                  tone={
                    portal.syncing
                      ? "info"
                      : portal.error
                        ? "danger"
                        : portal.pending > 0
                          ? "warning"
                          : "success"
                  }
                />
              }
            />
            <Text style={[styles.helper, { color: colors.textSubtle }]}>
              {portal.detail}
              {portal.lastSyncAt
                ? ` Last sync ${new Date(portal.lastSyncAt).toLocaleTimeString()}.`
                : ""}
            </Text>
            {portal.error ? (
              <Banner tone="danger" title="Last sync failed">
                {portal.error}
              </Banner>
            ) : null}

            <SwitchRow
              label="Sync live measurements"
              description="Processed records only, from this device. Demo samples are never sent."
              value={settings.uploadEnabled}
              onValueChange={(next) => {
                if (next) confirmEnableUpload();
                else void updateSettings({ uploadEnabled: false });
              }}
            />
            <Button
              label="Sync now"
              variant="secondary"
              icon="cloud-upload-outline"
              loading={portal.syncing}
              onPress={() => {
                void syncNow();
              }}
            />
            <Button
              label="Disconnect"
              variant="danger"
              icon="log-out-outline"
              onPress={() => {
                Alert.alert(
                  "Disconnect from the portal?",
                  "The saved token is removed from this phone. Local records stay on the device and will sync again after you reconnect.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Disconnect",
                      style: "destructive",
                      onPress: () => {
                        void disconnectPortal();
                      },
                    },
                  ],
                );
              }}
            />
          </>
        ) : (
          <>
            <Field
              label="Account name"
              value={identifier}
              onChangeText={setIdentifier}
              placeholder="kode vivek sai"
              helper="The patient name or email address on the portal account."
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              onSubmit={() => {
                void handleConnect();
              }}
              helper="Used once to obtain a token; the password is not stored."
            />
            <Button
              label="Connect to portal"
              variant="primary"
              icon="log-in-outline"
              loading={connecting}
              onPress={() => {
                void handleConnect();
              }}
            />
            <Text style={[styles.helper, { color: colors.textSubtle }]}>
              {portal.detail}
            </Text>
            {portal.error ? (
              <Banner tone="warning" title="Not connected">
                {portal.error}
              </Banner>
            ) : null}
          </>
        )}
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
          description="Produces clearly labelled synthetic frames on this phone so the UI can be exercised without hardware. Never synced, never shown as a device."
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
        <InfoRow
          label="Data stored"
          value={
            settings.uploadEnabled && portal.connected
              ? "On this phone, plus synced records on the portal"
              : "On this phone only"
          }
        />
        <Divider />
        <Text style={[styles.privacy, { color: colors.textMuted }]}>
          Measurements are written to a local SQLite database. Syncing to the portal is opt-in
          and clearly marked. Acknowledging an alert never deletes measurement history, and clearing local data
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
  chipRow: { flexDirection: "row", gap: spacing.sm },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
  },
  pair: { flexDirection: "row", gap: spacing.md },
  pairItem: { flex: 1 },
  footer: {
    fontSize: type.caption,
    lineHeight: 17,
    textAlign: "center",
    marginTop: spacing.md,
  },
});
