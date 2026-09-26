import { describe, expect, it } from 'vitest';
import {
  CODE_ALPHABET,
  codeProblem,
  normalizeCode,
  playerTicketCodes,
  randomCode,
  randomTicketCode,
  stripPositionOf,
  stripTicketCodes,
} from '../src/core/codes';
import { hashString, seededRng } from '../src/core/prng';
import { secureRandomInt } from '../src/core/random';
import { columnOf, columnRange, generateStrip, generateTicket, ticketNumbers } from '../src/core/ticket';
import { SAMPLE_TICKET, testRandomInt, ticketProblems } from './helpers';

describe('column ranges', () => {
  it('covers 1-90 with the standard column split', () => {
    expect(columnRange(0)).toEqual([1, 9]);
    expect(columnRange(1)).toEqual([10, 19]);
    expect(columnRange(7)).toEqual([70, 79]);
    expect(columnRange(8)).toEqual([80, 90]);
    for (let n = 1; n <= 90; n++) {
      const [lo, hi] = columnRange(columnOf(n));
      expect(n >= lo && n <= hi).toBe(true);
    }
  });

  it('accepts the hand-written sample ticket', () => {
    expect(ticketProblems(SAMPLE_TICKET)).toEqual([]);
  });
});

describe('ticket generation', () => {
  it('produces 10,000 tickets that all satisfy every rule', () => {
    const randomInt = testRandomInt(42);
    for (let i = 0; i < 10_000; i++) {
      const gameCode = randomCode(4, randomInt);
      const ticketCode = randomTicketCode(randomInt);
      const problems = ticketProblems(generateTicket(gameCode, ticketCode));
      if (problems.length) throw new Error(`${gameCode}/${ticketCode}: ${problems.join(', ')}`);
    }
  });

  it('is deterministic for the same game code and ticket code', () => {
    const randomInt = testRandomInt(7);
    for (let i = 0; i < 200; i++) {
      const gameCode = randomCode(4, randomInt);
      const ticketCode = randomTicketCode(randomInt);
      expect(generateTicket(gameCode, ticketCode)).toEqual(generateTicket(gameCode, ticketCode));
    }
  });

  it('gives different tickets for different game codes or ticket codes', () => {
    const a = generateTicket('ABCD', 'XYZ23');
    expect(generateTicket('ABCE', 'XYZ23')).not.toEqual(a);
    expect(generateTicket('ABCD', 'XYZ24')).not.toEqual(a);
  });

  it('keeps a known ticket stable across versions (golden value)', () => {
    // If this changes, previously issued tickets would no longer verify.
    // Last intentional change: ticket format v2 (one code per ticket, A5 fix).
    expect(hashString('tambola')).toMatchInlineSnapshot(`2842661287`);
    const golden = ticketNumbers(generateTicket('GAME', 'TQCK2'));
    expect(golden).toMatchInlineSnapshot(`
      [
        2,
        21,
        31,
        60,
        71,
        37,
        44,
        54,
        72,
        85,
        4,
        11,
        57,
        68,
        86,
      ]
    `);
  });
});

describe('strips', () => {
  it('contain every number from 1 to 90 exactly once, in valid tickets', () => {
    for (let i = 0; i < 2_000; i++) {
      const strip = generateStrip(`strip-test-${i}`);
      expect(strip).toHaveLength(6);
      const all = strip.flatMap(ticketNumbers).sort((a, b) => a - b);
      expect(all).toEqual(Array.from({ length: 90 }, (_, k) => k + 1));
      for (const t of strip) expect(ticketProblems(t)).toEqual([]);
    }
  });

  it('printed sheet codes rebuild the whole strip ticket by ticket', () => {
    const randomInt = testRandomInt(99);
    for (let i = 0; i < 100; i++) {
      const codes = stripTicketCodes(randomInt);
      expect(codes.map(stripPositionOf)).toEqual([0, 1, 2, 3, 4, 5]);
      const all = codes.flatMap((c) => ticketNumbers(generateTicket('PRNT', c))).sort((a, b) => a - b);
      expect(all).toEqual(Array.from({ length: 90 }, (_, k) => k + 1));
    }
  });
});

describe('codes', () => {
  it('uses an alphabet with no ambiguous characters', () => {
    for (const c of '0O1IL') expect(CODE_ALPHABET).not.toContain(c);
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length);
  });

  it('generates codes of the right length from the alphabet', () => {
    for (let i = 0; i < 500; i++) {
      const code = randomCode(4, secureRandomInt);
      expect(codeProblem(code, 4)).toBeNull();
    }
  });

  it('normalises and validates typed codes', () => {
    expect(normalizeCode(' ab-cd ')).toBe('ABCD');
    expect(codeProblem('', 4)).toBe('empty');
    expect(codeProblem('ABC', 4)).toBe('length');
    expect(codeProblem('AB0D', 4)).toBe('characters');
    expect(codeProblem('ABID', 4)).toBe('characters');
    expect(codeProblem('AB2D', 4)).toBeNull();
  });

  it('gives a player distinct tickets from one strip', () => {
    const randomInt = testRandomInt(5);
    for (let count = 1; count <= 6; count++) {
      const codes = playerTicketCodes(count, randomInt);
      expect(codes).toHaveLength(count);
      expect(new Set(codes.map((c) => c.slice(0, 4))).size).toBe(1);
      expect(new Set(codes.map(stripPositionOf)).size).toBe(count);
      for (const c of codes) expect(codeProblem(c, 5)).toBeNull();
    }
    expect(() => playerTicketCodes(0)).toThrow();
    expect(() => playerTicketCodes(7)).toThrow();
  });

  it('secureRandomInt stays in range and covers every value', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const x = secureRandomInt(10);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(10);
      seen.add(x);
    }
    expect(seen.size).toBe(10);
    expect(() => secureRandomInt(0)).toThrow();
  });

  it('seeded RNG is reproducible', () => {
    const a = seededRng('x');
    const b = seededRng('x');
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });
});
