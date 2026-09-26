import { secureRandomInt, type RandomInt } from './random';

/** Code alphabet without look-alike characters (no 0/O, 1/I/L). 31 characters. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const GAME_CODE_LENGTH = 4;
export const TICKET_CODE_LENGTH = 5;
export const STRIP_SIZE = 6;

export function randomCode(length: number, randomInt: RandomInt = secureRandomInt): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/*
 * Game codes carry one house rule so players' devices can show the right
 * reminder without a server: the last character's alphabet index is odd when
 * Strict claim is on and even when it is off. Settings cannot change once a
 * game has started, so the code always matches the caller's rules.
 */

export function createGameCode(strictClaim: boolean, randomInt: RandomInt = secureRandomInt): string {
  const options = [...CODE_ALPHABET].filter((_, i) => i % 2 === (strictClaim ? 1 : 0));
  return randomCode(GAME_CODE_LENGTH - 1, randomInt) + options[randomInt(options.length)];
}

export function isStrictGameCode(gameCode: string): boolean {
  return CODE_ALPHABET.indexOf(gameCode[GAME_CODE_LENGTH - 1]) % 2 === 1;
}

/** Uppercase and drop spaces, dashes and other separators people type. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type CodeProblem = 'empty' | 'length' | 'characters';

/** Format check only: there is no server to ask whether a game exists. */
export function codeProblem(code: string, length: number): CodeProblem | null {
  if (code.length === 0) return 'empty';
  if ([...code].some((c) => !CODE_ALPHABET.includes(c))) return 'characters';
  if (code.length !== length) return 'length';
  return null;
}

/*
 * Ticket codes: the first 4 characters identify a "strip" of 6 tickets and the
 * last character is the position in that strip: exactly one character per
 * position ("2" = 1st … "7" = 6th). So every valid code is a different ticket,
 * and a mistyped last character is caught as an invalid code instead of
 * silently pointing at another ticket. Phone and printed tickets work the same.
 */

export const POSITION_CHARS = '234567';

export function stripIdOf(ticketCode: string): string {
  return ticketCode.slice(0, TICKET_CODE_LENGTH - 1);
}

/** Position 0–5 in the strip, or -1 if the last character is not a position character. */
export function stripPositionOf(ticketCode: string): number {
  return POSITION_CHARS.indexOf(ticketCode[TICKET_CODE_LENGTH - 1] ?? '');
}

export type TicketCodeProblem = CodeProblem | 'position';

/** Format check for ticket codes: general code rules plus a valid position character. */
export function ticketCodeProblem(code: string): TicketCodeProblem | null {
  const problem = codeProblem(code, TICKET_CODE_LENGTH);
  if (problem) return problem;
  return stripPositionOf(code) === -1 ? 'position' : null;
}

function positionChar(position: number): string {
  return POSITION_CHARS[position];
}

/**
 * Ticket codes for one player: `count` distinct tickets from one random strip,
 * so a player with 6 tickets holds every number from 1 to 90 exactly once.
 */
export function playerTicketCodes(count: number, randomInt: RandomInt = secureRandomInt): string[] {
  if (!Number.isInteger(count) || count < 1 || count > STRIP_SIZE) {
    throw new RangeError(`Ticket count must be 1-${STRIP_SIZE}`);
  }
  const stripId = randomCode(TICKET_CODE_LENGTH - 1, randomInt);
  const positions = [0, 1, 2, 3, 4, 5];
  // Partial Fisher-Yates to pick `count` distinct positions at random.
  for (let i = 0; i < count; i++) {
    const j = i + randomInt(positions.length - i);
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  return positions
    .slice(0, count)
    .sort((a, b) => a - b)
    .map((p) => stripId + positionChar(p));
}

/** Six ticket codes for one printed sheet (a full strip), in strip order. */
export function stripTicketCodes(randomInt: RandomInt = secureRandomInt): string[] {
  const stripId = randomCode(TICKET_CODE_LENGTH - 1, randomInt);
  return [0, 1, 2, 3, 4, 5].map((p) => stripId + positionChar(p));
}

/** One random valid ticket code (used by tests and demos). */
export function randomTicketCode(randomInt: RandomInt = secureRandomInt): string {
  return randomCode(TICKET_CODE_LENGTH - 1, randomInt) + positionChar(randomInt(STRIP_SIZE));
}
