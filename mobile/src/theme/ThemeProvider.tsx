import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Appearance } from "react-native";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "picohealth.theme.v1";

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
  loaded: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * App-wide appearance preference.
 *
 * `Appearance.setColorScheme` also forces native surfaces (keyboard, dialogs,
 * system bars) to match, not just the React palette. System is the default.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && isPreference(stored)) setPreferenceState(stored);
      } catch {
        // Corrupt or unavailable storage: keep System.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
    } catch {
      // Older runtime: the React palette still switches.
    }
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      loaded,
      setPreference: async (next) => {
        setPreferenceState(next);
        try {
          await AsyncStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Applies for this session even if persistence fails.
        }
      },
    }),
    [preference, loaded],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemePreference must be used inside ThemeProvider");
  }
  return context;
}
