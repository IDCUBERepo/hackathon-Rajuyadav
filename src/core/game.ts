import { ticketCodeProblem } from './codes';
import { completedByLastCall, completionIndex, evaluatePattern, PATTERN_IDS, type PatternId } from './patterns';
import type { RandomInt } from './random';
import { generateTicket, type Ticket } from './ticket';

export const TOTAL_NUMBERS = 90;
export const MIN_AUTO_INTERVAL = 5;
export const MAX_AUTO_INTERVAL = 30;

export type VoiceLang = 'en' | 'hi';
export type CallStyle = 'plain' | 'traditional';

/**
 * What happens when several players win the same pattern on the same number:
 *   split – the points are divided equally (rounded to whole points)
 *   full  – everyone gets the full prize
 *   draw  – one winner is picked at random once the caller finishes checking
 */
export type TieMode = 'split' | 'full' | 'draw';
export const TIE_MODES: readonly TieMode[] = ['split', 'full', 'draw'];

/**
 * Bump when a settings default changes in a way saved settings must follow,
 * and add a step to migrateSettings().
 *   1 → 2: Strict claim became ON by default.
 *   2 → 3: Shared winners became ON by default (tie mode "split" added).
 */
export const SETTINGS_VERSION = 3;

export interface GameSettings {
  settingsVersion: number;
  patterns: PatternId[];
  /** Optional prize text per pattern, e.g. "₹100" or "Chocolate box". */
  prizes: Partial<Record<PatternId, string>>;
  /** Optional points per pattern; used to split prizes between tied winners. */
  points: Partial<Record<PatternId, number>>;
  voice: boolean;
  voiceLang: VoiceLang;
  callStyle: CallStyle;
  autoIntervalSec: number;
  /** Everyone who claims a pattern on the same number wins (see tieMode). */
  sharedWinners: boolean;
  tieMode: TieMode;
  /** A claim only counts if the last number called completed it. */
  strictClaim: boolean;
  /** Keep playing after the first Full House for a second one. */
  secondFullHouse: boolean;
  vibrate: boolean;
}

/** The single source of truth for default settings. */
export const DEFAULT_SETTINGS: GameSettings = {
  settingsVersion: SETTINGS_VERSION,
  patterns: [...PATTERN_IDS],
  prizes: {},
  points: {},
  voice: true,
  voiceLang: 'en',
  callStyle: 'plain',
  autoIntervalSec: 10,
  sharedWinners: true,
  tieMode: 'split',
  strictClaim: true,
  secondFullHouse: false,
  vibrate: false,
};

export interface Winner {
  pattern: PatternId;
  name: string;
  ticketCode: string;
  /** How many numbers had been called when the claim was accepted. */
  callCount: number;
  /** True when this winner joined an earlier winner's claim on the same number. */
  shared: boolean;
  /** Set on every tied winner once a tie-breaker draw has been held. */
  tieBreak?: 'won' | 'lost';
}

export interface CallerGame {
  version: 1;
  gameCode: string;
  createdAt: number;
  settings: GameSettings;
  /** Called numbers in draw order. */
  called: number[];
  winners: Winner[];
  /**
   * Patterns whose claim window the caller has closed ("No more claims") on
   * the current number. Cleared whenever a number is drawn.
   */
  closed: PatternId[];
  ended: boolean;
}

export function createGame(gameCode: string, settings: GameSettings, now = Date.now()): CallerGame {
  return { version: 1, gameCode, createdAt: now, settings, called: [], winners: [], closed: [], ended: false };
}

export function remainingNumbers(game: CallerGame): number[] {
  const called = new Set(game.called);
  const out: number[] = [];
  for (let n = 1; n <= TOTAL_NUMBERS; n++) if (!called.has(n)) out.push(n);
  return out;
}

/* ---------- Winners, claim windows and ties ---------- */

/** How many separate times a pattern can be won. */
export function patternCapacity(game: CallerGame, pattern: PatternId): number {
  return pattern === 'fullHouse' && game.settings.secondFullHouse ? 2 : 1;
}

export function winnersFor(game: CallerGame, pattern: PatternId): Winner[] {
  return game.winners.filter((w) => w.pattern === pattern);
}

/** Everyone who won `pattern` on the same number as `callCount` (a tie group). */
export function claimGroup(game: CallerGame, pattern: PatternId, callCount: number): Winner[] {
  return winnersFor(game, pattern).filter((w) => w.callCount === callCount);
}

function slotsUsed(game: CallerGame, pattern: PatternId): number {
  return winnersFor(game, pattern).filter((w) => !w.shared).length;
}

/**
 * The claim window: with sharing on, once a pattern has a winner on the
 * current number, more players may claim it until the caller closes the
 * window or calls the next number.
 */
export function isClaimWindowOpen(game: CallerGame, pattern: PatternId): boolean {
  return (
    game.settings.sharedWinners &&
    !game.closed.includes(pattern) &&
    claimGroup(game, pattern, game.called.length).length > 0
  );
}

export function openClaimWindows(game: CallerGame): PatternId[] {
  return game.settings.patterns.filter((p) => isClaimWindowOpen(game, p));
}

/** Patterns with a tie on the current number still waiting for the tie-breaker draw. */
export function pendingTieBreaks(game: CallerGame): PatternId[] {
  if (!game.settings.sharedWinners || game.settings.tieMode !== 'draw') return [];
  return game.settings.patterns.filter((p) => {
    const group = claimGroup(game, p, game.called.length);
    return group.length > 1 && !group.some((w) => w.tieBreak);
  });
}

/** Full House is used up and its claim window (if any) is closed. */
function isFinished(game: CallerGame): boolean {
  return (
    game.settings.patterns.includes('fullHouse') &&
    slotsUsed(game, 'fullHouse') >= patternCapacity(game, 'fullHouse') &&
    !isClaimWindowOpen(game, 'fullHouse')
  );
}

/** Full House won, but more tied claims may still come in before the game ends. */
function fullHouseWindowOpen(game: CallerGame): boolean {
  return (
    game.settings.patterns.includes('fullHouse') &&
    slotsUsed(game, 'fullHouse') >= patternCapacity(game, 'fullHouse') &&
    isClaimWindowOpen(game, 'fullHouse')
  );
}

export function canDraw(game: CallerGame): boolean {
  return (
    !game.ended &&
    game.called.length < TOTAL_NUMBERS &&
    !fullHouseWindowOpen(game) && // Finish checking Full House claims first.
    pendingTieBreaks(game).length === 0 // Hold the tie-breaker draw first.
  );
}

/** Draw uniformly at random from the numbers not yet called. Closes all claim windows. */
export function drawNumber(
  game: CallerGame,
  randomInt: RandomInt,
): { game: CallerGame; number: number } | null {
  if (!canDraw(game)) return null;
  const remaining = remainingNumbers(game);
  const number = remaining[randomInt(remaining.length)];
  return { game: { ...game, called: [...game.called, number], closed: [] }, number };
}

/**
 * Remove the last called number. Any prize won on that number is also removed,
 * because the claim depended on it; a game ended by Full House is reopened.
 * Claim windows on the number we step back to stay closed - the caller had
 * already moved on from it.
 */
export function undoLast(game: CallerGame): CallerGame {
  if (game.called.length === 0) return game;
  const called = game.called.slice(0, -1);
  const winners = game.winners.filter((w) => w.callCount <= called.length);
  const closed = PATTERN_IDS.filter((p) => winners.some((w) => w.pattern === p && w.callCount === called.length));
  const next = { ...game, called, winners, closed };
  return { ...next, ended: isFinished(next) };
}

export type PatternState = 'open' | 'won' | 'shared';

export function patternState(game: CallerGame, pattern: PatternId): PatternState {
  const winners = winnersFor(game, pattern);
  if (winners.length === 0) return 'open';
  if (winners.some((w) => w.shared)) return 'shared';
  return slotsUsed(game, pattern) >= patternCapacity(game, pattern) ? 'won' : 'open';
}

/* ---------- Claims ---------- */

export type ClaimResult =
  | { kind: 'badCode' }
  | { kind: 'patternOff' }
  | { kind: 'alreadyWon'; winners: Winner[] }
  | { kind: 'duplicate' }
  | { kind: 'notYet'; ticket: Ticket; missing: number[]; stillNeeded: number }
  | { kind: 'late'; ticket: Ticket; completedOn: number; callsAgo: number }
  | { kind: 'valid'; ticket: Ticket; shared: boolean };

/**
 * The numbers a claim is judged against: those called when the caller pressed
 * "Check a Claim" (`atCallCount`), never numbers drawn afterwards. Capped at
 * the current length in case a number was undone meanwhile.
 */
export function calledAt(game: CallerGame, atCallCount = game.called.length): number[] {
  return game.called.slice(0, Math.min(atCallCount, game.called.length));
}

/** Check a claim without changing the game. */
export function checkClaim(
  game: CallerGame,
  pattern: PatternId,
  ticketCode: string,
  atCallCount = game.called.length,
): ClaimResult {
  if (ticketCodeProblem(ticketCode) !== null) return { kind: 'badCode' };
  if (!game.settings.patterns.includes(pattern)) return { kind: 'patternOff' };

  const existing = winnersFor(game, pattern);
  if (existing.some((w) => w.ticketCode === ticketCode)) return { kind: 'duplicate' };

  const called = calledAt(game, atCallCount);
  const ticket = generateTicket(game.gameCode, ticketCode);
  const evaluation = evaluatePattern(ticket, called, pattern);
  if (!evaluation.complete) {
    return { kind: 'notYet', ticket, missing: evaluation.missing, stillNeeded: evaluation.stillNeeded };
  }

  // Strict claim: a pattern completed before the latest number is late - even
  // if someone else has won it meanwhile, "late" is the more helpful answer.
  if (game.settings.strictClaim && !completedByLastCall(ticket, called, pattern)) {
    const index = completionIndex(ticket, called, pattern);
    return { kind: 'late', ticket, completedOn: called[index], callsAgo: called.length - 1 - index };
  }

  // Joining an open claim window: same number as an existing winner, sharing
  // on, and the caller has not said "No more claims" for this pattern.
  const sameNumber = claimGroup(game, pattern, called.length).length > 0;
  const windowClosed = called.length === game.called.length && game.closed.includes(pattern);
  const shared = sameNumber && game.settings.sharedWinners && !windowClosed;
  if (!shared && slotsUsed(game, pattern) >= patternCapacity(game, pattern)) {
    return { kind: 'alreadyWon', winners: existing };
  }
  return { kind: 'valid', ticket, shared };
}

/**
 * Record a winner after a 'valid' claim. Ends the game when Full House is used
 * up - unless its claim window is still open for tied claims.
 */
export function recordWinner(
  game: CallerGame,
  pattern: PatternId,
  ticketCode: string,
  name: string,
  shared: boolean,
  atCallCount = game.called.length,
): CallerGame {
  const callCount = calledAt(game, atCallCount).length;
  const winner: Winner = { pattern, name, ticketCode, callCount, shared };
  const next = { ...game, winners: [...game.winners, winner] };
  return { ...next, ended: game.ended || isFinished(next) };
}

export interface TieBreakResult {
  winner: Winner;
  candidates: Winner[];
}

/**
 * "No more claims — continue": close a pattern's claim window on the current
 * number. In tie-breaker mode with two or more winners, one is picked at
 * random here (`randomInt` is injectable for tests). Ends the game if this
 * closes the final Full House.
 */
export function closeClaimWindow(
  game: CallerGame,
  pattern: PatternId,
  randomInt: RandomInt,
): { game: CallerGame; tieBreak: TieBreakResult | null } {
  let winners = game.winners;
  let tieBreak: TieBreakResult | null = null;
  if (pendingTieBreaks(game).includes(pattern)) {
    const candidates = claimGroup(game, pattern, game.called.length);
    const chosen = candidates[randomInt(candidates.length)];
    winners = game.winners.map((w) =>
      candidates.includes(w) ? { ...w, tieBreak: w === chosen ? ('won' as const) : ('lost' as const) } : w,
    );
    tieBreak = { winner: { ...chosen, tieBreak: 'won' }, candidates };
  }
  const closed = game.closed.includes(pattern) ? game.closed : [...game.closed, pattern];
  const next = { ...game, winners, closed };
  return { game: { ...next, ended: game.ended || isFinished(next) }, tieBreak };
}

/* ---------- Points ---------- */

/** Equal share of `total` points for `winners` people, rounded to whole points (100 ÷ 3 = 33). */
export function splitPoints(total: number, winners: number): number {
  return Math.round(total / Math.max(1, winners));
}

/**
 * Points this winner receives, or null if the pattern has no points set or a
 * tie-breaker draw has not been held yet.
 */
export function winnerPoints(game: CallerGame, winner: Winner): number | null {
  const total = game.settings.points[winner.pattern];
  if (total === undefined) return null;
  const group = claimGroup(game, winner.pattern, winner.callCount);
  if (group.length <= 1) return total;
  switch (game.settings.tieMode) {
    case 'split':
      return splitPoints(total, group.length);
    case 'full':
      return total;
    case 'draw':
      if (!winner.tieBreak) return null;
      return winner.tieBreak === 'won' ? total : 0;
  }
}

export function endGame(game: CallerGame): CallerGame {
  return { ...game, ended: true };
}

/* ---------- Loading and migrating saved data ---------- */

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Fill missing fields from defaults and drop invalid values. Does not migrate. */
function normalizeSettings(raw: unknown): GameSettings {
  const merged: GameSettings = { ...DEFAULT_SETTINGS, ...(isObject(raw) ? raw : {}) };
  merged.patterns = Array.isArray(merged.patterns)
    ? merged.patterns.filter((p) => PATTERN_IDS.includes(p))
    : [...PATTERN_IDS];
  merged.prizes = isObject(merged.prizes) ? { ...merged.prizes } : {};
  const points: Partial<Record<PatternId, number>> = {};
  if (isObject(merged.points)) {
    for (const p of PATTERN_IDS) {
      const v = (merged.points as Record<string, unknown>)[p];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) points[p] = Math.round(v);
    }
  }
  merged.points = points;
  merged.prizes = Object.fromEntries(
    Object.entries(merged.prizes).filter(([p, v]) => PATTERN_IDS.includes(p as PatternId) && typeof v === 'string'),
  );
  if (!TIE_MODES.includes(merged.tieMode)) merged.tieMode = DEFAULT_SETTINGS.tieMode;
  if (merged.voiceLang !== 'en' && merged.voiceLang !== 'hi') merged.voiceLang = DEFAULT_SETTINGS.voiceLang;
  if (merged.callStyle !== 'plain' && merged.callStyle !== 'traditional') merged.callStyle = DEFAULT_SETTINGS.callStyle;
  const interval = merged.autoIntervalSec;
  if (!Number.isInteger(interval) || interval < MIN_AUTO_INTERVAL || interval > MAX_AUTO_INTERVAL) {
    merged.autoIntervalSec = DEFAULT_SETTINGS.autoIntervalSec;
  }
  for (const key of ['voice', 'sharedWinners', 'strictClaim', 'secondFullHouse', 'vibrate'] as const) {
    if (typeof merged[key] !== 'boolean') merged[key] = DEFAULT_SETTINGS[key];
  }
  return merged;
}

/**
 * Bring saved setup settings up to date. Settings saved before a version bump
 * get the new default once; after that the caller's own choice is kept,
 * because it is saved with the current version.
 */
export function migrateSettings(raw: unknown): GameSettings {
  const version = isObject(raw) && typeof raw.settingsVersion === 'number' ? raw.settingsVersion : 1;
  const settings = normalizeSettings(raw);
  if (version < 2) settings.strictClaim = true; // Strict claim became the default.
  if (version < 3) settings.sharedWinners = true; // Shared winners became the default.
  settings.settingsVersion = SETTINGS_VERSION;
  return settings;
}

/** True if saved settings need migrating (and therefore re-saving). */
export function settingsNeedMigration(raw: unknown): boolean {
  return !isObject(raw) || raw.settingsVersion !== SETTINGS_VERSION;
}

/**
 * Shape check for a game loaded from storage. Missing settings are filled from
 * defaults (so older saves keep working); anything structurally wrong is rejected.
 */
export function parseCallerGame(value: unknown): CallerGame | null {
  if (!isObject(value) || value.version !== 1) return null;
  const { gameCode, called, winners, ended, createdAt, settings, closed } = value;
  if (typeof gameCode !== 'string' || !Array.isArray(called) || !Array.isArray(winners)) return null;
  const validNumbers =
    called.every((n) => Number.isInteger(n) && n >= 1 && n <= TOTAL_NUMBERS) &&
    new Set(called).size === called.length;
  const validWinners = winners.every(
    (w) =>
      isObject(w) &&
      PATTERN_IDS.includes(w.pattern as PatternId) &&
      typeof w.name === 'string' &&
      typeof w.ticketCode === 'string' &&
      typeof w.callCount === 'number' &&
      typeof w.shared === 'boolean' &&
      (w.tieBreak === undefined || w.tieBreak === 'won' || w.tieBreak === 'lost'),
  );
  if (!validNumbers || !validWinners) return null;
  return {
    version: 1,
    gameCode,
    createdAt: typeof createdAt === 'number' ? createdAt : Date.now(),
    // A game in progress keeps the rules it started with - no migration here,
    // so an ongoing game never changes rules after a refresh or an update.
    settings: normalizeSettings(settings),
    called: called as number[],
    winners: winners as Winner[],
    closed: Array.isArray(closed) ? closed.filter((p): p is PatternId => PATTERN_IDS.includes(p as PatternId)) : [],
    ended: ended === true,
  };
}
