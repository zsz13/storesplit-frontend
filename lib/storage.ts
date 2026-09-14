/** Small localStorage helpers that never throw (private mode, SSR, quota). */

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readString(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // ignore
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = readString(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeString(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // ignore
  }
}

export const STORAGE_KEYS = {
  zip: "storesplit.zip",
  basket: "storesplit.basket",
} as const;
