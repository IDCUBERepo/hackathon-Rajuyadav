import './styles/main.css';
import { t } from './i18n';
import { applyPrefs, loadPrefs } from './prefs';
import { callerScreen } from './screens/caller';
import { callerSetupScreen } from './screens/callerSetup';
import { comingSoonScreen } from './screens/comingSoon';
import { homeScreen } from './screens/home';
import { howToScreen } from './screens/howTo';
import { joinScreen } from './screens/join';
import { playerScreen } from './screens/player';
import { printScreen } from './screens/print';
import { settingsScreen } from './screens/settings';
import { tvScreen } from './screens/tv';
import { readDeepLink } from './qr';
import { storageWorks } from './storage';
import { append, h, icon } from './ui/dom';
import { pageTitle, type Screen } from './ui/screen';

applyPrefs(loadPrefs());

const routes: Record<string, Screen> = {
  '/': homeScreen,
  '/caller': callerScreen,
  '/caller/setup': callerSetupScreen,
  '/caller/tv': tvScreen,
  '/caller/print': printScreen,
  '/join': joinScreen,
  '/player': playerScreen,
  '/how': howToScreen,
  '/settings': settingsScreen,
  '/soon': comingSoonScreen,
};

const notFound: Screen = (main) => {
  main.append(
    h('div', { class: 'page' }, pageTitle(t('notFound')), h('a', { class: 'btn btn-primary', href: '#/' }, t('home'))),
  );
};

/* ---------- Shell: skip link, header, main ---------- */

const main = h('main', { id: 'main', tabindex: -1 });
append(document.getElementById('app')!, [
  h('a', { class: 'skip-link', href: '#main', onclick: (e: Event) => (e.preventDefault(), main.focus()) }, t('skipToContent')),
  h(
    'header',
    { class: 'site-header' },
    h('a', { class: 'brand', href: '#/' }, icon('🎉'), h('span', {}, t('appName'))),
    h(
      'nav',
      { class: 'header-nav', 'aria-label': t('appName') },
      h('a', { class: 'btn btn-quiet', href: '#/how' }, icon('❓'), h('span', { class: 'nav-text' }, t('howToPlay'))),
      h('a', { class: 'btn btn-quiet', href: '#/settings' }, icon('⚙️'), h('span', { class: 'nav-text' }, t('settings'))),
    ),
  ),
  storageWorks() ? null : h('p', { class: 'notice storage-warning', role: 'alert' }, t('storageWarning')),
  main,
]);

/* ---------- Hash router ---------- */

let cleanup: (() => void) | void;
let firstRender = true;

function currentPath(): string {
  const path = location.hash.replace(/^#/, '') || '/';
  return path === '' ? '/' : path;
}

function render(): void {
  cleanup?.();
  cleanup = undefined;
  main.textContent = '';
  const screen = routes[currentPath()] ?? notFound;
  cleanup = screen(main);
  const heading = main.querySelector('h1');
  document.title = heading?.textContent ? `${heading.textContent.trim()} · ${t('appName')}` : t('appName');
  // Move focus to the new page's heading so screen readers announce it,
  // but not on first load (browsers start at the top anyway).
  if (!firstRender) (heading as HTMLElement | null)?.focus();
  firstRender = false;
  window.scrollTo(0, 0);
}

// Opened from a QR code (?game=KMPT): go to the join screen, which reads it.
if (readDeepLink(location.search).kind !== 'none' && currentPath() !== '/join') {
  history.replaceState(history.state, '', `${location.pathname}${location.search}#/join`);
}

window.addEventListener('hashchange', render);
render();

/* ---------- Offline support ---------- */

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
