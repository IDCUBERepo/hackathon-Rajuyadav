import type { VoiceLang } from './core/game';
import { isInclusive } from './prefs';

/** Speech rates: Inclusive Mode speaks more slowly and clearly. */
export const NORMAL_RATE = 0.9;
export const INCLUSIVE_RATE = 0.8;

/**
 * Thin wrapper over the Web Speech API. Voices load asynchronously in some
 * browsers (Chrome), so we listen for `voiceschanged` and notify subscribers.
 */

// `?? null` also covers browsers where the property exists but is empty.
const synth: SpeechSynthesis | null = typeof window !== 'undefined' ? (window.speechSynthesis ?? null) : null;

const listeners = new Set<() => void>();
if (synth) {
  synth.addEventListener?.('voiceschanged', () => listeners.forEach((fn) => fn()));
}

export function speechSupported(): boolean {
  return synth !== null && typeof synth.speak === 'function' && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function onVoicesChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function findVoice(lang: VoiceLang): SpeechSynthesisVoice | undefined {
  if (!synth) return undefined;
  const voices = synth.getVoices();
  const prefix = lang === 'hi' ? 'hi' : 'en';
  const matching = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  // Prefer an Indian English voice for familiar pronunciation, then any local voice.
  const preferred = lang === 'en' ? matching.find((v) => v.lang.toLowerCase() === 'en-in') : undefined;
  return preferred ?? matching.find((v) => v.localService) ?? matching[0];
}

export function hasVoiceFor(lang: VoiceLang): boolean {
  return findVoice(lang) !== undefined;
}

/** The language that will actually be used, falling back to English. */
export function effectiveLang(lang: VoiceLang): VoiceLang {
  return lang === 'hi' && !hasVoiceFor('hi') ? 'en' : lang;
}

/**
 * iOS Safari only allows speech that starts from a user gesture. Speaking an
 * empty utterance on the first tap "unlocks" later timer-driven speech.
 */
let unlocked = false;
export function unlockSpeech(): void {
  if (unlocked || !speechSupported()) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance('');
  u.volume = 0;
  synth!.speak(u);
}

export function speak(text: string, lang: VoiceLang): void {
  if (!speechSupported()) return;
  try {
    synth!.cancel(); // Never queue up stale numbers.
    const u = new SpeechSynthesisUtterance(text);
    const voice = findVoice(lang);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? (lang === 'hi' ? 'hi-IN' : 'en-IN');
    u.rate = isInclusive() ? INCLUSIVE_RATE : NORMAL_RATE;
    synth!.speak(u);
  } catch {
    // Speech is a nice-to-have; the number is always shown on screen too.
  }
}
