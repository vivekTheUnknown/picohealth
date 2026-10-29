import { PermissionsAndroid, Platform } from "react-native";

export interface PermissionOutcome {
  granted: boolean;
  denied: string[];
  /** True when Android will no longer show the prompt. */
  blocked: boolean;
}

/**
 * Requests only the permissions the BLE stack needs.
 *
 * Android 12+ (API 31): BLUETOOTH_SCAN and BLUETOOTH_CONNECT. The manifest
 * plugin marks SCAN with `neverForLocation`, so location is NOT requested.
 * Android 11 and below: the platform requires fine location to return scan
 * results, so it is requested there and nowhere else.
 */
export async function ensureBlePermissions(): Promise<PermissionOutcome> {
  if (Platform.OS !== "android") {
    return { granted: true, denied: [], blocked: false };
  }

  const apiLevel = typeof Platform.Version === "number" ? Platform.Version : 0;

  if (apiLevel >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);

    const denied = Object.entries(result)
      .filter(([, status]) => status !== PermissionsAndroid.RESULTS.GRANTED)
      .map(([permission]) => permission);

    return {
      granted: denied.length === 0,
      denied,
      blocked: Object.values(result).some(
        (status) => status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
      ),
    };
  }

  const status = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: "Bluetooth scanning",
      message:
        "Android 11 and earlier require location permission to return Bluetooth scan results. PicoHealth does not derive your location.",
      buttonPositive: "Allow",
      buttonNegative: "Not now",
    },
  );

  return {
    granted: status === PermissionsAndroid.RESULTS.GRANTED,
    denied: status === PermissionsAndroid.RESULTS.GRANTED ? [] : ["ACCESS_FINE_LOCATION"],
    blocked: status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
  };
}
