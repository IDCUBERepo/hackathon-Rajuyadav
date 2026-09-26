import { describe, expect, it } from 'vitest';
import { createGame, DEFAULT_SETTINGS, parseCallerGame } from '../src/core/game';
import {
  buildTickets,
  createPlayerGame,
  markHeardNumber,
  parsePlayerGame,
  possiblePatterns,
  toggleMark,
} from '../src/core/player';
import { ticketNumbers } from '../src/core/ticket';

describe('parseCallerGame', () => {
  it('round-trips a saved game through JSON', () => {
    const g = { ...createGame('ABCD', DEFAULT_SETTINGS, 1), called: [3, 70] };
    expect(parseCallerGame(JSON.parse(JSON.stringify(g)))).toEqual(g);
  });

  it('rejects corrupted data', () => {
    expect(parseCallerGame(null)).toBeNull();
    expect(parseCallerGame('x')).toBeNull();
    expect(parseCallerGame({ version: 2 })).toBeNull();
    const g = createGame('ABCD', DEFAULT_SETTINGS, 1);
    expect(parseCallerGame({ ...g, called: [1, 1] })).toBeNull();
    expect(parseCallerGame({ ...g, called: [91] })).toBeNull();
    expect(parseCallerGame({ ...g, winners: [{ pattern: 'nope' }] })).toBeNull();
  });

  it('fills in missing settings from defaults', () => {
    const g = createGame('ABCD', DEFAULT_SETTINGS, 1);
    const parsed = parseCallerGame({ ...g, settings: { voice: false } });
    expect(parsed?.settings).toEqual({ ...DEFAULT_SETTINGS, voice: false });
  });
});

describe('player state', () => {
  const player = createPlayerGame('ABCD', 'Meera', ['TKT22', 'TKT23']);
  const tickets = buildTickets(player);
  const first = ticketNumbers(tickets.get('TKT22')!);

  it('toggles marks on and off', () => {
    const once = toggleMark(player, 'TKT22', first[0]);
    expect(once.marks.TKT22).toEqual([first[0]]);
    expect(toggleMark(once, 'TKT22', first[0]).marks.TKT22).toEqual([]);
  });

  it('marking helper marks a heard number or says it is not there', () => {
    const r = markHeardNumber(player, tickets, first[0]);
    expect(r.result.kind).toBe('marked');
    expect(r.game.marks.TKT22).toContain(first[0]);
    expect(markHeardNumber(r.game, tickets, first[0]).result.kind).toBe('already');

    const all = new Set([...first, ...ticketNumbers(tickets.get('TKT23')!)]);
    const absent = Array.from({ length: 90 }, (_, i) => i + 1).find((n) => !all.has(n))!;
    expect(markHeardNumber(player, tickets, absent).result.kind).toBe('notOnTicket');
  });

  it('pattern hints only look at the player’s own marks', () => {
    expect(possiblePatterns(player, tickets)).toEqual([]);
    let p = player;
    for (const n of first.slice(0, 5)) p = toggleMark(p, 'TKT22', n);
    expect(possiblePatterns(p, tickets)).toContainEqual({ ticketCode: 'TKT22', pattern: 'earlyFive' });
  });

  it('round-trips and validates saved player data', () => {
    expect(parsePlayerGame(JSON.parse(JSON.stringify(player)))).toEqual(player);
    expect(parsePlayerGame({ ...player, gameCode: 'AB' })).toBeNull();
    expect(parsePlayerGame({ ...player, ticketCodes: [] })).toBeNull();
    expect(parsePlayerGame({ ...player, marks: { TKT22: [5, 999] } })?.marks).toEqual({
      TKT22: [5],
      TKT23: [],
    });
  });
});
