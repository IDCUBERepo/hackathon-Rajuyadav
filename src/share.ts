import { joinNames, winnerName } from './announce';
import { claimGroup, winnerPoints, winnersFor, type CallerGame, type Winner } from './core/game';
import { strings, t } from './i18n';

function describe(game: CallerGame, w: Winner): string {
  const extras: string[] = [];
  const points = winnerPoints(game, w);
  if (points !== null) extras.push(t('resultsPoints', { points }));
  if (w.tieBreak === 'won') extras.push(t('resultsWonDraw'));
  if (w.tieBreak === 'lost') extras.push(t('resultsLostDraw'));
  return extras.length ? `${winnerName(w)} (${extras.join(', ')})` : winnerName(w);
}

/**
 * Plain-text results for sharing in a chat, e.g.
 *
 *   Tambola Together — results
 *   Game ABCD · 26 September 2026
 *
 *   Early Five: Asha (20 points)
 *   Top Line: shared by Priya (50 points) and Rahul (50 points)
 *   Middle Line: no winner
 *
 *   Numbers called: 64 of 90
 */
export function resultsText(game: CallerGame): string {
  // Full month name: short forms differ between engines ("Sep" vs "Sept").
  const date = new Date(game.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = game.settings.patterns.map((p) => {
    const label = game.settings.prizes[p] ? `${strings.patterns[p]} (${game.settings.prizes[p]})` : strings.patterns[p];
    const winners = winnersFor(game, p);
    if (winners.length === 0) return `${label}: ${t('resultsNoWinner')}`;
    // One entry per number it was won on (a second Full House is a separate group).
    const groups = [...new Set(winners.map((w) => w.callCount))].map((callCount) => {
      const group = claimGroup(game, p, callCount).map((w) => describe(game, w));
      return group.length === 1 ? group[0] : t('resultsShared', { names: joinNames(group) });
    });
    return `${label}: ${groups.join('; ')}`;
  });
  return [
    t('resultsHeading'),
    t('resultsGame', { code: game.gameCode, date }),
    '',
    ...lines,
    '',
    t('resultsNumbers', { count: game.called.length }),
  ].join('\n');
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unavailable';

/** Share with the Web Share API when available, otherwise copy to the clipboard. */
export async function shareResults(text: string): Promise<ShareOutcome> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: t('shareTitle'), text });
      return 'shared';
    } catch (e) {
      // The user closed the share sheet: not an error. Anything else: try copying.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'unavailable';
  }
}
