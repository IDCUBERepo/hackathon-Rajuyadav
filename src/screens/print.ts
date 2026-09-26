import { getGame } from '../caller/session';
import { stripTicketCodes } from '../core/codes';
import { generateTicket } from '../core/ticket';
import { t } from '../i18n';
import { h, icon, navigate, replaceChildren } from '../ui/dom';
import { pageTitle, textField, type Screen } from '../ui/screen';
import { renderTicketTable } from '../ui/ticketView';

const MAX_SHEETS = 50;

/**
 * Printable sheets: each sheet is one full strip of 6 tickets (all 90
 * numbers). Tickets are rebuilt from their codes exactly like phone tickets,
 * so claims verify the same way.
 */
export const printScreen: Screen = (main) => {
  const game = getGame();
  if (!game) {
    navigate('#/caller/setup', true);
    return;
  }

  const sheetsField = textField(t('printSheets'), null, {
    type: 'number',
    inputmode: 'numeric',
    min: 1,
    max: MAX_SHEETS,
    value: '1',
    class: 'input',
  });
  const sheets = h('div', { class: 'print-sheets' });

  function makeSheets(): void {
    const count = Math.round(Number(sheetsField.input.value));
    if (!Number.isFinite(count) || count < 1 || count > MAX_SHEETS) {
      sheetsField.setError(t('printSheetsError', { max: MAX_SHEETS }));
      sheetsField.input.focus();
      return;
    }
    sheetsField.setError(null);
    replaceChildren(
      sheets,
      Array.from({ length: count }, (_, i) =>
        h(
          'section',
          { class: 'print-sheet', 'aria-label': t('printSheetHeader', { code: game!.gameCode, sheet: i + 1 }) },
          h(
            'div',
            { class: 'print-sheet-header' },
            h('span', {}, t('appName')),
            h('span', {}, t('printSheetHeader', { code: game!.gameCode, sheet: i + 1 })),
          ),
          h(
            'div',
            { class: 'print-tickets' },
            stripTicketCodes().map((code) =>
              h(
                'div',
                { class: 'print-ticket' },
                h('p', { class: 'print-ticket-code' }, t('printTicketCode', { code })),
                renderTicketTable(generateTicket(game!.gameCode, code), t('ticketLabel', { code })),
              ),
            ),
          ),
        ),
      ),
    );
  }

  const form = h(
    'form',
    { class: 'print-controls no-print', novalidate: true },
    sheetsField.wrap,
    h('button', { type: 'submit', class: 'btn btn-secondary btn-large' }, icon('↻'), t('printGenerate')),
    h('button', { type: 'button', class: 'btn btn-primary btn-large', onclick: () => window.print() }, icon('🖨'), t('printNow')),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    makeSheets();
  });

  main.append(
    h(
      'div',
      { class: 'page' },
      h(
        'div',
        { class: 'no-print' },
        pageTitle(t('printTitle'), '🖨'),
        h('p', {}, t('printHelp')),
        h('p', {}, h('a', { href: '#/caller', class: 'text-link' }, icon('←'), t('back'))),
      ),
      form,
      sheets,
    ),
  );
  makeSheets();
};
