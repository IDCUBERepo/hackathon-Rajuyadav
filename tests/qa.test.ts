/**
 * Quality-check suite: one test per checklist ID (A1, B3, …) so results map
 * directly onto the QA report. UI-level checks live in e2e/qa.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  codeProblem,
  createGameCode,
  normalizeCode,
  playerTicketCodes,
  POSITION_CHARS,
  randomCode,
  randomTicketCode,
  stripTicketCodes,
  ticketCodeProblem,
} from '../src/core/codes';
import {
  checkClaim,
  createGame,
  DEFAULT_SETTINGS,
  drawNumber,
  migrateSettings,
  patternState,
  recordWinner,
  remainingNumbers,
  settingsNeedMigration,
  undoLast,
  type CallerGame,
  type GameSettings,
} from '../src/core/game';
import { evaluatePattern, patternNumbers, PATTERN_IDS, type PatternId } from '../src/core/patterns';
import { columnRange, COLS, generateStrip, generateTicket, ROWS, ticketNumbers, type Ticket } from '../src/core/ticket';
import { TRADITIONAL_CALLS } from '../src/data/calls';
import { testRandomInt, ticketFromRows } from './helpers';

const GAME = 'QATG';
const range90 = Array.from({ length: 90 }, (_, i) => i + 1);

function newGame(settings: Partial<GameSettings> = {}, called: number[] = []): CallerGame {
  return { ...createGame(GAME, { ...DEFAULT_SETTINGS, ...settings }, 0), called };
}
const ticketOf = (code: string) => generateTicket(GAME, code);
const topRow = (t: Ticket) => t[0].filter((n): n is number => n !== null);
const notOn = (t: Ticket) => range90.filter((n) => !ticketNumbers(t).includes(n));

/** 10,000 tickets shared by A1–A3 (generated once). */
const TEN_THOUSAND: Ticket[] = (() => {
  const randomInt = testRandomInt(2026);
  return Array.from({ length: 10_000 }, () => generateTicket(randomCode(4, randomInt), randomTicketCode(randomInt)));
})();

describe('A. Tickets', () => {
  it('A1 10,000 tickets: 3×9 grid, exactly 15 numbers, exactly 5 per row', () => {
    for (const t of TEN_THOUSAND) {
      expect(t).toHaveLength(ROWS);
      for (const row of t) {
        expect(row).toHaveLength(COLS);
        expect(row.filter((c) => c !== null)).toHaveLength(5);
      }
      expect(ticketNumbers(t)).toHaveLength(15);
    }
  });

  it('A2 column ranges are 1–9, 10–19, …, 70–79, 80–90 (90 in the last column)', () => {
    expect(Array.from({ length: COLS }, (_, c) => columnRange(c))).toEqual([
      [1, 9], [10, 19], [20, 29], [30, 39], [40, 49], [50, 59], [60, 69], [70, 79], [80, 90],
    ]);
    let saw90 = 0;
    for (const t of TEN_THOUSAND) {
      t.forEach((row) =>
        row.forEach((n, c) => {
          if (n === null) return;
          const [lo, hi] = columnRange(c);
          expect(n >= lo && n <= hi, `${n} in column ${c}`).toBe(true);
          if (n === 90) {
            expect(c).toBe(8);
            saw90++;
          }
        }),
      );
    }
    expect(saw90).toBeGreaterThan(0);
  });

  it('A3 each column has 1–3 numbers, ascending top to bottom, no duplicates', () => {
    for (const t of TEN_THOUSAND) {
      for (let c = 0; c < COLS; c++) {
        const col = t.map((r) => r[c]).filter((n): n is number => n !== null);
        expect(col.length).toBeGreaterThanOrEqual(1);
        expect(col.length).toBeLessThanOrEqual(3);
        expect([...col].sort((a, b) => a - b)).toEqual(col);
      }
      expect(new Set(ticketNumbers(t)).size).toBe(15);
    }
  });

  it('A4 the same game code + ticket code always gives the identical ticket', () => {
    const randomInt = testRandomInt(4);
    for (let i = 0; i < 500; i++) {
      const g = randomCode(4, randomInt);
      const c = randomTicketCode(randomInt);
      expect(generateTicket(g, c)).toEqual(generateTicket(g, c));
    }
  });

  it('A5a the same ticket code in a different game gives a different ticket', () => {
    const randomInt = testRandomInt(5);
    for (let i = 0; i < 1000; i++) {
      const c = randomTicketCode(randomInt);
      expect(generateTicket('GAMA', c)).not.toEqual(generateTicket('GAMB', c));
    }
  });

  it('A5b random different ticket codes in one game give different tickets', () => {
    const randomInt = testRandomInt(6);
    const seen = new Map<string, string>();
    for (let i = 0; i < 5000; i++) {
      const c = randomTicketCode(randomInt);
      const key = JSON.stringify(generateTicket(GAME, c));
      const other = seen.get(key);
      if (other !== undefined && other !== c) throw new Error(`${c} and ${other} give the same ticket`);
      seen.set(key, c);
    }
  });

  // Previously …A and …G (alphabet index 0 and 6) selected the same ticket.
  // Now each strip position has exactly one character (2–7) and any other
  // last character is an invalid code, so codes and tickets are one-to-one.
  it('A5c codes differing only in the last character never give the same ticket', () => {
    const tickets = [...POSITION_CHARS].map((c) => JSON.stringify(generateTicket(GAME, `KMN2${c}`)));
    expect(new Set(tickets).size).toBe(6);
    for (const c of CODE_ALPHABET) {
      if (!POSITION_CHARS.includes(c)) {
        expect(ticketCodeProblem(`KMN2${c}`)).toBe('position');
        expect(() => generateTicket(GAME, `KMN2${c}`)).toThrow();
      }
    }
    expect(ticketCodeProblem('KMN2A')).toBe('position'); // the old alias pair
    expect(ticketCodeProblem('KMN2G')).toBe('position');
  });

  it('A5d every valid ticket code is a different ticket (exhaustive over many strips)', () => {
    const randomInt = testRandomInt(55);
    const seen = new Map<string, string>();
    for (let s = 0; s < 3000; s++) {
      const strip = randomCode(4, randomInt);
      for (const c of POSITION_CHARS) {
        const code = strip + c;
        const key = JSON.stringify(generateTicket(GAME, code));
        const other = seen.get(key);
        if (other !== undefined && other !== code) throw new Error(`${code} and ${other} give the same ticket`);
        seen.set(key, code);
      }
    }
  });

  it('A6 printed strips of 6 tickets contain every number 1–90 exactly once', () => {
    const randomInt = testRandomInt(7);
    for (let i = 0; i < 500; i++) {
      const codes = stripTicketCodes(randomInt);
      const all = codes.flatMap((c) => ticketNumbers(generateTicket(GAME, c))).sort((a, b) => a - b);
      expect(all).toEqual(range90);
    }
    for (let i = 0; i < 500; i++) {
      expect(generateStrip(`qa-${i}`).flatMap(ticketNumbers).sort((a, b) => a - b)).toEqual(range90);
    }
  });

  it('A7 game codes and ticket codes never contain 0, O, 1, I or L', () => {
    const randomInt = testRandomInt(8);
    const codes = [
      ...Array.from({ length: 2000 }, (_, i) => createGameCode(i % 2 === 0, randomInt)),
      ...Array.from({ length: 500 }, () => playerTicketCodes(6, randomInt)).flat(),
      ...Array.from({ length: 500 }, () => stripTicketCodes(randomInt)).flat(),
    ];
    for (const code of codes) expect(code).not.toMatch(/[0O1IL]/);
    expect(CODE_ALPHABET).not.toMatch(/[0O1IL]/);
  });

  it('A8 ticket codes are case-insensitive when typed', () => {
    expect(normalizeCode('tkt24')).toBe('TKT24');
    expect(normalizeCode(' Tk-t24 ')).toBe('TKT24');
    const line = topRow(ticketOf('TKT24'));
    const g = newGame({}, line);
    expect(checkClaim(g, 'topLine', normalizeCode('tkt24')).kind).toBe('valid');
    expect(generateTicket(GAME, normalizeCode('tkt24'))).toEqual(generateTicket(GAME, 'TKT24'));
  });
});

describe('B. Number drawing', () => {
  it('B1 drawing 90 times gives every number 1–90 exactly once', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let g = newGame();
      const randomInt = testRandomInt(seed);
      for (let i = 0; i < 90; i++) g = drawNumber(g, randomInt)!.game;
      expect(new Set(g.called).size).toBe(90);
      expect([...g.called].sort((a, b) => a - b)).toEqual(range90);
      expect(drawNumber(g, randomInt)).toBeNull();
    }
  });

  it('B3 undo removes only the latest number and returns it to the pool', () => {
    const g = newGame({}, [10, 20, 30]);
    const undone = undoLast(g);
    expect(undone.called).toEqual([10, 20]);
    expect(remainingNumbers(undone)).toContain(30);
    expect(remainingNumbers(undone)).not.toContain(20);
    expect(remainingNumbers(undone)).toHaveLength(88);
  });
});

describe('C. Patterns', () => {
  const code = 'PATT2';
  const t = ticketOf(code);
  const nums = ticketNumbers(t);

  function completeSet(p: PatternId): number[] {
    return patternNumbers(t, p) ?? nums.slice(0, 5);
  }

  it('C1 every pattern validates when complete', () => {
    for (const p of PATTERN_IDS) {
      const called = completeSet(p);
      expect(evaluatePattern(t, called, p).complete, p).toBe(true);
      expect(checkClaim(newGame({}, called), p, code).kind, p).toBe('valid');
    }
  });

  it('C2 every pattern is rejected with one number missing, and the missing numbers are listed', () => {
    for (const p of PATTERN_IDS) {
      const needed = completeSet(p);
      const called = needed.slice(0, -1);
      const r = checkClaim(newGame({}, called), p, code);
      expect(r.kind, p).toBe('notYet');
      if (r.kind !== 'notYet') continue;
      if (p === 'earlyFive') {
        expect(r.stillNeeded).toBe(1); // "any five": there is no fixed missing number
      } else {
        expect(r.missing, p).toEqual([needed[needed.length - 1]]);
      }
    }
  });

  it('C3 Four Corners uses the first and last NUMBER of the top and bottom rows, skipping blanks', () => {
    // Top and bottom rows start and end with blank cells.
    const blanky = ticketFromRows([
      [0, 12, 0, 34, 0, 56, 0, 77, 0],
      [3, 0, 25, 0, 47, 0, 63, 0, 85],
      [0, 15, 0, 38, 0, 59, 0, 0, 0],
    ]);
    blanky[2][7] = 78;
    expect(patternNumbers(blanky, 'fourCorners')).toEqual([12, 77, 15, 78]);
    expect(evaluatePattern(blanky, [12, 77, 15, 78], 'fourCorners').complete).toBe(true);
    expect(evaluatePattern(blanky, [12, 77, 15], 'fourCorners').missing).toEqual([78]);
    // Generated tickets: corners are always real numbers.
    for (let i = 0; i < 1000; i++) {
      const g = generateTicket(`C3${i}`, 'ABCD5');
      expect(patternNumbers(g, 'fourCorners')!.every((n) => typeof n === 'number')).toBe(true);
    }
  });

  it('C4 disabled patterns cannot be claimed', () => {
    const g = newGame({ patterns: ['fullHouse'] }, topRow(t));
    expect(checkClaim(g, 'topLine', code).kind).toBe('patternOff');
  });
});

describe('D. Strict claim', () => {
  const code = 'STRC2';
  const t = ticketOf(code);
  const line = topRow(t);
  const others = notOn(t);

  it('D1 a new game has Strict claim ON by default', () => {
    expect(DEFAULT_SETTINGS.strictClaim).toBe(true);
    expect(createGame(GAME, DEFAULT_SETTINGS).settings.strictClaim).toBe(true);
    expect(migrateSettings(undefined).strictClaim).toBe(true);
  });

  it('D2 old saved settings are migrated to ON once; a later OFF is kept', () => {
    const migrated = migrateSettings({ strictClaim: false });
    expect(migrated.strictClaim).toBe(true);
    const later = JSON.parse(JSON.stringify({ ...migrated, strictClaim: false }));
    expect(settingsNeedMigration(later)).toBe(false);
    expect(migrateSettings(later).strictClaim).toBe(false);
  });

  it('D3 a pattern completed by the latest number is VALID', () => {
    expect(checkClaim(newGame({}, [others[0], ...line]), 'topLine', code).kind).toBe('valid');
  });

  it('D4 a pattern completed earlier is LATE, with the completing number and calls ago', () => {
    for (const extra of [1, 2, 5]) {
      const r = checkClaim(newGame({}, [...line, ...others.slice(0, extra)]), 'topLine', code);
      expect(r).toMatchObject({ kind: 'late', completedOn: line[4], callsAgo: extra });
    }
  });

  it('D5 Early Five under strict: valid only when the 5th ticket number is the latest call', () => {
    const five = ticketNumbers(t).slice(0, 5);
    expect(checkClaim(newGame({}, [others[0], ...five]), 'earlyFive', code).kind).toBe('valid');
    expect(checkClaim(newGame({}, [...five, others[0]]), 'earlyFive', code)).toMatchObject({
      kind: 'late',
      completedOn: five[4],
      callsAgo: 1,
    });
    // Four hits then a miss: still not complete.
    expect(checkClaim(newGame({}, [...five.slice(0, 4), others[0]]), 'earlyFive', code).kind).toBe('notYet');
  });

  it('D6 with Strict claim OFF a late claim is accepted', () => {
    const g = newGame({ strictClaim: false }, [...line, ...others.slice(0, 3)]);
    expect(checkClaim(g, 'topLine', code).kind).toBe('valid');
  });

  it('D7 (logic) a claim is judged at the call count when "Check a Claim" was pressed', () => {
    const g = newGame({}, [...line, others[0]]);
    expect(checkClaim(g, 'topLine', code, line.length).kind).toBe('valid');
    expect(checkClaim(g, 'topLine', code).kind).toBe('late');
  });

  /** Two tickets (different strips) whose top rows share a number. */
  function overlappingPair(): { a: string; b: string; shared: number } {
    const randomInt = testRandomInt(88);
    for (let i = 0; i < 5000; i++) {
      const a = randomTicketCode(randomInt);
      const b = randomTicketCode(randomInt);
      const shared = topRow(ticketOf(a)).find((n) => topRow(ticketOf(b)).includes(n));
      if (shared !== undefined && a.slice(0, 4) !== b.slice(0, 4)) return { a, b, shared };
    }
    throw new Error('no overlapping pair found');
  }

  it('D8 two valid claims on the same latest number: shared when enabled, second rejected otherwise', () => {
    const { a, b, shared } = overlappingPair();
    const rest = [...new Set([...topRow(ticketOf(a)), ...topRow(ticketOf(b))])].filter((n) => n !== shared);
    const called = [...rest, shared]; // Both lines complete on the same (latest) number.

    let g = newGame({ sharedWinners: true }, called);
    const first = checkClaim(g, 'topLine', a);
    expect(first).toMatchObject({ kind: 'valid', shared: false });
    g = recordWinner(g, 'topLine', a, 'A', false);
    const second = checkClaim(g, 'topLine', b);
    expect(second).toMatchObject({ kind: 'valid', shared: true });
    g = recordWinner(g, 'topLine', b, 'B', true);
    expect(patternState(g, 'topLine')).toBe('shared');
    expect(g.winners.map((w) => w.name)).toEqual(['A', 'B']);

    let solo = newGame({ sharedWinners: false }, called);
    solo = recordWinner(solo, 'topLine', a, 'A', false);
    expect(checkClaim(solo, 'topLine', b)).toMatchObject({ kind: 'alreadyWon' });
  });
});

describe('E. Claims and prizes', () => {
  const a = 'PRZA2';
  const b = 'PRZB3';

  it('E1 a pattern already won cannot be won again (without sharing)', () => {
    const called = [...new Set([...topRow(ticketOf(a)), ...topRow(ticketOf(b))])];
    let g = newGame({ strictClaim: false, sharedWinners: false }, called);
    g = recordWinner(g, 'topLine', a, 'A', false);
    expect(checkClaim(g, 'topLine', b).kind).toBe('alreadyWon');
  });

  it('E2 (logic) invalid ticket codes return a friendly result, never throw', () => {
    const g = newGame({}, [1, 2, 3]);
    for (const bad of ['', 'AB', 'ABCDEF', 'AB0DE', 'abcde', '!!!!!', 'ÄBCDE']) {
      expect(() => checkClaim(g, 'topLine', bad)).not.toThrow();
      expect(checkClaim(g, 'topLine', bad).kind).toBe('badCode');
    }
    expect(codeProblem(normalizeCode('ab-cd-e'), 5)).toBeNull();
  });

  it('E3 the same ticket cannot win the same pattern twice', () => {
    let g = newGame({ sharedWinners: true }, topRow(ticketOf(a)));
    g = recordWinner(g, 'topLine', a, 'A', false);
    expect(checkClaim(g, 'topLine', a).kind).toBe('duplicate');
  });
});

describe('H. Voice data', () => {
  it('H4 the traditional calls file has an entry for every number 1–90', () => {
    for (let n = 1; n <= 90; n++) expect(TRADITIONAL_CALLS[n]?.trim().length, String(n)).toBeGreaterThan(0);
    expect(TRADITIONAL_CALLS).toHaveLength(91);
  });
});
