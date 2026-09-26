/**
 * localStorage wrapper. Every call is wrapped in try/catch because storage can
 * be unavailable (private mode, disabled cookies) or full. The app keeps
 * working in memory if saving fails.
 */

export const KEYS = {
  caller: 'tt:caller',
  lastSettings: 'tt:lastSettings',
  playerCurrent: 'tt:player:current',
  player: (gameCode: string) => `tt:player:${gameCode}`,
  prefs: 'tt:prefs',
} as const;

export function loadJson<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return isValid(value) ? value : null;
  } catch {
    return null;
  }
}

export function loadString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing useful to do; the data simply stays.
  }
}

/** True if this browser will actually persist data. */
export function storageWorks(): boolean {
  const probe = 'tt:probe';
  try {
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
