import { joinNames, winnerName, winnerSpeech } from '../announce';
import type { WinnerNews } from '../core/results';
import { strings, t } from '../i18n';
import { celebrate } from './confetti';
import { announce, h, icon } from './dom';

/** How long the banner stays up unless the caller taps Continue. */
export const BANNER_MS = 6000;

let active: { el: HTMLElement; timer: number } | null = null;

export function hideWinnerBanner(): void {
  if (!active) return;
  window.clearTimeout(active.timer);
  const hadFocus = active.el.contains(document.activeElement);
  const host = active.el.parentElement;
  active.el.remove();
  active = null;
  // Don't strand keyboard focus on a removed button.
  if (hadFocus) (host?.closest('dialog')?.querySelector<HTMLElement>('[tabindex="-1"], button') ?? document.querySelector('h1'))?.focus();
}

function detailLine(news: WinnerNews): string {
  const pattern = strings.patterns[news.pattern];
  const points =
    news.points === null
      ? ''
      : news.kind === 'shared'
        ? t('bannerPointsEach', { points: news.points })
        : t('bannerPoints', { points: news.points });
  const action = {
    single: t('bannerWins', { pattern }),
    shared: t('bannerShare', { pattern }),
    tie: t('bannerTieSub', { pattern, names: joinNames(news.winners.map(winnerName)) }),
    tieBreak: t('bannerTieBreak', { pattern }),
  }[news.kind];
  return [action, points].filter(Boolean).join(' · ');
}

/**
 * Big, high-contrast winner banner. Inside an open dialog it sits at the top
 * of the dialog (so the caller's buttons stay usable); otherwise it overlays
 * the screen, e.g. in TV mode. Closes after 6 s or on "Continue".
 */
export function showWinnerBanner(news: WinnerNews): void {
  hideWinnerBanner();
  const dialogBody = document.querySelector<HTMLElement>('dialog[open] .dialog-body');
  const headline = news.kind === 'tie' ? t('bannerTie') : joinNames(news.winners.map(winnerName));
  const el = h(
    'section',
    {
      class: dialogBody ? 'winner-banner winner-banner-inline' : 'winner-banner winner-banner-overlay',
      'aria-label': t('bannerLabel'),
    },
    h('p', { class: 'winner-banner-label' }, icon('🏆'), t('bannerLabel')),
    h('p', { class: 'winner-banner-names' }, headline),
    h('p', { class: 'winner-banner-detail' }, detailLine(news)),
    h('button', { type: 'button', class: 'btn btn-primary btn-large', onclick: hideWinnerBanner }, t('bannerContinue')),
  );
  if (dialogBody) dialogBody.prepend(el);
  else document.body.appendChild(el);
  active = { el, timer: window.setTimeout(hideWinnerBanner, BANNER_MS) };
  announce(winnerSpeech(news, 'en'));
  if (news.kind !== 'tie') celebrate();
}
