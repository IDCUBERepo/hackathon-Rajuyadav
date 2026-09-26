import { stripIdOf, stripPositionOf, STRIP_SIZE, ticketCodeProblem } from './codes';
import { seededRng, shuffle, type Rng } from './prng';

/** A cell holds a number or is blank. */
export type Cell = number | null;
/** 3 rows × 9 columns. */
export type Ticket = Cell[][];

export const ROWS = 3;
export const COLS = 9;
export const NUMBERS_PER_ROW = 5;
export const NUMBERS_PER_TICKET = ROWS * NUMBERS_PER_ROW;

/** Inclusive number range for a column: 1–9, 10–19, …, 70–79, 80–90. */
export function columnRange(col: number): [number, number] {
  if (col === 0) return [1, 9];
  if (col === COLS - 1) return [80, 90];
  return [col * 10, col * 10 + 9];
}

export function columnOf(n: number): number {
  return Math.min(Math.floor(n / 10), COLS - 1);
}

export function ticketNumbers(ticket: Ticket): number[] {
  return ticket.flat().filter((c): c is number => c !== null);
}

/** How many numbers each column contributes across a full strip (sums to 90). */
const STRIP_COLUMN_TOTALS = [9, 10, 10, 10, 10, 10, 10, 10, 11];
const MAX_PER_COLUMN = 3;

/**
 * Decide how many numbers each of the 6 tickets gets in each column so that
 * every ticket has 15 numbers, every ticket column has 1–3 numbers, and the
 * column totals across the strip match STRIP_COLUMN_TOTALS.
 *
 * Every cell starts at 1; the remaining 36 "extra" numbers are handed out
 * greedily to the ticket with the most room left (random tie-break). The
 * greedy can occasionally paint itself into a corner, so it retries with the
 * same RNG stream - still fully deterministic for a given seed.
 */
function stripColumnCounts(rng: Rng): number[][] {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const counts = Array.from({ length: STRIP_SIZE }, () => Array<number>(COLS).fill(1));
    const room = Array<number>(STRIP_SIZE).fill(NUMBERS_PER_TICKET - COLS);
    const columns = shuffle([...Array(COLS).keys()], rng).sort(
      (a, b) => STRIP_COLUMN_TOTALS[b] - STRIP_COLUMN_TOTALS[a],
    );
    let ok = true;
    for (const col of columns) {
      for (let k = STRIP_COLUMN_TOTALS[col] - STRIP_SIZE; k > 0 && ok; k--) {
        const candidates = shuffle([...Array(STRIP_SIZE).keys()], rng)
          .filter((t) => counts[t][col] < MAX_PER_COLUMN && room[t] > 0)
          .sort((a, b) => room[b] - room[a]);
        if (candidates.length === 0) {
          ok = false;
          break;
        }
        const t = candidates[0];
        counts[t][col]++;
        room[t]--;
      }
      if (!ok) break;
    }
    if (ok) return counts;
  }
  throw new Error('Could not build strip column counts');
}

/**
 * Choose which rows are filled in each column so every row gets exactly 5.
 * Columns are processed from most to fewest numbers, each placing its cells in
 * the rows with the most room left (the Gale–Ryser construction), which always
 * succeeds for column counts of 1–3 summing to 15.
 */
function layoutRows(columnCounts: number[], rng: Rng): boolean[][] {
  const layout = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));
  const room = Array<number>(ROWS).fill(NUMBERS_PER_ROW);
  const columns = shuffle([...Array(COLS).keys()], rng).sort(
    (a, b) => columnCounts[b] - columnCounts[a],
  );
  for (const col of columns) {
    const rows = shuffle([0, 1, 2], rng).sort((a, b) => room[b] - room[a]);
    for (const r of rows.slice(0, columnCounts[col])) {
      if (room[r] <= 0) throw new Error('Row layout failed');
      layout[r][col] = true;
      room[r]--;
    }
  }
  return layout;
}

/** A strip of 6 valid tickets that together contain 1–90 exactly once. */
export function generateStrip(seed: string): Ticket[] {
  const rng = seededRng(seed);
  const counts = stripColumnCounts(rng);
  const tickets: Ticket[] = Array.from({ length: STRIP_SIZE }, () =>
    Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null)),
  );

  const columnNumbers: number[][][] = tickets.map(() => []);
  for (let col = 0; col < COLS; col++) {
    const [lo, hi] = columnRange(col);
    const pool = shuffle(
      Array.from({ length: hi - lo + 1 }, (_, i) => lo + i),
      rng,
    );
    let next = 0;
    for (let t = 0; t < STRIP_SIZE; t++) {
      columnNumbers[t][col] = pool.slice(next, next + counts[t][col]).sort((a, b) => a - b);
      next += counts[t][col];
    }
  }

  for (let t = 0; t < STRIP_SIZE; t++) {
    const layout = layoutRows(counts[t], rng);
    for (let col = 0; col < COLS; col++) {
      const nums = columnNumbers[t][col];
      let i = 0;
      // Fill top to bottom so each column reads in ascending order.
      for (let r = 0; r < ROWS; r++) {
        if (layout[r][col]) tickets[t][r][col] = nums[i++];
      }
    }
  }
  return tickets;
}

/**
 * Seed string shared by the ticket generator on every device.
 * v2: ticket codes end in a position character 2–7 (one code per ticket).
 */
export function stripSeed(gameCode: string, stripId: string): string {
  return `tambola-together:v2:${gameCode}:${stripId}`;
}

/** Rebuild a ticket from the game code and its 5-character ticket code. */
export function generateTicket(gameCode: string, ticketCode: string): Ticket {
  const problem = ticketCodeProblem(ticketCode);
  if (problem) throw new RangeError(`Invalid ticket code "${ticketCode}" (${problem})`);
  const strip = generateStrip(stripSeed(gameCode, stripIdOf(ticketCode)));
  return strip[stripPositionOf(ticketCode)];
}
