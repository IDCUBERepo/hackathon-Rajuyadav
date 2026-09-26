import { describe, expect, it } from 'vitest';
import { joinNames, winnerSpeech } from '../src/announce';
import { closeClaimWindow, createGame, DEFAULT_SETTINGS, type CallerGame, type GameSettings, type Winner } from '../src/core/game';
import type { PatternId } from '../src/core/patterns';
import { newWinnerNews, winnerNews, type WinnerNews } from '../src/core/results';
import { resultsText } from '../src/share';

const w = (name: string, pattern: PatternId = 'topLine', callCount = 20, extra: Partial<Winner> = {}): Winner => ({
  pattern,
  name,
  ticketCode: `${name.slice(0, 4).toUpperCase().padEnd(4, 'X')}2`,
  callCount,
  shared: false,
  ...extra,
});

function game(settings: Partial<GameSettings>, winners: Winner[], called = 20): CallerGame {
  return {
    ...createGame('ABCD', { ...DEFAULT_SETTINGS, ...settings }, Date.UTC(2026, 8, 26, 12)),
    called: Array.from({ length: called }, (_, i) => i + 1),
    winners,
  };
}

const news = (kind: WinnerNews['kind'], names: string[], points: number | null): WinnerNews => ({
  kind,
  pattern: 'topLine',
  winners: names.map((n) => w(n)),
  points,
});

describe('winner announcement (voice + aria-live)', () => {
  it('single winner, with and without points', () => {
    expect(winnerSpeech(news('single', ['Priya'], 100), 'en')).toBe('Congratulations Priya, winner of Top Line, 100 points!');
    expect(winnerSpeech(news('single', ['Priya'], null), 'en')).toBe('Congratulations Priya, winner of Top Line!');
  });

  it('shared win, with points each', () => {
    expect(winnerSpeech(news('shared', ['Priya', 'Rahul'], 50), 'en')).toBe('Top Line is shared by Priya and Rahul, 50 points each!');
    expect(winnerSpeech(news('shared', ['Priya', 'Rahul', 'Asha'], 33), 'en')).toBe(
      'Top Line is shared by Priya, Rahul and Asha, 33 points each!',
    );
    expect(winnerSpeech(news('shared', ['Priya', 'Rahul'], null), 'en')).toBe('Top Line is shared by Priya and Rahul!');
  });

  it('tie waiting for the draw, and the tie-breaker result', () => {
    expect(winnerSpeech(news('tie', ['Priya', 'Rahul'], null), 'en')).toBe(
      'It’s a tie for Top Line between Priya and Rahul! The tie-breaker draw is next.',
    );
    expect(winnerSpeech(news('tieBreak', ['Rahul'], 100), 'en')).toBe('Rahul wins the tie-breaker for Top Line, 100 points!');
  });

  it('speaks Hindi when Hindi is the voice language', () => {
    expect(winnerSpeech(news('single', ['Priya'], 100), 'hi')).toBe('बधाई हो Priya, टॉप लाइन के विजेता, 100 अंक!');
    expect(winnerSpeech(news('shared', ['Priya', 'Rahul'], 50), 'hi')).toBe('टॉप लाइन Priya और Rahul के बीच बँटा, हर एक को 50 अंक!');
  });

  it('uses the ticket code when no name was given', () => {
    const n: WinnerNews = { kind: 'single', pattern: 'fullHouse', winners: [{ ...w(''), ticketCode: 'KMN22' }], points: null };
    expect(winnerSpeech(n, 'en')).toBe('Congratulations Ticket KMN22, winner of Full House!');
  });

  it('joins names naturally', () => {
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A and B');
    expect(joinNames(['A', 'B', 'C', 'D'])).toBe('A, B, C and D');
  });
});

describe('winnerNews', () => {
  it('reports single, shared (per-person points), tie and tie-breaker results', () => {
    const one = game({ points: { topLine: 100 } }, [w('Priya')]);
    expect(winnerNews(one, 'topLine', 20)).toMatchObject({ kind: 'single', points: 100 });

    const two = game({ points: { topLine: 100 } }, [w('Priya'), w('Rahul', 'topLine', 20, { shared: true })]);
    expect(winnerNews(two, 'topLine', 20)).toMatchObject({ kind: 'shared', points: 50 });

    const tie = game({ points: { topLine: 100 }, tieMode: 'draw' }, two.winners);
    expect(winnerNews(tie, 'topLine', 20)).toMatchObject({ kind: 'tie', points: null });
    const drawn = closeClaimWindow(tie, 'topLine', () => 1).game;
    const n = winnerNews(drawn, 'topLine', 20)!;
    expect(n.kind).toBe('tieBreak');
    expect(n.winners.map((x) => x.name)).toEqual(['Rahul']);
    expect(n.points).toBe(100);

    expect(winnerNews(one, 'middleLine', 20)).toBeNull();
  });

  it('finds what is new after syncing from another tab', () => {
    const before = game({}, [w('Priya')]);
    const after = game({}, [w('Priya'), w('Rahul', 'topLine', 20, { shared: true }), w('Asha', 'earlyFive', 20)]);
    const fresh = newWinnerNews(before, after);
    expect(fresh.map((x) => [x.pattern, x.kind])).toEqual([
      ['topLine', 'shared'],
      ['earlyFive', 'single'],
    ]);
    expect(newWinnerNews(after, after)).toEqual([]);
  });
});

describe('share text', () => {
  it('lists every pattern: single, shared and no-winner, with points, date and numbers called', () => {
    const g = game(
      { points: { earlyFive: 20, topLine: 100 }, prizes: { fullHouse: '₹500' } },
      [w('Asha', 'earlyFive', 12), w('Priya', 'topLine', 30), w('Rahul', 'topLine', 30, { shared: true })],
      64,
    );
    expect(resultsText(g)).toBe(
      [
        'Tambola Together — results',
        'Game ABCD · 26 September 2026',
        '',
        'Early Five: Asha (20 points)',
        'Top Line: shared by Priya (50 points) and Rahul (50 points)',
        'Middle Line: no winner',
        'Bottom Line: no winner',
        'Four Corners: no winner',
        'Full House (₹500): no winner',
        '',
        'Numbers called: 64 of 90',
      ].join('\n'),
    );
  });

  it('shows winners without points when no points were set', () => {
    const g = game({ patterns: ['topLine'] }, [w('Priya')]);
    expect(resultsText(g).split('\n')[3]).toBe('Top Line: Priya');
  });

  it('shows the tie-breaker outcome', () => {
    const tie = game({ patterns: ['topLine'], tieMode: 'draw', points: { topLine: 100 } }, [w('Priya'), w('Rahul', 'topLine', 20, { shared: true })]);
    const drawn = closeClaimWindow(tie, 'topLine', () => 0).game;
    expect(resultsText(drawn).split('\n')[3]).toBe(
      'Top Line: shared by Priya (100 points, won the tie-breaker) and Rahul (0 points, tied, lost the draw)',
    );
  });

  it('lists a second Full House separately', () => {
    const g = game({ patterns: ['fullHouse'], secondFullHouse: true }, [w('Priya', 'fullHouse', 70), w('Rahul', 'fullHouse', 74)]);
    expect(resultsText(g).split('\n')[3]).toBe('Full House: Priya; Rahul');
  });

  it('a game with no winners at all', () => {
    const g = game({ patterns: ['topLine', 'fullHouse'] }, [], 0);
    expect(resultsText(g).split('\n').slice(3)).toEqual(['Top Line: no winner', 'Full House: no winner', '', 'Numbers called: 0 of 90']);
  });
});
