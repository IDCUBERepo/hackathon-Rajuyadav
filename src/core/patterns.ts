import { ticketNumbers, type Ticket } from './ticket';

export type PatternId =
  | 'earlyFive'
  | 'topLine'
  | 'middleLine'
  | 'bottomLine'
  | 'fourCorners'
  | 'fullHouse';

export const PATTERN_IDS: readonly PatternId[] = [
  'earlyFive',
  'topLine',
  'middleLine',
  'bottomLine',
  'fourCorners',
  'fullHouse',
];

export const EARLY_FIVE_COUNT = 5;

type Called = ReadonlySet<number> | readonly number[];

function toSet(called: Called): ReadonlySet<number> {
  return called instanceof Set ? called : new Set(called as readonly number[]);
}

function rowNumbers(ticket: Ticket, row: number): number[] {
  return ticket[row].filter((c): c is number => c !== null);
}

/**
 * The exact numbers a pattern needs, or null for Early Five (where any five
 * of the ticket's numbers will do).
 */
export function patternNumbers(ticket: Ticket, pattern: PatternId): number[] | null {
  switch (pattern) {
    case 'earlyFive':
      return null;
    case 'topLine':
      return rowNumbers(ticket, 0);
    case 'middleLine':
      return rowNumbers(ticket, 1);
    case 'bottomLine':
      return rowNumbers(ticket, 2);
    case 'fourCorners': {
      const top = rowNumbers(ticket, 0);
      const bottom = rowNumbers(ticket, 2);
      return [top[0], top[top.length - 1], bottom[0], bottom[bottom.length - 1]];
    }
    case 'fullHouse':
      return ticketNumbers(ticket);
  }
}

export interface PatternEvaluation {
  complete: boolean;
  /** Ticket numbers that count towards the pattern and have been called. */
  matched: number[];
  /** Required numbers not yet called (empty for Early Five). */
  missing: number[];
  /** How many more numbers are needed (useful for Early Five). */
  stillNeeded: number;
}

export function evaluatePattern(
  ticket: Ticket,
  calledNumbers: Called,
  pattern: PatternId,
): PatternEvaluation {
  const called = toSet(calledNumbers);
  const required = patternNumbers(ticket, pattern);
  if (required === null) {
    const matched = ticketNumbers(ticket).filter((n) => called.has(n));
    const stillNeeded = Math.max(0, EARLY_FIVE_COUNT - matched.length);
    return { complete: stillNeeded === 0, matched, missing: [], stillNeeded };
  }
  const matched = required.filter((n) => called.has(n));
  const missing = required.filter((n) => !called.has(n));
  return { complete: missing.length === 0, matched, missing, stillNeeded: missing.length };
}

/** Pure check: is the pattern complete on this ticket given the called numbers? */
export function checkPattern(ticket: Ticket, calledNumbers: Called, pattern: PatternId): boolean {
  return evaluatePattern(ticket, calledNumbers, pattern).complete;
}

/**
 * Index in `calledInOrder` of the number that first completed the pattern,
 * or -1 if it is not complete. Used to tell a late claimant which number
 * finished their pattern and how long ago.
 */
export function completionIndex(ticket: Ticket, calledInOrder: readonly number[], pattern: PatternId): number {
  const required = patternNumbers(ticket, pattern);
  const onTicket = new Set(required ?? ticketNumbers(ticket));
  let hits = 0;
  const needed = required === null ? EARLY_FIVE_COUNT : onTicket.size;
  for (let i = 0; i < calledInOrder.length; i++) {
    if (onTicket.has(calledInOrder[i]) && ++hits === needed) return i;
  }
  return -1;
}

/**
 * For "strict claim": the pattern must be complete now and must NOT have been
 * complete before the most recent number was called.
 */
export function completedByLastCall(
  ticket: Ticket,
  calledInOrder: readonly number[],
  pattern: PatternId,
): boolean {
  if (calledInOrder.length === 0) return false;
  return (
    checkPattern(ticket, calledInOrder, pattern) &&
    !checkPattern(ticket, calledInOrder.slice(0, -1), pattern)
  );
}
