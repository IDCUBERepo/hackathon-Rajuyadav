import { describe, expect, it } from 'vitest';
import {
  canDraw,
  checkClaim,
  closeClaimWindow,
  createGame,
  DEFAULT_SETTINGS,
  drawNumber,
  isClaimWindowOpen,
  migrateSettings,
  pendingTieBreaks,
  recordWinner,
  remainingNumbers,
  settingsNeedMigration,
  splitPoints,
  undoLast,
  winnerPoints,
  type CallerGame,
  type GameSettings,
} from '../src/core/game';
import type { PatternId } from '../src/core/patterns';
import { findTie, testRandomInt } from './helpers';

const GAME = 'TIES';

function newGame(settings: Partial<GameSettings>, called: number[]): CallerGame {
  return { ...createGame(GAME, { ...DEFAULT_SETTINGS, ...settings }, 0), called };
}

/** Check and record a claim; throws if it is not valid. */
function win(g: CallerGame, pattern: PatternId, code: string, name: string): CallerGame {
  const r = checkClaim(g, pattern, code);
  if (r.kind !== 'valid') throw new Error(`${name}: expected valid, got ${r.kind}`);
  return recordWinner(g, pattern, code, name, r.shared);
}

const tie = findTie(GAME, 4, 'topLine');
const [A, B, C, D] = tie.codes;
const names = (g: CallerGame) => g.winners.map((w) => w.name);

describe('defaults and migration', () => {
  it('Shared winners is ON by default with "Split the prize"', () => {
    expect(DEFAULT_SETTINGS.sharedWinners).toBe(true);
    expect(DEFAULT_SETTINGS.tieMode).toBe('split');
  });

  it('settings saved before this change get sharing ON once; a later OFF is kept', () => {
    const v2 = { settingsVersion: 2, sharedWinners: false, strictClaim: false };
    expect(settingsNeedMigration(v2)).toBe(true);
    const migrated = migrateSettings(v2);
    expect(migrated.sharedWinners).toBe(true);
    expect(migrated.strictClaim).toBe(false); // v2 already respected the caller's strict choice
    expect(migrated.tieMode).toBe('split');
    const later = JSON.parse(JSON.stringify({ ...migrated, sharedWinners: false, tieMode: 'draw' }));
    expect(settingsNeedMigration(later)).toBe(false);
    expect(migrateSettings(later)).toMatchObject({ sharedWinners: false, tieMode: 'draw' });
  });

  it('rejects unknown tie modes and bad points in saved settings', () => {
    const s = migrateSettings({ settingsVersion: 3, tieMode: 'coin', points: { topLine: 40.4, middleLine: -5, bottomLine: 'x' } });
    expect(s.tieMode).toBe('split');
    expect(s.points).toEqual({ topLine: 40 });
  });
});

describe('claim window (sharing ON)', () => {
  it('two valid claims on the same number are both recorded', () => {
    let g = newGame({}, tie.called);
    g = win(g, 'topLine', A, 'Asha');
    const second = checkClaim(g, 'topLine', B);
    expect(second).toMatchObject({ kind: 'valid', shared: true });
    g = recordWinner(g, 'topLine', B, 'Ben', true);
    expect(names(g)).toEqual(['Asha', 'Ben']);
  });

  it('a third valid claim before the next number is also recorded', () => {
    let g = newGame({}, tie.called);
    g = win(win(win(g, 'topLine', A, 'Asha'), 'topLine', B, 'Ben'), 'topLine', C, 'Chitra');
    expect(names(g)).toEqual(['Asha', 'Ben', 'Chitra']);
    expect(isClaimWindowOpen(g, 'topLine')).toBe(true);
  });

  it('a valid ticket claimed after the next number is called is late', () => {
    let g = newGame({}, tie.called);
    g = win(g, 'topLine', A, 'Asha');
    g = drawNumber(g, testRandomInt(1))!.game;
    expect(isClaimWindowOpen(g, 'topLine')).toBe(false);
    expect(checkClaim(g, 'topLine', B)).toMatchObject({ kind: 'late', completedOn: tie.number, callsAgo: 1 });
    // With strict claim off, the pattern is simply taken by then.
    const relaxed = { ...g, settings: { ...g.settings, strictClaim: false } };
    expect(checkClaim(relaxed, 'topLine', B).kind).toBe('alreadyWon');
  });

  it('claims are judged against the numbers called when "Check a Claim" was pressed', () => {
    let g = newGame({}, tie.called);
    g = win(g, 'topLine', A, 'Asha');
    const snapshot = g.called.length;
    g = { ...g, called: [...g.called, remainingNumbers(g)[0]], closed: [] }; // drawn meanwhile
    expect(checkClaim(g, 'topLine', B, snapshot)).toMatchObject({ kind: 'valid', shared: true });
  });

  it('"No more claims — continue" closes the pattern for that number', () => {
    let g = newGame({}, tie.called);
    g = win(g, 'topLine', A, 'Asha');
    g = closeClaimWindow(g, 'topLine', testRandomInt(1)).game;
    expect(isClaimWindowOpen(g, 'topLine')).toBe(false);
    expect(checkClaim(g, 'topLine', B).kind).toBe('alreadyWon');
    // Other patterns are unaffected, and the next number clears the closed list.
    expect(drawNumber(g, testRandomInt(2))!.game.closed).toEqual([]);
  });

  it('undo keeps the window on the previous number closed', () => {
    let g = newGame({}, tie.called);
    g = win(g, 'topLine', A, 'Asha');
    g = drawNumber(g, testRandomInt(3))!.game;
    g = undoLast(g);
    expect(isClaimWindowOpen(g, 'topLine')).toBe(false);
    expect(checkClaim(g, 'topLine', B).kind).toBe('alreadyWon');
  });
});

describe('sharing OFF', () => {
  it('only the first valid ticket checked wins; the second gets "already won"', () => {
    let g = newGame({ sharedWinners: false }, tie.called);
    g = win(g, 'topLine', A, 'Asha');
    expect(isClaimWindowOpen(g, 'topLine')).toBe(false);
    const r = checkClaim(g, 'topLine', B);
    expect(r.kind).toBe('alreadyWon');
    if (r.kind === 'alreadyWon') expect(r.winners.map((w) => w.name)).toEqual(['Asha']);
  });

  it('winner gets the full points', () => {
    const g = win(newGame({ sharedWinners: false, points: { topLine: 100 } }, tie.called), 'topLine', A, 'Asha');
    expect(winnerPoints(g, g.winners[0])).toBe(100);
  });
});

describe('tie settings and points', () => {
  const threeWay = (settings: Partial<GameSettings>) =>
    win(win(win(newGame({ points: { topLine: 100 }, ...settings }, tie.called), 'topLine', A, 'Asha'), 'topLine', B, 'Ben'), 'topLine', C, 'Chitra');

  it('splitPoints divides equally and rounds to whole points', () => {
    expect(splitPoints(100, 1)).toBe(100);
    expect(splitPoints(100, 2)).toBe(50);
    expect(splitPoints(100, 3)).toBe(33); // 33.33…
    expect(splitPoints(100, 6)).toBe(17); // 16.67…
    expect(splitPoints(50, 4)).toBe(13); // 12.5 rounds up
    expect(splitPoints(0, 3)).toBe(0);
  });

  it('Split the prize: 100 points between 3 winners is 33 each', () => {
    const g = threeWay({ tieMode: 'split' });
    expect(g.winners.map((w) => winnerPoints(g, w))).toEqual([33, 33, 33]);
  });

  it('Split the prize: 2 winners get 50 each; a lone winner gets 100', () => {
    let g = win(newGame({ points: { topLine: 100 } }, tie.called), 'topLine', A, 'Asha');
    expect(winnerPoints(g, g.winners[0])).toBe(100);
    g = win(g, 'topLine', B, 'Ben');
    expect(g.winners.map((w) => winnerPoints(g, w))).toEqual([50, 50]);
  });

  it('Everyone gets the full prize', () => {
    const g = threeWay({ tieMode: 'full' });
    expect(g.winners.map((w) => winnerPoints(g, w))).toEqual([100, 100, 100]);
  });

  it('Tie-breaker draw: waits for "Finish checking claims", then picks one at random', () => {
    let g = threeWay({ tieMode: 'draw' });
    expect(pendingTieBreaks(g)).toEqual(['topLine']);
    expect(g.winners.map((w) => winnerPoints(g, w))).toEqual([null, null, null]);
    expect(canDraw(g)).toBe(false); // the draw must happen before the next number
    // Injected random source picks index 1 (Ben).
    const { game, tieBreak } = closeClaimWindow(g, 'topLine', () => 1);
    g = game;
    expect(tieBreak?.winner.name).toBe('Ben');
    expect(tieBreak?.candidates.map((w) => w.name)).toEqual(['Asha', 'Ben', 'Chitra']);
    expect(g.winners.map((w) => w.tieBreak)).toEqual(['lost', 'won', 'lost']);
    expect(g.winners.map((w) => winnerPoints(g, w))).toEqual([0, 100, 0]);
    expect(pendingTieBreaks(g)).toEqual([]);
    expect(canDraw(g)).toBe(true);
  });

  it('Tie-breaker draw with a single winner needs no draw', () => {
    const g = win(newGame({ tieMode: 'draw', points: { topLine: 100 } }, tie.called), 'topLine', A, 'Asha');
    expect(pendingTieBreaks(g)).toEqual([]);
    const { tieBreak, game } = closeClaimWindow(g, 'topLine', () => 0);
    expect(tieBreak).toBeNull();
    expect(winnerPoints(game, game.winners[0])).toBe(100);
  });

  it('the random pick covers every tied winner', () => {
    const g = threeWay({ tieMode: 'draw' });
    const picked = new Set([0, 1, 2].map((i) => closeClaimWindow(g, 'topLine', () => i).tieBreak!.winner.name));
    expect(picked).toEqual(new Set(['Asha', 'Ben', 'Chitra']));
  });

  it('no points set: winners are listed without points', () => {
    const g = win(win(newGame({}, tie.called), 'topLine', A, 'Asha'), 'topLine', B, 'Ben');
    expect(g.winners.map((w) => winnerPoints(g, w))).toEqual([null, null]);
  });

  it('a fourth tied claim is still recorded before the next number', () => {
    const g = win(threeWay({ tieMode: 'split' }), 'topLine', D, 'Dev');
    expect(g.winners.map((w) => winnerPoints(g, w))).toEqual([25, 25, 25, 25]);
  });
});

describe('Full House ties', () => {
  const fh = findTie(GAME, 2, 'fullHouse', 7);

  it('the game ends only after the caller finishes checking Full House claims', () => {
    let g = newGame({ points: { fullHouse: 100 } }, fh.called);
    g = win(g, 'fullHouse', fh.codes[0], 'Asha');
    expect(g.ended).toBe(false);
    expect(canDraw(g)).toBe(false);
    g = win(g, 'fullHouse', fh.codes[1], 'Ben');
    g = closeClaimWindow(g, 'fullHouse', () => 0).game;
    expect(g.ended).toBe(true);
    expect(g.winners.map((w) => winnerPoints(g, w))).toEqual([50, 50]);
  });

  it('with sharing OFF, Full House ends the game at once', () => {
    const g = win(newGame({ sharedWinners: false }, fh.called), 'fullHouse', fh.codes[0], 'Asha');
    expect(g.ended).toBe(true);
  });
});
