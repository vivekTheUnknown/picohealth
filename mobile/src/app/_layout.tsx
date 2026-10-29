import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

import { PicoHealthProvider } from "@/features/app/PicoHealthProvider";
import { useTheme } from "@/theme/tokens";

export default function RootLayout() {
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
