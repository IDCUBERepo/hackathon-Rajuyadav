import { PATTERN_IDS, patternNumbers, type PatternId } from '../core/patterns';
import { generateTicket, ticketNumbers, type Ticket } from '../core/ticket';
import { strings, t } from '../i18n';
import { h, icon } from '../ui/dom';
import { pageTitle, type Screen } from '../ui/screen';
import { renderTicketTable } from '../ui/ticketView';

function exampleNumbers(example: Ticket, pattern: PatternId): Set<number> {
  const exact = patternNumbers(example, pattern);
  if (exact) return new Set(exact);
  // Early Five: any five, spread across the ticket for illustration.
  const all = ticketNumbers(example);
  return new Set([all[0], all[4], all[7], all[10], all[14]]);
}

export const howToScreen: Screen = (main) => {
  // A fixed demo ticket so the examples look the same every time. Built here,
  // not at import time, so a problem can never stop the whole app loading.
  const EXAMPLE = generateTicket('DEMO', 'HWTP2');
  main.append(
    h(
      'div',
      { class: 'page page-narrow' },
      pageTitle(t('howTitle'), '❓'),
      h(
        'ol',
        { class: 'steps' },
        strings.howSteps.map((step, i) =>
          h(
            'li',
            { class: 'step card' },
            h('span', { class: 'step-icon', 'aria-hidden': 'true' }, step.icon),
            h('div', {}, h('h2', {}, `${i + 1}. ${step.title}`), h('p', {}, step.body)),
          ),
        ),
      ),
      h(
        'section',
        { class: 'card how-extra', 'aria-labelledby': 'how-qr-title' },
        h('h2', { id: 'how-qr-title' }, icon('📱'), t('howQrTitle')),
        h('p', {}, t('howQrBody')),
      ),
      h(
        'section',
        { class: 'card how-extra', 'aria-labelledby': 'how-inclusive-title' },
        h('h2', { id: 'how-inclusive-title' }, t('howInclusiveTitle')),
        h('p', {}, t('howInclusiveBody')),
      ),
      h(
        'section',
        { class: 'card strict-rule', 'aria-labelledby': 'strict-rule-title' },
        h('h2', { id: 'strict-rule-title' }, icon('⏱️'), t('howStrictTitle')),
        h('p', {}, t('howStrictBody')),
        h('p', {}, t('howStrictOff')),
      ),
      h('h2', {}, t('howPatterns')),
      h(
        'ul',
        { class: 'pattern-examples' },
        PATTERN_IDS.map((p) => {
          const nums = exampleNumbers(EXAMPLE, p);
          return h(
            'li',
            { class: 'card' },
            h('h3', {}, strings.patterns[p]),
            h('p', {}, strings.patternHelp[p]),
            renderTicketTable(EXAMPLE, t('howPatternExample', { pattern: strings.patterns[p] }), {
              called: nums,
              outline: nums,
            }),
          );
        }),
      ),
    ),
  );
};
