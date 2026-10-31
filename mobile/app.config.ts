import type { ExpoConfig } from "expo/config";

/**
 * App configuration.
 *
 * `ALLOW_CLEARTEXT=true` opts a development build into HTTP for LAN testing
 * against the laptop FastAPI server. It stays off by default so release builds
 * cannot silently send measurements over plaintext.
 */
const allowCleartext = process.env.ALLOW_CLEARTEXT === "true";

const plugins: NonNullable<ExpoConfig["plugins"]> = [
  "expo-router",
  "expo-sqlite",
  "expo-dev-client",
  "expo-secure-store",
  // Marks BLUETOOTH_SCAN with usesPermissionFlags="neverForLocation" so the app
  // does not need location permission on Android 12+.
  "./plugins/withBlePermissions",
  [
    "expo-splash-screen",
    {
      backgroundColor: "#0E7C86",
      image: "./assets/images/splash-icon.png",
      imageWidth: 76,
    },
  ],
];

if (allowCleartext) {
  plugins.push([
    "expo-build-properties",
    { android: { usesCleartextTraffic: true } },
  ]);
}

const config: ExpoConfig = {
  name: "PicoHealth",
  slug: "picohealth",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "picohealth",
  userInterfaceStyle: "automatic",
  android: {
    package: "com.picohealth.app",
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: "#0E7C86",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      "android.permission.BLUETOOTH",
      "android.permission.BLUETOOTH_ADMIN",
      "android.permission.BLUETOOTH_SCAN",
      "android.permission.BLUETOOTH_CONNECT",
      // Only requested at runtime on Android 11 and below, where the platform
      // requires it to return BLE scan results.
      "android.permission.ACCESS_FINE_LOCATION",
    ],
  },
  web: {
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins,
  experiments: {
    typedRoutes: true,
  },
};

export default config;
