import { claimGroup, winnerPoints, type CallerGame, type Winner } from './game';
import type { PatternId } from './patterns';

/**
 * What just happened for a pattern on one number, for announcements and the
 * winner banner:
 *   single   – one winner
 *   shared   – several winners share it (split or full prize)
 *   tie      – several winners, tie-breaker draw still to come
 *   tieBreak – the tie-breaker draw picked this winner
 * `points` is per person (null when the pattern has no points).
 */
export interface WinnerNews {
  kind: 'single' | 'shared' | 'tie' | 'tieBreak';
  pattern: PatternId;
  winners: Winner[];
  points: number | null;
}

export function winnerNews(game: CallerGame, pattern: PatternId, callCount: number): WinnerNews | null {
  const group = claimGroup(game, pattern, callCount);
  if (group.length === 0) return null;
  const drawn = group.find((w) => w.tieBreak === 'won');
  if (drawn) return { kind: 'tieBreak', pattern, winners: [drawn], points: winnerPoints(game, drawn) };
  if (group.length === 1) return { kind: 'single', pattern, winners: group, points: winnerPoints(game, group[0]) };
  if (game.settings.tieMode === 'draw') return { kind: 'tie', pattern, winners: group, points: null };
  return { kind: 'shared', pattern, winners: group, points: winnerPoints(game, group[0]) };
}

/** Stable identity for a winner, used to spot new winners after syncing. */
export function winnerKey(w: Winner): string {
  return `${w.pattern}:${w.ticketCode}:${w.callCount}:${w.tieBreak ?? ''}`;
}

/** News for every group that is new (or newly decided) in `next` compared with `previous`. */
export function newWinnerNews(previous: CallerGame | null, next: CallerGame): WinnerNews[] {
  const seen = new Set((previous?.winners ?? []).map(winnerKey));
  const groups = new Map<string, WinnerNews>();
  for (const w of next.winners) {
    if (seen.has(winnerKey(w))) continue;
    const key = `${w.pattern}:${w.callCount}`;
    if (!groups.has(key)) {
      const news = winnerNews(next, w.pattern, w.callCount);
      if (news) groups.set(key, news);
    }
  }
  return [...groups.values()];
}
