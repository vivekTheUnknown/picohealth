import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Portal session storage.
 *
 * The bearer token is kept in the platform keystore via expo-secure-store.
 * AsyncStorage is only a fallback for platforms without a secure store (the
 * web preview), never the primary choice.
 */
export interface StoredPortalSession {
  portalUrl: string;
  token: string;
  identity: string;
  patientId: string | null;
}

const KEY = "picohealth.portal.session.v1";

export async function loadPortalSession(): Promise<StoredPortalSession | null> {
  try {
    let raw: string | null = null;
    if (await SecureStore.isAvailableAsync()) {
      raw = await SecureStore.getItemAsync(KEY);
    } else {
      raw = await AsyncStorage.getItem(KEY);
    }
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPortalSession>;
    if (!parsed.token || !parsed.portalUrl || !parsed.identity) return null;
    return {
      portalUrl: parsed.portalUrl,
      token: parsed.token,
      identity: parsed.identity,
      patientId: parsed.patientId ?? null,
    };
  } catch {
    return null;
  }
}

export async function savePortalSession(session: StoredPortalSession): Promise<void> {
  const raw = JSON.stringify(session);
  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.setItemAsync(KEY, raw);
    } else {
      await AsyncStorage.setItem(KEY, raw);
    }
  } catch {
    // A failed secure write must not pretend the session was saved.
    throw new Error("Could not store the portal session securely.");
  }
}

export async function clearPortalSession(): Promise<void> {
  try {
    if (await SecureStore.isAvailableAsync()) {
      await SecureStore.deleteItemAsync(KEY);
    } else {
      await AsyncStorage.removeItem(KEY);
    }
  } catch {
    // Ignore: clearing local state still proceeds.
  }
}
