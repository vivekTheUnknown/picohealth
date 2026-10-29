const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Android 12+ lets an app scan for BLE devices without location access if the
 * BLUETOOTH_SCAN permission declares `neverForLocation`. Expo's app config can
 * add the permission but not that attribute, so it is applied here.
 *
 * The app never derives location from scan results.
 */
module.exports = function withBlePermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const permissions = manifest["uses-permission"] ?? [];

    manifest["uses-permission"] = permissions.map((entry) => {
      const name = entry.$?.["android:name"];
      if (name === "android.permission.BLUETOOTH_SCAN") {
        return {
          $: {
            ...entry.$,
            "android:usesPermissionFlags": "neverForLocation",
          },
        };
      }
      return entry;
    });

    return config;
  });
};
