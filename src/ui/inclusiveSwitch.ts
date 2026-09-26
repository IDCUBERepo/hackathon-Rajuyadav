import { t } from '../i18n';
import { setInclusiveMode } from '../inclusive';
import { isInclusive } from '../prefs';
import { announce, h } from './dom';

/**
 * The big "Inclusive Mode 👓" switch (a button with role="switch"). The state
 * is shown in words ("On"/"Off") as well as by the track, never colour alone.
 */
export function inclusiveSwitch(onChange?: (on: boolean) => void): HTMLElement {
  const state = h('span', { class: 'switch-state' });
  const button = h(
    'button',
    { type: 'button', role: 'switch', class: 'inclusive-switch', 'aria-describedby': 'inclusive-hint' },
    h('span', { class: 'switch-text' }, h('span', { class: 'switch-label' }, t('inclusiveLabel')), h('span', { class: 'switch-sub' }, t('inclusiveSub'))),
    h('span', { class: 'switch-track', 'aria-hidden': 'true' }, h('span', { class: 'switch-thumb' })),
    state,
  );
  const render = () => {
    const on = isInclusive();
    button.setAttribute('aria-checked', String(on));
    state.textContent = on ? t('switchOn') : t('switchOff');
  };
  button.addEventListener('click', () => {
    const on = !isInclusive();
    setInclusiveMode(on);
    render();
    announce(on ? t('inclusiveOnAnnounce') : t('inclusiveOffAnnounce'));
    onChange?.(on);
  });
  render();
  return h('div', { class: 'inclusive-wrap' }, button, h('p', { id: 'inclusive-hint', class: 'field-help' }, t('inclusiveHint')));
}
