import { codeProblem, GAME_CODE_LENGTH, ticketCodeProblem } from './codes';
import { checkPattern, PATTERN_IDS, type PatternId } from './patterns';
import { generateTicket, ticketNumbers, type Ticket } from './ticket';

/** Everything a player's device remembers about one game. */
export interface PlayerGame {
  version: 1;
  gameCode: string;
  name: string;
  ticketCodes: string[];
  /** Marked numbers per ticket code. */
  marks: Record<string, number[]>;
  helper: boolean;
  hints: boolean;
}

export function createPlayerGame(gameCode: string, name: string, ticketCodes: string[]): PlayerGame {
  const marks: Record<string, number[]> = {};
  for (const code of ticketCodes) marks[code] = [];
  return { version: 1, gameCode, name, ticketCodes, marks, helper: false, hints: false };
}

export function toggleMark(game: PlayerGame, ticketCode: string, n: number): PlayerGame {
  const current = game.marks[ticketCode] ?? [];
  const next = current.includes(n) ? current.filter((m) => m !== n) : [...current, n];
  return { ...game, marks: { ...game.marks, [ticketCode]: next } };
}

export type HelperResult =
  | { kind: 'marked'; tickets: string[] }
  | { kind: 'already' }
  | { kind: 'notOnTicket' };

/**
 * Marking helper: mark `n` on every ticket that has it. Never unmarks,
 * so typing a number twice is harmless.
 */
export function markHeardNumber(
  game: PlayerGame,
  tickets: ReadonlyMap<string, Ticket>,
  n: number,
): { game: PlayerGame; result: HelperResult } {
  const holders = game.ticketCodes.filter((code) => ticketNumbers(tickets.get(code)!).includes(n));
  if (holders.length === 0) return { game, result: { kind: 'notOnTicket' } };
  const toMark = holders.filter((code) => !(game.marks[code] ?? []).includes(n));
  if (toMark.length === 0) return { game, result: { kind: 'already' } };
  let next = game;
  for (const code of toMark) next = toggleMark(next, code, n);
  return { game: next, result: { kind: 'marked', tickets: toMark } };
}

/**
 * Pattern hints use only the player's own marks. They never claim anything
 * and cannot know which numbers were really called.
 */
export function possiblePatterns(
  game: PlayerGame,
  tickets: ReadonlyMap<string, Ticket>,
): { ticketCode: string; pattern: PatternId }[] {
  const found: { ticketCode: string; pattern: PatternId }[] = [];
  for (const code of game.ticketCodes) {
    const marks = game.marks[code] ?? [];
    for (const pattern of PATTERN_IDS) {
      if (checkPattern(tickets.get(code)!, marks, pattern)) found.push({ ticketCode: code, pattern });
    }
  }
  return found;
}

export function buildTickets(game: PlayerGame): Map<string, Ticket> {
  return new Map(game.ticketCodes.map((code) => [code, generateTicket(game.gameCode, code)]));
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function parsePlayerGame(value: unknown): PlayerGame | null {
  if (!isObject(value) || value.version !== 1) return null;
  const { gameCode, name, ticketCodes, marks } = value;
  if (typeof gameCode !== 'string' || codeProblem(gameCode, GAME_CODE_LENGTH) !== null) return null;
  if (typeof name !== 'string' || !Array.isArray(ticketCodes) || ticketCodes.length === 0) return null;
  if (!ticketCodes.every((c) => typeof c === 'string' && ticketCodeProblem(c) === null)) {
    return null;
  }
  const cleanMarks: Record<string, number[]> = {};
  for (const code of ticketCodes as string[]) {
    const m = isObject(marks) ? marks[code] : undefined;
    cleanMarks[code] = Array.isArray(m) ? m.filter((n) => Number.isInteger(n) && n >= 1 && n <= 90) : [];
  }
  return {
    version: 1,
    gameCode,
    name,
    ticketCodes: ticketCodes as string[],
    marks: cleanMarks,
    helper: value.helper === true,
    hints: value.hints === true,
  };
}
