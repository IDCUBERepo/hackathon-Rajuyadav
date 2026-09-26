import { describe, expect, it } from 'vitest';
import {
  checkPattern,
  completedByLastCall,
  evaluatePattern,
  patternNumbers,
} from '../src/core/patterns';
import { ticketNumbers } from '../src/core/ticket';
import { SAMPLE_TICKET as T } from './helpers';

// Rows of the sample ticket:
// top:    4 23 45 61 82
// middle: 12 34 56 77 88
// bottom: 7 29 49 79 90
const TOP = [4, 23, 45, 61, 82];
const MIDDLE = [12, 34, 56, 77, 88];
const BOTTOM = [7, 29, 49, 79, 90];

describe('patternNumbers', () => {
  it('returns the right cells for each pattern', () => {
    expect(patternNumbers(T, 'topLine')).toEqual(TOP);
    expect(patternNumbers(T, 'middleLine')).toEqual(MIDDLE);
    expect(patternNumbers(T, 'bottomLine')).toEqual(BOTTOM);
    expect(patternNumbers(T, 'fourCorners')).toEqual([4, 82, 7, 90]);
    expect(patternNumbers(T, 'fullHouse')?.sort((a, b) => a - b)).toEqual(
      ticketNumbers(T).sort((a, b) => a - b),
    );
    expect(patternNumbers(T, 'earlyFive')).toBeNull();
  });
});

describe('checkPattern', () => {
  it('nothing is complete with no numbers called', () => {
    for (const p of ['earlyFive', 'topLine', 'middleLine', 'bottomLine', 'fourCorners', 'fullHouse'] as const) {
      expect(checkPattern(T, [], p)).toBe(false);
    }
  });

  it('Early Five needs any five ticket numbers', () => {
    expect(checkPattern(T, [4, 12, 29, 61], 'earlyFive')).toBe(false);
    expect(checkPattern(T, [4, 12, 29, 61, 90], 'earlyFive')).toBe(true);
    // Numbers not on the ticket do not count.
    expect(checkPattern(T, [4, 12, 29, 61, 1, 2, 3, 5, 6], 'earlyFive')).toBe(false);
  });

  it('lines need all five numbers of that row only', () => {
    expect(checkPattern(T, TOP, 'topLine')).toBe(true);
    expect(checkPattern(T, TOP.slice(0, 4), 'topLine')).toBe(false);
    expect(checkPattern(T, TOP, 'middleLine')).toBe(false);
    expect(checkPattern(T, MIDDLE, 'middleLine')).toBe(true);
    expect(checkPattern(T, BOTTOM, 'bottomLine')).toBe(true);
    expect(checkPattern(T, [...TOP, ...MIDDLE], 'bottomLine')).toBe(false);
  });

  it('Four Corners uses the first and last numbers of the top and bottom rows', () => {
    expect(checkPattern(T, [4, 82, 7, 90], 'fourCorners')).toBe(true);
    expect(checkPattern(T, [4, 82, 7], 'fourCorners')).toBe(false);
    // Middle-row numbers are not corners.
    expect(checkPattern(T, [12, 88, 7, 90], 'fourCorners')).toBe(false);
  });

  it('Full House needs all 15 numbers', () => {
    const all = ticketNumbers(T);
    expect(checkPattern(T, all, 'fullHouse')).toBe(true);
    expect(checkPattern(T, all.slice(1), 'fullHouse')).toBe(false);
    expect(checkPattern(T, [...all, 1, 2, 3], 'fullHouse')).toBe(true);
  });

  it('accepts a Set as well as an array', () => {
    expect(checkPattern(T, new Set(TOP), 'topLine')).toBe(true);
  });
});

describe('evaluatePattern', () => {
  it('reports missing numbers for fixed patterns', () => {
    const e = evaluatePattern(T, [4, 23, 99], 'topLine');
    expect(e.complete).toBe(false);
    expect(e.missing).toEqual([45, 61, 82]);
    expect(e.matched).toEqual([4, 23]);
    expect(e.stillNeeded).toBe(3);
  });

  it('reports how many more are needed for Early Five', () => {
    const e = evaluatePattern(T, [4, 12], 'earlyFive');
    expect(e.complete).toBe(false);
    expect(e.stillNeeded).toBe(3);
    expect(e.missing).toEqual([]);
  });
});

describe('completedByLastCall (strict claim)', () => {
  it('is true only when the last number completed the pattern', () => {
    expect(completedByLastCall(T, [1, 4, 23, 45, 61, 82], 'topLine')).toBe(true);
    // Completed earlier, then another number was called.
    expect(completedByLastCall(T, [4, 23, 45, 61, 82, 1], 'topLine')).toBe(false);
    expect(completedByLastCall(T, [], 'topLine')).toBe(false);
  });

  it('works for Early Five where the fifth hit must be the last call', () => {
    expect(completedByLastCall(T, [4, 12, 29, 61, 90], 'earlyFive')).toBe(true);
    expect(completedByLastCall(T, [4, 12, 29, 61, 90, 7], 'earlyFive')).toBe(false);
  });
});
