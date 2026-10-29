import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { radius, spacing, touchTarget, type, useTheme, type Palette } from "@/theme/tokens";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
export type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TONE_ICON: Record<Tone, IconName> = {
  neutral: "ellipse-outline",
  accent: "pulse",
  success: "checkmark-circle",
  warning: "alert-circle",
  danger: "close-circle",
  info: "information-circle",
};

export function toneColors(tone: Tone, colors: Palette): { fg: string; bg: string } {
  switch (tone) {
    case "accent":
      return { fg: colors.accent, bg: colors.accentSoft };
    case "success":
      return { fg: colors.success, bg: colors.successSoft };
    case "warning":
      return { fg: colors.warning, bg: colors.warningSoft };
    case "danger":
      return { fg: colors.danger, bg: colors.dangerSoft };
    case "info":
      return { fg: colors.info, bg: colors.infoSoft };
    default:
      return { fg: colors.textMuted, bg: colors.surfaceMuted };
  }
}

/** Status is always icon + text + colour, never colour alone. */
export function Badge({
  tone = "neutral",
  label,
  icon,
  style,
}: {
  tone?: Tone;
  label: string;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { fg, bg } = toneColors(tone, colors);
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Ionicons name={icon ?? TONE_ICON[tone]} size={13} color={fg} />
      <Text style={[styles.badgeText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  loading = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const background =
    variant === "primary"
      ? colors.accent
      : variant === "danger"
        ? colors.dangerSoft
        : variant === "secondary"
          ? colors.surface
          : "transparent";
  const foreground =
    variant === "primary"
      ? colors.onAccent
      : variant === "danger"
        ? colors.danger
        : variant === "secondary"
          ? colors.text
          : colors.accent;
  const borderColor =
    variant === "secondary" ? colors.border : "transparent";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed && variant === "primary" ? colors.accentPressed : background,
          borderColor,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : icon ? (
        <Ionicons name={icon} size={18} color={foreground} />
      ) : null}
      <Text style={[styles.buttonLabel, { color: foreground }]}>{label}</Text>
    </Pressable>
  );
}

export function Banner({
  tone = "info",
  title,
  children,
}: {
  tone?: Exclude<Tone, "neutral">;
  title: string;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const { fg, bg } = toneColors(tone, colors);
  return (
    <View style={[styles.banner, { backgroundColor: bg, borderColor: fg }]}>
      <Ionicons name={TONE_ICON[tone]} size={18} color={fg} style={styles.bannerIcon} />
      <View style={styles.flex}>
        <Text style={[styles.bannerTitle, { color: fg }]}>{title}</Text>
        {children ? (
          <Text style={[styles.bannerBody, { color: colors.text }]}>{children}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function InfoRow({
  label,
  value,
  valueTone,
}: {
  label: string;
  value: ReactNode;
  valueTone?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      {typeof value === "string" ? (
        <Text style={[styles.infoValue, { color: valueTone ?? colors.text }]}>{value}</Text>
      ) : (
        <View style={styles.infoValueWrap}>{value}</View>
      )}
    </View>
  );
}

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={styles.flex}>
        <Text style={[styles.switchLabel, { color: colors.text }]}>{label}</Text>
        {description ? (
          <Text style={[styles.switchDescription, { color: colors.textMuted }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityHint={description}
        trackColor={{ false: colors.borderStrong, true: colors.accentSoft }}
        thumbColor={value ? colors.accent : colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    maxWidth: "100%",
  },
  badgeText: {
    fontSize: type.caption,
    fontWeight: "600",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: type.section,
    fontWeight: "700",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.sm,
  },
  button: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  buttonLabel: {
    fontSize: type.body,
    fontWeight: "600",
  },
  banner: {
    flexDirection: "row",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  bannerIcon: { marginTop: 1 },
  bannerTitle: { fontSize: type.small, fontWeight: "700" },
  bannerBody: { fontSize: type.small, lineHeight: 19, marginTop: 2 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 28,
  },
  infoLabel: { fontSize: type.small, flexShrink: 1 },
  infoValue: { fontSize: type.small, fontWeight: "600", textAlign: "right", flexShrink: 1 },
  infoValueWrap: { flexShrink: 1, alignItems: "flex-end" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: touchTarget + 8,
  },
  switchLabel: { fontSize: type.body, fontWeight: "600" },
  switchDescription: { fontSize: type.caption, lineHeight: 17, marginTop: 2 },
});
