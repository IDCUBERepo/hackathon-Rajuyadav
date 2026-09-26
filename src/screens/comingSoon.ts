import { strings, t } from '../i18n';
import { h } from '../ui/dom';
import { pageTitle, type Screen } from '../ui/screen';

/**
 * Roadmap shown as disabled menu items. They use aria-disabled (not the
 * disabled attribute) so keyboard and screen-reader users can still reach and
 * read them.
 */
export const comingSoonScreen: Screen = (main) => {
  main.append(
    h(
      'div',
      { class: 'page page-narrow' },
      pageTitle(t('comingSoonTitle'), '✨'),
      h('p', {}, t('comingSoonIntro')),
      h(
        'ul',
        { class: 'soon-list' },
        strings.comingSoonItems.map((item) =>
          h(
            'li',
            {},
            h(
              'button',
              { type: 'button', class: 'soon-item', 'aria-disabled': 'true' },
              h('span', { class: 'soon-title' }, item.title, ' ', h('span', { class: 'badge' }, t('comingSoonBadge'))),
              h('span', { class: 'soon-body' }, item.body),
            ),
          ),
        ),
      ),
    ),
  );
};
