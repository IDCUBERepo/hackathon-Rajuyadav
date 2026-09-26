import { numberAnnouncement, winnerSpeech } from '../announce';
import { createGameCode } from '../core/codes';
import {
  canDraw,
  checkClaim,
  closeClaimWindow,
  createGame,
  drawNumber,
  endGame,
  parseCallerGame,
  recordWinner,
  undoLast,
  type CallerGame,
  type ClaimResult,
  type GameSettings,
  type TieBreakResult,
} from '../core/game';
import type { PatternId } from '../core/patterns';
import { secureRandomInt } from '../core/random';
import { newWinnerNews, winnerNews, type WinnerNews } from '../core/results';
import { t } from '../i18n';
import { isInclusive } from '../prefs';
import { KEYS, loadJson, remove, save } from '../storage';
import { effectiveLang, hasVoiceFor, speak, speechSupported } from '../speech';
import { announce } from '../ui/dom';

/**
 * The caller's live game. Shared by the caller, TV and claim screens so that
 * auto-draw keeps running when you switch between them. Every change is saved
 * to localStorage immediately, so a refresh never loses the game.
 */

export type SessionEvent =
  | { type: 'change' }
  | { type: 'drawn'; number: number }
  | { type: 'tick' }
  | { type: 'winner'; news: WinnerNews };
type Listener = (event: SessionEvent) => void;

const isGame = (v: unknown): v is CallerGame => parseCallerGame(v) !== null;

let game: CallerGame | null = load();
const listeners = new Set<Listener>();

// Auto-draw is deliberately not persisted: after a refresh it starts paused,
// so numbers are never drawn without the caller noticing.
let autoRunning = false;
let nextDrawAt = 0;
let timer: number | undefined;

function load(): CallerGame | null {
  const raw = loadJson(KEYS.caller, isGame);
  return raw ? parseCallerGame(raw) : null;
}

function emit(event: SessionEvent): void {
  listeners.forEach((fn) => fn(event));
}

function commit(next: CallerGame | null): void {
  game = next;
  if (next) save(KEYS.caller, next);
  else remove(KEYS.caller);
  if (!next || !canDraw(next)) stopTimer();
  emit({ type: 'change' });
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getGame(): CallerGame | null {
  return game;
}

export function startNewGame(settings: GameSettings): CallerGame {
  stopTimer();
  const next = createGame(createGameCode(settings.strictClaim), settings);
  commit(next);
  return next;
}

export function clearGame(): void {
  stopTimer();
  commit(null);
}

function sayNumber(n: number): void {
  if (!game) return;
  const { voice, voiceLang, callStyle } = game.settings;
  if (voice) {
    const lang = effectiveLang(voiceLang);
    speak(numberAnnouncement(n, callStyle, lang, isInclusive()), lang);
  }
}

export function draw(): number | null {
  if (!game) return null;
  const result = drawNumber(game, secureRandomInt);
  if (!result) return null;
  commit(result.game);
  sayNumber(result.number);
  if (game?.settings.vibrate) navigator.vibrate?.(150);
  announce(t('announceNumber', { number: result.number }));
  emit({ type: 'drawn', number: result.number });
  if (autoRunning) nextDrawAt = Date.now() + (game?.settings.autoIntervalSec ?? 10) * 1000;
  return result.number;
}

export function repeatCurrent(): void {
  const last = game?.called[game.called.length - 1];
  if (last === undefined) return;
  sayNumber(last);
  announce(t('announceNumber', { number: last }));
}

export function undo(): void {
  if (game && game.called.length > 0) commit(undoLast(game));
}

export function finishGame(): void {
  if (game) commit(endGame(game));
}

/**
 * Check (and, if valid, record) a claim against the numbers that had been
 * called when "Check a Claim" was pressed - see openClaimDialog().
 */
export function claim(pattern: PatternId, ticketCode: string, name: string, atCallCount: number): ClaimResult | null {
  if (!game) return null;
  const result = checkClaim(game, pattern, ticketCode, atCallCount);
  if (result.kind === 'valid') {
    const next = recordWinner(game, pattern, ticketCode, name, result.shared, atCallCount);
    commit(next);
    const news = winnerNews(next, pattern, next.winners[next.winners.length - 1].callCount);
    if (news) celebrateWinner(news);
  }
  return result;
}

/**
 * Tell the room: speak the winner line (in the chosen voice language) and let
 * the caller and TV screens show the winner banner.
 */
function celebrateWinner(news: WinnerNews): void {
  if (game?.settings.voice) {
    const lang = effectiveLang(game.settings.voiceLang);
    speak(winnerSpeech(news, lang), lang);
  }
  emit({ type: 'winner', news });
}

/**
 * "No more claims — continue" / "Finish checking claims" for a pattern.
 * Holds the tie-breaker draw if one is due; the UI reveals it with a short
 * animation and then calls announceTieBreak(), so the result isn't spoiled.
 */
export function finishClaims(pattern: PatternId): TieBreakResult | null {
  if (!game) return null;
  const { game: next, tieBreak } = closeClaimWindow(game, pattern, secureRandomInt);
  commit(next);
  return tieBreak;
}

export function announceTieBreak(tieBreak: TieBreakResult): void {
  if (!game) return;
  const news = winnerNews(game, tieBreak.winner.pattern, tieBreak.winner.callCount);
  if (news) celebrateWinner(news);
}

/* ---------- Auto-draw ---------- */

function stopTimer(): void {
  autoRunning = false;
  window.clearInterval(timer);
  timer = undefined;
}

export function isAutoRunning(): boolean {
  return autoRunning;
}

export function secondsUntilNextDraw(): number {
  return Math.max(0, Math.ceil((nextDrawAt - Date.now()) / 1000));
}

export function startAuto(): void {
  if (!game || !canDraw(game) || autoRunning) return;
  autoRunning = true;
  nextDrawAt = Date.now() + game.settings.autoIntervalSec * 1000;
  // A short tick keeps the countdown accurate even if the tab was throttled.
  timer = window.setInterval(() => {
    if (Date.now() >= nextDrawAt) draw();
    emit({ type: 'tick' });
  }, 250);
  emit({ type: 'change' });
}

export function pauseAuto(): void {
  if (!autoRunning) return;
  stopTimer();
  emit({ type: 'change' });
}

/* ---------- Voice availability notice ---------- */

export function voiceNotice(settings: GameSettings): string | null {
  if (!settings.voice) return null;
  if (!speechSupported()) return t('voiceMissingAll');
  if (settings.voiceLang === 'hi' && !hasVoiceFor('hi')) return t('voiceMissingHindi');
  return null;
}

/* ---------- Keep other tabs in step (e.g. TV window on a second screen) ---------- */

window.addEventListener('storage', (e) => {
  if (e.key !== KEYS.caller) return;
  const fresh = load();
  // Another tab now owns the draw; stop our timer to avoid double drawing.
  stopTimer();
  const previous = game;
  game = fresh;
  emit({ type: 'change' });
  // Show the winner banner here too (the caller's tab already spoke the line).
  if (fresh) for (const news of newWinnerNews(previous, fresh)) emit({ type: 'winner', news });
});
