import type { CallStyle, VoiceLang, Winner } from './core/game';
import type { WinnerNews } from './core/results';
import { HINDI_NUMBERS, HINDI_PATTERNS, TRADITIONAL_CALLS } from './data/calls';
import { strings, t } from './i18n';

/**
 * The words spoken for a called number. Kept separate from speech.ts so the
 * wording is unit-testable without a browser.
 *
 * English: "Number 22 … 2, 2" (the speech engine reads digits naturally) or
 * the traditional call "Two little ducks … 22".
 * Hindi: number words, e.g. "नंबर बाईस … दो, दो". Traditional calls are
 * English rhymes, so Hindi always uses the plain style.
 */
export function numberAnnouncement(n: number, style: CallStyle, lang: VoiceLang, twice = false): string {
  const base = baseAnnouncement(n, style, lang);
  // Inclusive Mode says the number once more at the end: "Number 22 … 2, 2 … 22".
  if (!twice) return base;
  return `${base} … ${lang === 'hi' ? HINDI_NUMBERS[n] : n}`;
}

function baseAnnouncement(n: number, style: CallStyle, lang: VoiceLang): string {
  const digits = String(n).split('');
  if (lang === 'hi') {
    const word = HINDI_NUMBERS[n];
    if (digits.length === 1) return `नंबर ${word}`;
    return `नंबर ${word} … ${digits.map((d) => HINDI_NUMBERS[Number(d)] || 'शून्य').join(', ')}`;
  }
  if (style === 'traditional') return `${TRADITIONAL_CALLS[n]} … ${n}`;
  if (digits.length === 1) return `Number ${n} … only ${n}`;
  return `Number ${n} … ${digits.join(', ')}`;
}

export function winnerName(w: Winner): string {
  return w.name || t('anonymous', { code: w.ticketCode });
}

/** "Priya", "Priya and Rahul", "Priya, Rahul and Asha" (or with "और" in Hindi). */
export function joinNames(names: string[], lang: VoiceLang = 'en'): string {
  if (names.length <= 1) return names[0] ?? '';
  const list = names.slice(0, -1).join(', ');
  const last = names[names.length - 1];
  return lang === 'hi' ? `${list} और ${last}` : t('listAnd', { list, last });
}

/**
 * The sentence spoken (and announced to screen readers) when a claim is
 * confirmed, e.g. "Congratulations Priya, winner of Top Line, 100 points!" or
 * "Top Line is shared by Priya and Rahul, 50 points each!".
 */
export function winnerSpeech(news: WinnerNews, lang: VoiceLang): string {
  const names = news.winners.map(winnerName);
  const all = joinNames(names, lang);
  const p = news.points;
  if (lang === 'hi') {
    const pattern = HINDI_PATTERNS[news.pattern];
    switch (news.kind) {
      case 'single':
        return `बधाई हो ${names[0]}, ${pattern} के विजेता${p === null ? '' : `, ${p} अंक`}!`;
      case 'shared':
        return `${pattern} ${all} के बीच बँटा${p === null ? '' : `, हर एक को ${p} अंक`}!`;
      case 'tie':
        return `${pattern} में ${all} के बीच टाई! अब टाई-ब्रेकर होगा।`;
      case 'tieBreak':
        return `${pattern} का टाई-ब्रेकर ${names[0]} ने जीता${p === null ? '' : `, ${p} अंक`}!`;
    }
  }
  const pattern = strings.patterns[news.pattern];
  switch (news.kind) {
    case 'single':
      return p === null
        ? t('announceSingle', { name: names[0], pattern })
        : t('announceSinglePoints', { name: names[0], pattern, points: p });
    case 'shared':
      return p === null
        ? t('announceShared', { pattern, names: all })
        : t('announceSharedPoints', { pattern, names: all, points: p });
    case 'tie':
      return t('announceTie', { pattern, names: all });
    case 'tieBreak':
      return p === null
        ? t('announceTieBreak', { name: names[0], pattern })
        : t('announceTieBreakPoints', { name: names[0], pattern, points: p });
  }
}
