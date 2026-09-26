import { getGame } from '../caller/session';
import { t } from '../i18n';
import { KEYS, loadString } from '../storage';
import { h, icon } from '../ui/dom';
import { inclusiveSwitch } from '../ui/inclusiveSwitch';
import type { Screen } from '../ui/screen';

function roleButton(href: string, symbol: string, label: string, hint: string): HTMLAnchorElement {
  return h(
    'a',
    { class: 'role-button', href },
    h('span', { class: 'role-icon', 'aria-hidden': 'true' }, symbol),
    h('span', { class: 'role-label' }, label),
    h('span', { class: 'role-hint' }, hint),
  );
}

export const homeScreen: Screen = (main) => {
  const callerGame = getGame();
  const playerCode = loadString(KEYS.playerCurrent);

  main.append(
    h(
      'div',
      { class: 'page home' },
      h(
        'div',
        { class: 'home-hero' },
        h('h1', { tabindex: -1, class: 'home-title' }, icon('🎉'), t('appName')),
        h('p', { class: 'tagline' }, t('tagline')),
      ),
      h(
        'div',
        { class: 'roles' },
        roleButton(
          '#/caller',
          '🎤',
          t('roleCaller'),
          callerGame && !callerGame.ended ? t('resumeCaller', { code: callerGame.gameCode }) : t('roleCallerHint'),
        ),
        roleButton(
          '#/player',
          '🎟️',
          t('rolePlayer'),
          playerCode ? t('resumePlayer', { code: playerCode }) : t('rolePlayerHint'),
        ),
      ),
      h('div', { class: 'home-inclusive' }, inclusiveSwitch()),
      h(
        'nav',
        { class: 'home-links', 'aria-label': t('home') },
        h('a', { class: 'btn btn-secondary', href: '#/how' }, icon('❓'), t('howToPlay')),
        h('a', { class: 'btn btn-secondary', href: '#/settings' }, icon('⚙️'), t('settings')),
      ),
      h('p', { class: 'honest-note' }, icon('ℹ'), t('honestNote')),
      h('p', { class: 'center' }, h('a', { href: '#/soon', class: 'text-link' }, icon('✨'), t('comingSoon'))),
    ),
  );
};
