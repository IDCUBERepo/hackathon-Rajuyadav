import { randomTicketCode } from '../src/core/codes';
import { mulberry32, rngInt } from '../src/core/prng';
import type { RandomInt } from '../src/core/random';
import { columnRange, COLS, generateTicket, ROWS, type Ticket } from '../src/core/ticket';

/** Deterministic RandomInt for tests. */
export function testRandomInt(seed: number): RandomInt {
  const rng = mulberry32(seed);
  return (n) => rngInt(rng, n);
}

/** Every rule a valid Tambola ticket must satisfy; returns human-readable problems. */
export function ticketProblems(ticket: Ticket): string[] {
  const problems: string[] = [];
  if (ticket.length !== ROWS) problems.push(`expected ${ROWS} rows`);
  ticket.forEach((row, r) => {
    if (row.length !== COLS) problems.push(`row ${r} has ${row.length} columns`);
    const count = row.filter((c) => c !== null).length;
    if (count !== 5) problems.push(`row ${r} has ${count} numbers`);
  });
  const seen = new Set<number>();
  for (let c = 0; c < COLS; c++) {
    const [lo, hi] = columnRange(c);
    const col = ticket.map((row) => row[c]).filter((n): n is number => n !== null);
    if (col.length < 1 || col.length > 3) problems.push(`column ${c} has ${col.length} numbers`);
    col.forEach((n, i) => {
      if (!Number.isInteger(n) || n < lo || n > hi) problems.push(`${n} out of range in column ${c}`);
      if (i > 0 && col[i - 1] >= n) problems.push(`column ${c} not ascending`);
      if (seen.has(n)) problems.push(`duplicate ${n}`);
      seen.add(n);
    });
  }
  if (seen.size !== 15) problems.push(`ticket has ${seen.size} numbers`);
  return problems;
}

/**
 * Find `count` tickets (from different strips) that all complete `pattern` on
 * the same number, and a called-number order in which that shared number is
 * called last - i.e. a genuine tie on the latest number.
 */
export function findTie(
  gameCode: string,
  count: number,
  pattern: 'topLine' | 'fullHouse',
  seed = 1,
): { codes: string[]; number: number; called: number[] } {
  const numbersOf = (code: string) => {
    const t = generateTicket(gameCode, code);
    return (pattern === 'topLine' ? t[0] : t.flat()).filter((n): n is number => n !== null);
  };
  const randomInt = testRandomInt(seed);
  for (let target = 45; target <= 90; target++) {
    const codes: string[] = [];
    const strips = new Set<string>();
    for (let i = 0; i < 3000 && codes.length < count; i++) {
      const code = randomTicketCode(randomInt);
      if (!strips.has(code.slice(0, 4)) && numbersOf(code).includes(target)) {
        codes.push(code);
        strips.add(code.slice(0, 4));
      }
    }
    if (codes.length === count) {
      const rest = [...new Set(codes.flatMap(numbersOf))].filter((n) => n !== target);
      return { codes, number: target, called: [...rest, target] };
    }
  }
  throw new Error('No tie found');
}

/** Build a ticket from three rows written as arrays of 9 (0 = blank). */
export function ticketFromRows(rows: number[][]): Ticket {
  return rows.map((row) => row.map((n) => (n === 0 ? null : n)));
}

// A fixed, valid ticket used by pattern tests.
export const SAMPLE_TICKET = ticketFromRows([
  [4, 0, 23, 0, 45, 0, 61, 0, 82],
  [0, 12, 0, 34, 0, 56, 0, 77, 88],
  [7, 0, 29, 0, 49, 0, 0, 79, 90],
]);
