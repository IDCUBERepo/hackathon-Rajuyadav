import { strings, t } from '../i18n';
import { loadPrefs, savePrefs, type TextSize, type Theme } from '../prefs';
import { h, icon, replaceChildren } from '../ui/dom';
import { inclusiveSwitch } from '../ui/inclusiveSwitch';
import { pageTitle, radioGroup, type Screen } from '../ui/screen';

export const settingsScreen: Screen = (main) => {
  const page = h('div', { class: 'page page-narrow stack' });
  main.append(page);

  function render(focusSwitch = false): void {
    const prefs = loadPrefs();
    // Individual settings can still be changed while Inclusive Mode is on.
    const update = (change: Partial<{ textSize: TextSize; theme: Theme }>) => savePrefs({ ...loadPrefs(), ...change });
    replaceChildren(
      page,
      pageTitle(t('settingsTitle'), '⚙️'),
      h('div', { class: 'card' }, inclusiveSwitch(() => render(true))),
      h(
        'div',
        { class: 'card' },
        radioGroup<TextSize>(
          t('textSize'),
          'text-size',
          [
            { value: 0, label: t('textSizeNormal'), srLabel: strings.textSizeNames[0] },
            { value: 1, label: t('textSizeLarge'), srLabel: strings.textSizeNames[1] },
            { value: 2, label: t('textSizeLarger'), srLabel: strings.textSizeNames[2] },
          ],
          prefs.textSize,
          (v) => update({ textSize: v }),
          'tiles text-size-tiles',
        ),
      ),
      h(
        'div',
        { class: 'card' },
        radioGroup<Theme>(
          t('theme'),
          'theme',
          [
            { value: 'system', label: t('themeSystem') },
            { value: 'light', label: t('themeLight') },
            { value: 'dark', label: t('themeDark') },
            { value: 'contrast', label: t('themeContrast') },
          ],
          prefs.theme,
          (v) => update({ theme: v }),
        ),
      ),
      h(
        'div',
        { class: 'button-row' },
        h('a', { class: 'btn btn-secondary', href: '#/how' }, icon('❓'), t('howToPlay')),
        h('a', { class: 'btn btn-secondary', href: '#/soon' }, icon('✨'), t('comingSoon')),
      ),
    );
    if (focusSwitch) page.querySelector<HTMLElement>('[role="switch"]')?.focus();
  }

  render();
};
