import {
  clearGame,
  draw,
  finishGame,
  getGame,
  isAutoRunning,
  pauseAuto,
  repeatCurrent,
  secondsUntilNextDraw,
  startAuto,
  subscribe,
  undo,
  voiceNotice,
} from '../caller/session';
import {
  canDraw,
  openClaimWindows,
  pendingTieBreaks,
  TOTAL_NUMBERS,
  winnerPoints,
  winnersFor,
  type CallerGame,
} from '../core/game';
import { strings, t } from '../i18n';
import { unlockSpeech } from '../speech';
import { boardPart, currentNumberPart, lastFivePart, prizeTrackerPart } from '../ui/callerParts';
import { resultsText, shareResults } from '../share';
import { finishClaimsFor, finishLabel, openClaimDialog } from '../ui/claimDialog';
import { fullscreenQrButton, localNetworkNote, qrImage } from '../ui/qrJoin';
import { showWinnerBanner } from '../ui/winnerBanner';
import { confirmDialog } from '../ui/dialog';
import { h, icon, navigate, replaceChildren, srOnly } from '../ui/dom';
import { pageTitle, type Screen } from '../ui/screen';

/** Space/Enter draw a number unless focus is on something that uses those keys itself. */
export function drawShortcut(onDraw: () => void): (e: KeyboardEvent) => void {
  return (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, summary, [role="gridcell"]')) return;
    e.preventDefault();
    onDraw();
  };
}

export function callNext(): void {
  unlockSpeech();
  draw();
}

/**
 * QR join panel and game code. The heading holds the code, which screen
 * readers hear letter by letter.
 */
function gameCodeCard(code: string): HTMLElement {
  return h(
    'div',
    { class: 'game-code card' },
    qrImage(code),
    h(
      'div',
      { class: 'game-code-text' },
      h(
        'h1',
        { tabindex: -1, class: 'game-code-heading' },
        h('span', { class: 'scan-heading' }, t('qrHeading')),
        h('span', { class: 'game-code-label' }, t('gameCode')),
        h('span', { class: 'game-code-value', 'aria-hidden': 'true' }, code),
        srOnly(code.split('').join(' ')),
      ),
      h('p', { class: 'field-help' }, t('gameCodeHelp')),
      localNetworkNote(),
      fullscreenQrButton(code),
    ),
  );
}

async function confirmNewGame(): Promise<void> {
  if (await confirmDialog(t('newConfirmTitle'), t('newConfirmBody'))) {
    clearGame();
    navigate('#/caller/setup');
  }
}

function liveView(game: CallerGame): { el: HTMLElement; update: (g: CallerGame) => void; pop: () => void; tick: () => void } {
  const current = currentNumberPart();
  const lastFive = lastFivePart();
  const board = boardPart();
  const prizes = prizeTrackerPart();

  const callBtn = h(
    'button',
    { type: 'button', class: 'btn btn-primary btn-huge call-next', onclick: callNext },
    icon('🎱'),
    t('callNext'),
  );
  const allCalled = h('p', { class: 'notice', hidden: true }, t('allCalled'));

  const autoBtn = h('button', {
    type: 'button',
    class: 'btn btn-secondary',
    onclick: () => (isAutoRunning() ? pauseAuto() : (unlockSpeech(), startAuto())),
  });
  const autoStatus = h('p', { class: 'auto-status' });
  let autoWasStarted = false;

  const repeatBtn = h(
    'button',
    { type: 'button', class: 'btn btn-secondary', onclick: repeatCurrent },
    icon('🔁'),
    t('repeat'),
  );
  const undoBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-secondary',
      onclick: async () => {
        const g = getGame();
        const last = g?.called[g.called.length - 1];
        if (last === undefined) return;
        pauseAuto();
        // Prizes won on this number are removed by undo, so name them in the warning.
        const lost = g!.winners
          .filter((w) => w.callCount === g!.called.length)
          .map((w) => t('undoWinItem', { pattern: strings.patterns[w.pattern], name: w.name || t('anonymous', { code: w.ticketCode }) }));
        const message = lost.length
          ? `${t('undoConfirmBody', { number: last })} ⚠ ${t('undoConfirmWins', { wins: lost.join(', ') })}`
          : t('undoConfirmBody', { number: last });
        if (await confirmDialog(t('undoConfirmTitle'), message)) undo();
      },
    },
    icon('↩'),
    t('undo'),
  );

  /** Open claim windows (shared winners): more claims allowed until the caller moves on. */
  const claimsBanner = h('section', { class: 'claims-banner card', hidden: true, 'aria-live': 'polite' });
  const updateClaimsBanner = (g: CallerGame) => {
    const open = openClaimWindows(g);
    claimsBanner.hidden = open.length === 0;
    if (open.length === 0) return replaceChildren(claimsBanner);
    const number = g.called[g.called.length - 1];
    const blocking = pendingTieBreaks(g).length > 0 || !canDraw(g);
    replaceChildren(
      claimsBanner,
      open.map((p) =>
        h(
          'div',
          { class: 'claims-open' },
          h('p', { class: 'claims-open-text' }, icon('📣'), t('claimsOpenBanner', { pattern: strings.patterns[p], number })),
          h(
            'div',
            { class: 'button-row' },
            h('button', { type: 'button', class: 'btn btn-accent', onclick: () => openClaimDialog(p) }, icon('↻'), t('claimAnother')),
            h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => void finishClaimsFor(p) }, icon('✓'), finishLabel()),
          ),
        ),
      ),
      blocking && g.called.length < TOTAL_NUMBERS ? h('p', { class: 'field-help' }, t('claimsFinishFirst')) : null,
    );
  };

  const notice = h('p', { class: 'notice' });
  const noticeText = voiceNotice(game.settings);
  notice.hidden = noticeText === null;
  notice.textContent = noticeText ? `ℹ ${noticeText}` : '';

  const el = h(
    'div',
    { class: 'page caller' },
    gameCodeCard(game.gameCode),
    notice,
    h(
      'div',
      { class: 'caller-grid' },
      h(
        'div',
        { class: 'caller-main' },
        current.el,
        lastFive.el,
        claimsBanner,
        h('div', { class: 'call-area' }, callBtn, h('p', { class: 'field-help center' }, t('callNextHint')), allCalled),
        h('div', { class: 'auto-row' }, autoBtn, autoStatus),
        h(
          'div',
          { class: 'button-row' },
          repeatBtn,
          h('button', { type: 'button', class: 'btn btn-accent', onclick: () => openClaimDialog() }, icon('🔍'), t('checkClaim')),
          undoBtn,
        ),
      ),
      h('div', { class: 'caller-side' }, prizes.el, board.el),
    ),
    h(
      'div',
      { class: 'button-row caller-footer' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary',
          onclick: () => {
            // Fullscreen must be requested from the click itself.
            document.documentElement.requestFullscreen?.().catch(() => undefined);
            navigate('#/caller/tv');
          },
        },
        icon('📺'),
        t('tvMode'),
      ),
      h('a', { class: 'btn btn-secondary', href: '#/caller/print' }, icon('🖨'), t('printTickets')),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-secondary',
          onclick: async () => {
            pauseAuto();
            if (await confirmDialog(t('endConfirmTitle'), t('endConfirmBody'))) finishGame();
          },
        },
        icon('🏁'),
        t('endGame'),
      ),
      h('button', { type: 'button', class: 'btn btn-quiet', onclick: confirmNewGame }, icon('✚'), t('newGame')),
    ),
  );

  const tick = () => {
    autoStatus.textContent = isAutoRunning()
      ? t('autoNextIn', { seconds: secondsUntilNextDraw() })
      : autoWasStarted
        ? t('autoPaused')
        : '';
  };

  return {
    el,
    update(g) {
      current.update(g);
      lastFive.update(g);
      board.update(g);
      prizes.update(g);
      updateClaimsBanner(g);
      const drawable = canDraw(g);
      callBtn.disabled = !drawable;
      allCalled.hidden = g.called.length < TOTAL_NUMBERS;
      undoBtn.disabled = g.called.length === 0;
      repeatBtn.disabled = g.called.length === 0;
      autoBtn.disabled = !drawable;
      if (isAutoRunning()) autoWasStarted = true;
      replaceChildren(
        autoBtn,
        icon(isAutoRunning() ? '⏸' : '▶'),
        isAutoRunning() ? t('autoPause') : autoWasStarted ? t('autoResume') : t('autoStart'),
      );
      tick();
    },
    pop: current.pop,
    tick,
  };
}

export function summaryView(game: CallerGame): HTMLElement {
  const board = boardPart();
  board.update(game);
  const rows = game.settings.patterns.flatMap((p) =>
    winnersFor(game, p).map((w) => {
      const points = winnerPoints(game, w);
      const extras = [
        points === null ? '' : t('summaryPoints', { points }),
        w.tieBreak === 'won' ? t('winnerWonDraw') : '',
        game.settings.prizes[p] && points !== 0 ? t('summaryPrize', { prize: game.settings.prizes[p]! }) : '',
      ].filter(Boolean);
      return h(
        'li',
        { class: 'winner' },
        h('span', { class: 'prize-icon', 'aria-hidden': 'true' }, '★'),
        h(
          'span',
          {},
          h('strong', {}, strings.patterns[p]),
          `: ${w.name || t('anonymous', { code: w.ticketCode })} (${w.ticketCode})`,
          extras.length ? h('span', { class: 'prize-label' }, ` · ${extras.join(' · ')}`) : null,
        ),
      );
    }),
  );
  // Share results: Web Share where available, otherwise copy to the clipboard.
  const shareStatus = h('p', { class: 'share-status', role: 'status' });
  const shareFallback = h('textarea', { class: 'input share-fallback', readonly: true, rows: 10, 'aria-label': t('shareTitle'), hidden: true });
  const shareBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn btn-primary',
      onclick: async () => {
        const text = resultsText(game);
        shareStatus.textContent = '';
        const outcome = await shareResults(text);
        if (outcome === 'copied') shareStatus.textContent = `✓ ${t('shareCopied')}`;
        if (outcome === 'unavailable') {
          shareStatus.textContent = t('shareCopyFailed');
          shareFallback.value = text;
          shareFallback.hidden = false;
          shareFallback.select();
        }
      },
    },
    icon('📤'),
    t('shareResults'),
  );
  return h(
    'div',
    { class: 'page page-narrow summary' },
    pageTitle(t('summaryTitle'), '🎉'),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, t('summaryWinners')),
      rows.length ? h('ul', { class: 'winner-list' }, rows) : h('p', {}, t('summaryNoWinners')),
      h('p', {}, t('summaryNumbers', { count: game.called.length })),
      h('div', { class: 'button-row' }, shareBtn),
      shareStatus,
      shareFallback,
    ),
    h(
      'div',
      { class: 'button-row' },
      h('button', { type: 'button', class: 'btn btn-primary', onclick: confirmNewGame }, icon('✚'), t('newGame')),
      h('a', { class: 'btn btn-secondary', href: '#/' }, icon('🏠'), t('home')),
    ),
    board.el,
  );
}

export const callerScreen: Screen = (main) => {
  let view: ReturnType<typeof liveView> | null = null;
  let showingSummary = false;

  function mount(): void {
    const game = getGame();
    if (!game) {
      navigate('#/caller/setup', true);
      return;
    }
    showingSummary = game.ended;
    if (game.ended) {
      view = null;
      replaceChildren(main, summaryView(game));
    } else {
      view = liveView(game);
      view.update(game);
      replaceChildren(main, view.el);
    }
  }

  mount();

  const unsubscribe = subscribe((event) => {
    const game = getGame();
    if (!game || game.ended !== showingSummary) {
      mount();
      (main.querySelector('h1') as HTMLElement | null)?.focus();
      return;
    }
    if (event.type === 'winner') {
      showWinnerBanner(event.news);
      return;
    }
    if (!view) return;
    if (event.type === 'tick') view.tick();
    else view.update(game);
    if (event.type === 'drawn') view.pop();
  });

  const onKey = drawShortcut(() => {
    if (!showingSummary) callNext();
  });
  document.addEventListener('keydown', onKey);

  return () => {
    unsubscribe();
    document.removeEventListener('keydown', onKey);
    // The banner removes itself after a few seconds, even across screens.
  };
};
