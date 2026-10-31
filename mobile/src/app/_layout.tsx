import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

import { PicoHealthProvider } from "@/features/app/PicoHealthProvider";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { useTheme } from "@/theme/tokens";

function Root() {
  const { colors, scheme } = useTheme();

  return (
    <PicoHealthProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </PicoHealthProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  );
}
