import type { ReactNode } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { spacing, type, useTheme, radius } from "@/theme/tokens";

export function Screen({
  children,
  scroll = true,
  refreshing = false,
  onRefresh,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { colors } = useTheme();

  if (!scroll) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={[styles.fill, { backgroundColor: colors.background }]}
      >
        <View style={styles.staticContent}>{children}</View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.fill, { backgroundColor: colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text
          style={[styles.headerTitle, { color: colors.text }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = "none",
  helper,
  error,
  editable = true,
  maxLength,
  onBlur,
  onSubmit,
  secureTextEntry,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  helper?: string;
  error?: string | null;
  editable?: boolean;
  maxLength?: number;
  onBlur?: () => void;
  onSubmit?: () => void;
  secureTextEntry?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        editable={editable}
        maxLength={maxLength}
        onBlur={onBlur}
        onSubmitEditing={onSubmit}
        returnKeyType={onSubmit ? "done" : undefined}
        accessibilityLabel={label}
        accessibilityHint={helper}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: editable ? colors.surface : colors.surfaceMuted,
            borderColor: error ? colors.danger : colors.borderStrong,
          },
        ]}
      />
      {error ? (
        <Text style={[styles.fieldHelper, { color: colors.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : helper ? (
        <Text style={[styles.fieldHelper, { color: colors.textSubtle }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  staticContent: { flex: 1, padding: spacing.lg, gap: spacing.md },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  headerText: { flex: 1 },
  headerTitle: { fontSize: type.title, fontWeight: "700", letterSpacing: -0.2 },
  headerSubtitle: { fontSize: type.small, lineHeight: 20, marginTop: 2 },
  field: { gap: 6 },
  fieldLabel: { fontSize: type.caption, fontWeight: "600" },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: type.body,
  },
  fieldHelper: { fontSize: type.caption, lineHeight: 17 },
});
