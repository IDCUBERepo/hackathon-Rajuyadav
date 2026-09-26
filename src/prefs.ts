import { KEYS, loadJson, save } from './storage';

export type Theme = 'system' | 'light' | 'dark' | 'contrast';
export type TextSize = 0 | 1 | 2;

/** A player game's own helper settings, remembered while Inclusive Mode is on. */
export interface PlayerAssist {
  helper: boolean;
  hints: boolean;
}

export interface Prefs {
  theme: Theme;
  textSize: TextSize;
  /** Inclusive Mode 👓 — bigger, clearer, simpler. */
  inclusive: boolean;
  /** The settings in place before Inclusive Mode was turned on, restored when it's turned off. */
  beforeInclusive?: { theme: Theme; textSize: TextSize; players: Record<string, PlayerAssist> };
}

export const DEFAULT_PREFS: Prefs = { theme: 'system', textSize: 0, inclusive: false };
const THEMES: Theme[] = ['system', 'light', 'dark', 'contrast'];
const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme);
const isTextSize = (v: unknown): v is TextSize => v === 0 || v === 1 || v === 2;

/** Validate saved preferences; older saves (without Inclusive Mode) stay valid. */
export function parsePrefs(v: unknown): Prefs | null {
  if (typeof v !== 'object' || v === null) return null;
  const p = v as Record<string, unknown>;
  if (!isTheme(p.theme) || !isTextSize(p.textSize)) return null;
  const prefs: Prefs = { theme: p.theme, textSize: p.textSize, inclusive: p.inclusive === true };
  const before = p.beforeInclusive as Record<string, unknown> | undefined;
  if (prefs.inclusive && before && isTheme(before.theme) && isTextSize(before.textSize)) {
    const players: Record<string, PlayerAssist> = {};
    if (typeof before.players === 'object' && before.players !== null) {
      for (const [code, a] of Object.entries(before.players as Record<string, Record<string, unknown>>)) {
        if (a && typeof a.helper === 'boolean' && typeof a.hints === 'boolean') players[code] = { helper: a.helper, hints: a.hints };
      }
    }
    prefs.beforeInclusive = { theme: before.theme, textSize: before.textSize, players };
  }
  return prefs;
}

export function loadPrefs(): Prefs {
  return parsePrefs(loadJson(KEYS.prefs, (_v): _v is unknown => true)) ?? DEFAULT_PREFS;
}

/** Reflect preferences on <html>; CSS does the rest. */
export function applyPrefs(prefs: Prefs): void {
  const root = document.documentElement;
  if (prefs.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.theme);
  root.setAttribute('data-text', String(prefs.textSize));
  root.setAttribute('data-inclusive', String(prefs.inclusive));
}

export function savePrefs(prefs: Prefs): void {
  save(KEYS.prefs, prefs);
  applyPrefs(prefs);
}

/** Is Inclusive Mode on for this device (as currently applied to the page)? */
export function isInclusive(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.inclusive === 'true';
}
