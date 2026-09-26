import { getGame, isAutoRunning, pauseAuto, startAuto, subscribe } from '../caller/session';
import { canDraw, openClaimWindows } from '../core/game';
import { strings, t } from '../i18n';
import { boardPart, currentNumberPart, lastFivePart, prizeTrackerPart } from '../ui/callerParts';
import { finishClaimsFor, finishLabel, openClaimDialog } from '../ui/claimDialog';
import { fullscreenQrButton, qrImage } from '../ui/qrJoin';
import { showWinnerBanner } from '../ui/winnerBanner';
import { h, icon, navigate, replaceChildren, srOnly } from '../ui/dom';
import type { Screen } from '../ui/screen';
import { callNext, drawShortcut } from './caller';

/**
 * Full-screen view for a TV or projector: just the current number, the last
 * five and the board, sized to read from across a room. The few controls sit
 * in a slim bar at the bottom.
 */
export const tvScreen: Screen = (main) => {
  const game = getGame();
  if (!game || game.ended) {
    navigate('#/caller', true);
    return;
  }
  document.body.classList.add('tv-mode');

  const current = currentNumberPart();
  const lastFive = lastFivePart();
  const board = boardPart();
  // Always-visible winners board; long lists scroll inside the panel.
  const winners = prizeTrackerPart(t('tvWinners'));
  winners.el.classList.add('tv-winners');
  // Scrollable regions must be reachable by keyboard so they can be scrolled.
  winners.el.tabIndex = 0;
  winners.el.setAttribute('aria-label', t('tvWinners'));

  const callBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: callNext }, icon('🎱'), t('callNext'));
  const autoBtn = h('button', {
    type: 'button',
    class: 'btn btn-secondary',
    onclick: () => (isAutoRunning() ? pauseAuto() : startAuto()),
  });

  const claimBtn = h('button', { type: 'button', class: 'btn btn-accent', onclick: () => openClaimDialog() }, icon('🔍'), t('checkClaim'));
  // Open claim windows (shared winners) must be finishable here too, or drawing stays blocked in TV mode.
  const claimsOpen = h('div', { class: 'tv-claims', 'aria-live': 'polite' });
  const updateClaimsOpen = (g: NonNullable<ReturnType<typeof getGame>>) => {
    const number = g.called[g.called.length - 1];
    replaceChildren(
      claimsOpen,
      openClaimWindows(g).map((p) =>
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
    );
    claimsOpen.hidden = claimsOpen.childElementCount === 0;
  };

  const exit = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    navigate('#/caller');
  };

  replaceChildren(
    main,
    h(
      'div',
      { class: 'tv' },
      h('h1', { class: 'sr-only', tabindex: -1 }, t('tvMode')),
      h(
        'div',
        { class: 'tv-code' },
        qrImage(game.gameCode, 'qr qr-tv'),
        h(
          'div',
          {},
          h('p', { class: 'scan-heading' }, t('qrHeading')),
          h('p', {}, t('gameCode'), ' ', h('strong', { 'aria-hidden': 'true' }, game.gameCode), srOnly(game.gameCode.split('').join(' '))),
        ),
      ),
      h('div', { class: 'tv-main' }, current.el, lastFive.el, winners.el),
      board.el,
      h(
        'div',
        { class: 'tv-controls' },
        claimsOpen,
        callBtn,
        autoBtn,
        claimBtn,
        fullscreenQrButton(game.gameCode, 'btn btn-secondary'),
        h('button', { type: 'button', class: 'btn btn-quiet', onclick: exit }, icon('✕'), t('exitTv')),
      ),
    ),
  );

  const update = () => {
    const g = getGame();
    if (!g || g.ended) {
      exit();
      return;
    }
    current.update(g);
    lastFive.update(g);
    board.update(g);
    winners.update(g);
    updateClaimsOpen(g);
    callBtn.disabled = !canDraw(g);
    autoBtn.disabled = !canDraw(g);
    replaceChildren(autoBtn, icon(isAutoRunning() ? '⏸' : '▶'), isAutoRunning() ? t('autoPause') : t('autoStart'));
  };
  update();

  const unsubscribe = subscribe((event) => {
    if (event.type === 'tick') return;
    if (event.type === 'winner') {
      showWinnerBanner(event.news);
      return;
    }
    update();
    if (event.type === 'drawn') current.pop();
  });
  const onKey = drawShortcut(callNext);
  const onEscape = (e: KeyboardEvent) => {
    // Browsers leave fullscreen on Escape themselves; we also leave TV mode.
    // Escape inside an open dialog (such as a claim) only closes that dialog.
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) exit();
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('keydown', onEscape);

  return () => {
    unsubscribe();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keydown', onEscape);
    document.body.classList.remove('tv-mode');
  };
};
