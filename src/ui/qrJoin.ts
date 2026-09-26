import { t } from '../i18n';
import { isLocalHost, joinUrl, qrSvg } from '../qr';
import { openDialog } from './dialog';
import { h, icon, srOnly } from './dom';

/**
 * A QR code image for joining `gameCode`. The wrapper is role="img" with a
 * text alternative; the SVG is filled in once generated (locally, offline).
 */
export function qrImage(gameCode: string, className = 'qr'): HTMLElement {
  const url = joinUrl(gameCode);
  const el = h('div', {
    class: className,
    role: 'img',
    'aria-label': t('qrAlt', { code: gameCode }),
    'data-join-url': url,
  });
  qrSvg(url)
    .then((svg) => {
      el.innerHTML = svg; // Our own library output for our own URL.
      el.querySelector('svg')?.setAttribute('aria-hidden', 'true');
    })
    .catch(() => {
      el.textContent = url; // Should never happen; the code is still shown in text.
    });
  return el;
}

/** Full-screen view with just the QR code and the game code, for scanning across a room. */
export function openFullscreenQr(gameCode: string): void {
  openDialog(
    t('qrHeading'),
    [
      qrImage(gameCode, 'qr qr-huge'),
      h('p', { class: 'qr-huge-code', 'aria-hidden': 'true' }, gameCode),
      srOnly(`${t('gameCode')}: ${gameCode.split('').join(' ')}`),
    ],
    { className: 'dialog-qr' },
  );
}

/** Note shown when phones probably can't reach this address. */
export function localNetworkNote(): HTMLElement | null {
  return isLocalHost(location.hostname) ? h('p', { class: 'qr-local-note' }, icon('ℹ'), t('qrLocalNote')) : null;
}

export function fullscreenQrButton(gameCode: string, className = 'btn btn-secondary'): HTMLButtonElement {
  return h('button', { type: 'button', class: className, onclick: () => openFullscreenQr(gameCode) }, icon('⛶'), t('qrFullscreen'));
}
