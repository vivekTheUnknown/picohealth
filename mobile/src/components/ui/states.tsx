import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/primitives";
import { radius, spacing, type, useTheme } from "@/theme/tokens";

export function EmptyState({
  title,
  description,
  icon = "file-tray-outline",
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={26} color={colors.textSubtle} />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.textMuted }]}>{description}</Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel = "Try again",
}: {
  title: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.error, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}
      accessibilityRole="alert"
    >
      <Ionicons name="alert-circle" size={20} color={colors.danger} />
      <View style={styles.errorBody}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.description, { color: colors.textMuted }]}>{description}</Text>
        {onRetry ? (
          <View style={styles.errorAction}>
            <Button label={retryLabel} onPress={onRetry} variant="secondary" icon="refresh" />
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.accent} />
      <Text style={[styles.description, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  error: {
    flexDirection: "row",
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorBody: { flex: 1, gap: 4 },
  errorAction: { marginTop: spacing.sm, alignSelf: "flex-start" },
  loading: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  title: { fontSize: type.body, fontWeight: "600", textAlign: "center" },
  description: {
    fontSize: type.small,
    lineHeight: 19,
    textAlign: "center",
  },
});
