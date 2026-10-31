import {
  DEFAULT_SETTINGS,
  isInsecureRemoteUrl,
  normalizeBaseUrl,
  normalizeSettings,
  parseStoredSettings,
} from "@/features/settings/settings";

describe("normalizeSettings", () => {
  it("returns defaults for missing or corrupt values", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ staleAfterMs: "soon" })).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps unsafe or absurd values", () => {
    const settings = normalizeSettings({
      staleAfterMs: 1,
      retentionDays: 9999,
      opticalMaxCount: 0,
      deviceName: "x".repeat(80),
    });

    expect(settings.staleAfterMs).toBe(2000);
    expect(settings.retentionDays).toBe(365);
    expect(settings.opticalMaxCount).toBe(1000);
    expect(settings.deviceName).toHaveLength(32);
  });

  it("keeps the temperature range ordered", () => {
    const settings = normalizeSettings({ temperatureMinC: 40, temperatureMaxC: 10 });
    expect(settings.temperatureMinC).toBe(10);
    expect(settings.temperatureMaxC).toBe(40);
  });

  it("cannot enable upload without a destination", () => {
    expect(normalizeSettings({ uploadEnabled: true }).uploadEnabled).toBe(false);
    expect(
      normalizeSettings({ uploadEnabled: true, backendUrl: "http://192.168.1.5:8000" })
        .uploadEnabled,
    ).toBe(true);
  });

  it("normalises a backend URL and drops an invalid one", () => {
    const settings = normalizeSettings({ backendUrl: "  http://192.168.1.5:8000/  " });
    expect(settings.backendUrl).toBe("http://192.168.1.5:8000");

    expect(normalizeSettings({ backendUrl: "192.168.1.5:8000" }).backendUrl).toBe("");
    expect(normalizeSettings({ backendUrl: "ftp://example.com" }).backendUrl).toBe("");
  });
});

describe("normalizeBaseUrl", () => {
  it("accepts http(s) and removes a trailing slash", () => {
    expect(normalizeBaseUrl("https://example.com/")).toBe("https://example.com");
    expect(normalizeBaseUrl("http://10.0.2.2:8000")).toBe("http://10.0.2.2:8000");
    expect(normalizeBaseUrl("https://example.com/api/")).toBe("https://example.com/api");
  });

  it("rejects empty, scheme-less, and non-http schemes", () => {
    expect(normalizeBaseUrl("")).toBeNull();
    expect(normalizeBaseUrl("example.com")).toBeNull();
    expect(normalizeBaseUrl("ftp://example.com")).toBeNull();
    expect(normalizeBaseUrl("not a url")).toBeNull();
  });
});

describe("isInsecureRemoteUrl", () => {
  it("flags plaintext HTTP to a public host", () => {
    expect(isInsecureRemoteUrl("http://clinic.example.com")).toBe(true);
    expect(isInsecureRemoteUrl("http://8.8.8.8:8000")).toBe(true);
  });

  it("allows plaintext on a private or local network", () => {
    expect(isInsecureRemoteUrl("http://192.168.1.20:8000")).toBe(false);
    expect(isInsecureRemoteUrl("http://10.0.2.2:8000")).toBe(false);
    expect(isInsecureRemoteUrl("http://localhost:8000")).toBe(false);
    expect(isInsecureRemoteUrl("http://laptop.local:8000")).toBe(false);
  });

  it("never flags HTTPS", () => {
    expect(isInsecureRemoteUrl("https://clinic.example.com")).toBe(false);
  });
});

describe("parseStoredSettings", () => {
  it("parses valid stored JSON", () => {
    const parsed = parseStoredSettings(
      JSON.stringify({ deviceName: "PicoHealth-DEV", staleAfterMs: 8000 }),
    );
    expect(parsed.deviceName).toBe("PicoHealth-DEV");
    expect(parsed.staleAfterMs).toBe(8000);
  });

  it("falls back to defaults for corrupt JSON", () => {
    expect(parseStoredSettings("{not json")).toEqual(DEFAULT_SETTINGS);
  });

  it("rejects a payload with the wrong value types", () => {
    expect(parseStoredSettings(JSON.stringify({ staleAfterMs: "soon" }))).toEqual(
      DEFAULT_SETTINGS,
    );
    expect(parseStoredSettings(JSON.stringify(["not", "an", "object"]))).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it("keeps unknown keys harmless", () => {
    const parsed = parseStoredSettings(
      JSON.stringify({ deviceName: "PicoHealth-DEV", futureSetting: true }),
    );
    expect(parsed.deviceName).toBe("PicoHealth-DEV");
  });
});
