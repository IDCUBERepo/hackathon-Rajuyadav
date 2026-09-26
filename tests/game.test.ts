import { describe, expect, it } from 'vitest';
import { codeProblem, createGameCode, isStrictGameCode } from '../src/core/codes';
import {
  checkClaim,
  closeClaimWindow,
  createGame,
  DEFAULT_SETTINGS,
  drawNumber,
  migrateSettings,
  parseCallerGame,
  patternState,
  recordWinner,
  remainingNumbers,
  SETTINGS_VERSION,
  settingsNeedMigration,
  undoLast,
  type CallerGame,
  type GameSettings,
} from '../src/core/game';
import type { PatternId } from '../src/core/patterns';
import { generateTicket, ticketNumbers } from '../src/core/ticket';
import { testRandomInt } from './helpers';

const CODE_A = 'TKT23';
const CODE_B = 'QRS34';

function game(settings: Partial<GameSettings> = {}, called: number[] = []): CallerGame {
  return { ...createGame('ABCD', { ...DEFAULT_SETTINGS, ...settings }, 0), called };
}

/** Called list that completes `pattern` for a ticket, with the completing number last. */
function calledFor(code: string, pattern: 'topLine' | 'fullHouse'): number[] {
  const t = generateTicket('ABCD', code);
  return pattern === 'topLine' ? (t[0].filter((n) => n !== null) as number[]) : ticketNumbers(t);
}

function claimAndRecord(g: CallerGame, pattern: PatternId, code: string, name = 'P'): CallerGame {
  const r = checkClaim(g, pattern, code);
  if (r.kind !== 'valid') throw new Error(`expected valid, got ${r.kind}`);
  return recordWinner(g, pattern, code, name, r.shared);
}

describe('drawing numbers', () => {
  it('draws all 90 numbers exactly once, then stops', () => {
    let g = game();
    const randomInt = testRandomInt(1);
    for (let i = 0; i < 90; i++) {
      const r = drawNumber(g, randomInt);
      expect(r).not.toBeNull();
      g = r!.game;
    }
    expect([...g.called].sort((a, b) => a - b)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
    expect(remainingNumbers(g)).toEqual([]);
    expect(drawNumber(g, randomInt)).toBeNull();
  });

  it('does not draw after the game has ended', () => {
    expect(drawNumber({ ...game(), ended: true }, testRandomInt(1))).toBeNull();
  });

  it('does not mutate the original game', () => {
    const g = game();
    drawNumber(g, testRandomInt(1));
    expect(g.called).toEqual([]);
  });
});

describe('undo', () => {
  it('removes the last number', () => {
    expect(undoLast(game({}, [5, 9, 12])).called).toEqual([5, 9]);
    expect(undoLast(game()).called).toEqual([]);
  });

  it('removes a prize won on the undone number and reopens a finished game', () => {
    let g = game({ sharedWinners: false }, calledFor(CODE_A, 'fullHouse'));
    g = claimAndRecord(g, 'fullHouse', CODE_A);
    expect(g.ended).toBe(true);
    g = undoLast(g);
    expect(g.winners).toEqual([]);
    expect(g.ended).toBe(false);
  });
});

describe('claims', () => {
  it('rejects badly formatted ticket codes and disabled patterns', () => {
    expect(checkClaim(game(), 'topLine', 'AB').kind).toBe('badCode');
    expect(checkClaim(game(), 'topLine', 'ABCD0').kind).toBe('badCode');
    expect(checkClaim(game({ patterns: ['fullHouse'] }), 'topLine', CODE_A).kind).toBe('patternOff');
  });

  it('lists missing numbers when a claim is not yet valid', () => {
    const line = calledFor(CODE_A, 'topLine');
    const r = checkClaim(game({}, line.slice(0, 3)), 'topLine', CODE_A);
    expect(r.kind).toBe('notYet');
    if (r.kind === 'notYet') expect(r.missing).toEqual(line.slice(3));
  });

  it('accepts a valid claim and marks the pattern as won', () => {
    let g = game({}, calledFor(CODE_A, 'topLine'));
    expect(patternState(g, 'topLine')).toBe('open');
    g = claimAndRecord(g, 'topLine', CODE_A, 'Asha');
    expect(patternState(g, 'topLine')).toBe('won');
    expect(g.winners[0]).toMatchObject({ name: 'Asha', ticketCode: CODE_A, shared: false });
    expect(g.ended).toBe(false);
  });

  it('rejects the same ticket claiming the same pattern twice', () => {
    let g = game({ sharedWinners: true }, calledFor(CODE_A, 'topLine'));
    g = claimAndRecord(g, 'topLine', CODE_A);
    expect(checkClaim(g, 'topLine', CODE_A).kind).toBe('duplicate');
  });

  // The next tests are about other rules. Their called lists complete ticket A
  // before ticket B, so they use relaxed claims (strictClaim: false).

  it('without sharing a pattern can only be won once', () => {
    const called = [...new Set([...calledFor(CODE_A, 'topLine'), ...calledFor(CODE_B, 'topLine')])];
    let g = game({ strictClaim: false, sharedWinners: false }, called);
    g = claimAndRecord(g, 'topLine', CODE_A);
    expect(checkClaim(g, 'topLine', CODE_B).kind).toBe('alreadyWon');
  });

  it('shares the prize for two valid claims on the same number when enabled', () => {
    const called = [...new Set([...calledFor(CODE_A, 'topLine'), ...calledFor(CODE_B, 'topLine')])];
    let g = game({ sharedWinners: true, strictClaim: false }, called);
    g = claimAndRecord(g, 'topLine', CODE_A);
    const r = checkClaim(g, 'topLine', CODE_B);
    expect(r).toMatchObject({ kind: 'valid', shared: true });
    g = recordWinner(g, 'topLine', CODE_B, 'B', true);
    expect(patternState(g, 'topLine')).toBe('shared');
  });

  it('does not share when the second claim comes after another number', () => {
    const called = [...new Set([...calledFor(CODE_A, 'topLine'), ...calledFor(CODE_B, 'topLine')])];
    let g = game({ sharedWinners: true, strictClaim: false }, called);
    g = claimAndRecord(g, 'topLine', CODE_A);
    const extra = remainingNumbers(g)[0];
    g = { ...g, called: [...g.called, extra] };
    expect(checkClaim(g, 'topLine', CODE_B).kind).toBe('alreadyWon');
  });

  it('Full House ends the game (sharing OFF: at once)', () => {
    let g = game({ sharedWinners: false }, calledFor(CODE_A, 'fullHouse'));
    g = claimAndRecord(g, 'fullHouse', CODE_A);
    expect(g.ended).toBe(true);
    expect(drawNumber(g, testRandomInt(1))).toBeNull();
  });

  it('Full House ends the game (sharing ON: when the caller finishes checking claims)', () => {
    let g = game({}, calledFor(CODE_A, 'fullHouse'));
    g = claimAndRecord(g, 'fullHouse', CODE_A);
    expect(g.ended).toBe(false);
    expect(drawNumber(g, testRandomInt(1))).toBeNull(); // no more numbers meanwhile
    g = closeClaimWindow(g, 'fullHouse', testRandomInt(1)).game;
    expect(g.ended).toBe(true);
  });

  it('with a second Full House enabled, the game ends after the second one', () => {
    const called = [...new Set([...calledFor(CODE_A, 'fullHouse'), ...calledFor(CODE_B, 'fullHouse')])];
    let g = game({ secondFullHouse: true, strictClaim: false, sharedWinners: false }, called);
    g = claimAndRecord(g, 'fullHouse', CODE_A);
    expect(g.ended).toBe(false);
    expect(patternState(g, 'fullHouse')).toBe('open');
    g = claimAndRecord(g, 'fullHouse', CODE_B);
    expect(g.ended).toBe(true);
    expect(patternState(g, 'fullHouse')).toBe('won');
  });
});

describe('strict claim (on by default)', () => {
  const line = calledFor(CODE_A, 'topLine');
  // Numbers not on ticket A, to draw after the line is complete.
  const others = Array.from({ length: 90 }, (_, i) => i + 1).filter(
    (n) => !ticketNumbers(generateTicket('ABCD', CODE_A)).includes(n),
  );

  it('is ON in the default settings', () => {
    expect(DEFAULT_SETTINGS.strictClaim).toBe(true);
    expect(game().settings.strictClaim).toBe(true);
  });

  it('accepts a pattern completed on the latest number', () => {
    expect(checkClaim(game({}, [others[0], ...line]), 'topLine', CODE_A)).toMatchObject({ kind: 'valid' });
  });

  it('rejects a pattern completed earlier as late, saying which number and how long ago', () => {
    const r = checkClaim(game({}, [...line, others[0], others[1]]), 'topLine', CODE_A);
    expect(r).toMatchObject({ kind: 'late', completedOn: line[4], callsAgo: 2 });
    const one = checkClaim(game({}, [...line, others[0]]), 'topLine', CODE_A);
    expect(one).toMatchObject({ kind: 'late', completedOn: line[4], callsAgo: 1 });
  });

  it('rejects an incomplete pattern with the missing numbers', () => {
    const r = checkClaim(game({}, [line[0], others[0], line[2]]), 'topLine', CODE_A);
    expect(r).toMatchObject({ kind: 'notYet', missing: [line[1], line[3], line[4]] });
  });

  it('accepts a late claim when strict claim is turned OFF', () => {
    const r = checkClaim(game({ strictClaim: false }, [...line, others[0], others[1]]), 'topLine', CODE_A);
    expect(r).toMatchObject({ kind: 'valid' });
  });

  it('judges a claim against the numbers called when "Check a Claim" was pressed', () => {
    // Line completed on the 5th call; the button was pressed then (atCallCount 5),
    // but another number was drawn before the claim was submitted.
    const g = game({}, [...line, others[0]]);
    expect(checkClaim(g, 'topLine', CODE_A, 5)).toMatchObject({ kind: 'valid' });
    const recorded = recordWinner(g, 'topLine', CODE_A, 'Asha', false, 5);
    expect(recorded.winners[0].callCount).toBe(5);
    // A snapshot taken before the line was complete is not yet valid.
    expect(checkClaim(g, 'topLine', CODE_A, 4).kind).toBe('notYet');
    // A snapshot beyond the current draw (after an undo) is capped safely.
    expect(checkClaim(game({}, line), 'topLine', CODE_A, 99)).toMatchObject({ kind: 'valid' });
  });

  it('works for Early Five: the fifth hit must be the latest call', () => {
    const t = ticketNumbers(generateTicket('ABCD', CODE_A));
    const five = t.slice(0, 5);
    expect(checkClaim(game({}, five), 'earlyFive', CODE_A).kind).toBe('valid');
    expect(checkClaim(game({}, [...five, others[0]]), 'earlyFive', CODE_A)).toMatchObject({
      kind: 'late',
      completedOn: five[4],
      callsAgo: 1,
    });
  });
});

describe('settings migration', () => {
  it('turns Strict claim ON once for settings saved before version 2', () => {
    const old = { voice: false, strictClaim: false }; // no settingsVersion = version 1
    expect(settingsNeedMigration(old)).toBe(true);
    const migrated = migrateSettings(old);
    expect(migrated.strictClaim).toBe(true);
    expect(migrated.voice).toBe(false);
    expect(migrated.settingsVersion).toBe(SETTINGS_VERSION);
  });

  it('respects Strict claim OFF when chosen after the change', () => {
    const chosen = { ...migrateSettings({}), strictClaim: false };
    const reloaded = migrateSettings(JSON.parse(JSON.stringify(chosen)));
    expect(settingsNeedMigration(chosen)).toBe(false);
    expect(reloaded.strictClaim).toBe(false);
  });

  it('gives new or unreadable settings the defaults', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });

  it('does not change the rules of a game already in progress', () => {
    // A game saved before the change: strict off and no settingsVersion.
    const saved = createGame('ABCD', { ...DEFAULT_SETTINGS, strictClaim: false }, 0);
    const oldSettings: Partial<GameSettings> = { ...saved.settings };
    delete oldSettings.settingsVersion;
    expect(parseCallerGame({ ...saved, settings: oldSettings })?.settings.strictClaim).toBe(false);
  });
});

describe('game code carries the strict claim rule', () => {
  it('encodes Strict claim ON and OFF so players can show the right reminder', () => {
    const randomInt = testRandomInt(3);
    for (let i = 0; i < 200; i++) {
      const strict = createGameCode(true, randomInt);
      const relaxed = createGameCode(false, randomInt);
      expect(codeProblem(strict, 4)).toBeNull();
      expect(codeProblem(relaxed, 4)).toBeNull();
      expect(isStrictGameCode(strict)).toBe(true);
      expect(isStrictGameCode(relaxed)).toBe(false);
    }
  });
});
