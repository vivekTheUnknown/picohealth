import { useColorScheme } from "react-native";

/**
 * Design tokens from PicoHealth_design.md §6.
 *
 * Light is the default. Every colour pair used for text or iconography was
 * checked for WCAG AA contrast on its own surface; see README.
 */
export interface Palette {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  /** Boundary for interactive controls; held to WCAG 1.4.11 (3:1). */
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  accent: string;
  accentPressed: string;
  onAccent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
}

const light: Palette = {
  background: "#F5F7F9",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF2F5",
  border: "#DCE3E9",
  borderStrong: "#7C8892",
  text: "#16202B",
  textMuted: "#4F5B67",
  textSubtle: "#5F6B75",
  accent: "#0E6F78",
  accentPressed: "#0B5A61",
  onAccent: "#FFFFFF",
  accentSoft: "#E4F2F3",
  success: "#1C6B45",
  successSoft: "#E4F3EA",
  warning: "#7A4F00",
  warningSoft: "#FDF0D2",
  danger: "#A3231B",
  dangerSoft: "#FBE7E5",
  info: "#1F4F86",
  infoSoft: "#E6EEF8",
};

const dark: Palette = {
  background: "#0E1418",
  surface: "#161E23",
  surfaceMuted: "#1E282E",
  border: "#2B383F",
  borderStrong: "#5F7079",
  text: "#E9EFF2",
  textMuted: "#B3C0C8",
  textSubtle: "#94A3AC",
  accent: "#5FD3D9",
  accentPressed: "#7FE0E5",
  onAccent: "#06282B",
  accentSoft: "#123338",
  success: "#71D9A2",
  successSoft: "#122E22",
  warning: "#F0C067",
  warningSoft: "#33280F",
  danger: "#F0908A",
  dangerSoft: "#3A1D1B",
  info: "#8FB8F0",
  infoSoft: "#152538",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

/** 12–16 dp cards, per §6. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const type = {
  metric: 34,
  title: 24,
  section: 17,
  body: 15,
  small: 13,
  caption: 12,
} as const;

/** Android accessibility minimum touch target. */
export const touchTarget = 48;

export function useTheme(): { colors: Palette; scheme: "light" | "dark" } {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return { colors: scheme === "dark" ? dark : light, scheme };
}
