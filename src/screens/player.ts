import { isStrictGameCode } from '../core/codes';
import { adoptPlayerGame } from '../inclusive';
import { isInclusive } from '../prefs';
import {
  buildTickets,
  markHeardNumber,
  possiblePatterns,
  toggleMark,
  type PlayerGame,
} from '../core/player';
import { strings, t } from '../i18n';
import { forgetPlayerGame, loadCurrentPlayerGame, savePlayerGame } from '../player/store';
import { confirmDialog } from '../ui/dialog';
import { announce, h, icon, navigate, replaceChildren, srOnly } from '../ui/dom';
import { checkboxRow, pageTitle, textField, type Screen } from '../ui/screen';
import { renderPlayableTicket } from '../ui/ticketView';

export const playerScreen: Screen = (main) => {
  const loaded = loadCurrentPlayerGame();
  if (!loaded) {
    navigate('#/join', true);
    return;
  }
  // With Inclusive Mode on, the first visit to a game switches its helpers on.
  let game: PlayerGame = isInclusive() ? adoptPlayerGame(loaded) : loaded;
  const tickets = buildTickets(game);
  const setters = new Map<string, (n: number, marked: boolean) => void>();

  function commit(next: PlayerGame): void {
    game = next;
    savePlayerGame(game);
    refreshHints();
  }

  /* ---------- Pattern hints (own marks only, never auto-claims) ---------- */
  const hintBox = h('div', { class: 'hint-banner', hidden: true });
  let knownHints = new Set<string>();
  function refreshHints(): void {
    if (!game.hints) {
      hintBox.hidden = true;
      knownHints = new Set();
      return;
    }
    const found = possiblePatterns(game, tickets);
    const keys = new Set(found.map((f) => `${f.ticketCode}:${f.pattern}`));
    const fresh = found.filter((f) => !knownHints.has(`${f.ticketCode}:${f.pattern}`));
    knownHints = keys;
    hintBox.hidden = found.length === 0;
    replaceChildren(
      hintBox,
      h(
        'ul',
        {},
        found.map((f) =>
          h('li', {}, icon('📣'), t('hintBanner', { pattern: strings.patterns[f.pattern], code: f.ticketCode })),
        ),
      ),
      h('p', { class: 'hint-note' }, t('hintNote')),
    );
    if (fresh.length) {
      const f = fresh[fresh.length - 1];
      announce(t('hintBanner', { pattern: strings.patterns[f.pattern], code: f.ticketCode }), true);
    }
  }

  /* ---------- Marking helper ---------- */
  const helperField = textField(t('helperLabel'), null, {
    inputmode: 'numeric',
    pattern: '[0-9]*',
    autocomplete: 'off',
    enterkeyhint: 'done',
    maxlength: 2,
  });
  const helperResult = h('p', { class: 'helper-result', role: 'status' });
  const helperForm = h(
    'form',
    { class: 'helper-form', novalidate: true, hidden: !game.helper },
    helperField.wrap,
    h('button', { type: 'submit', class: 'btn btn-primary btn-large' }, icon('✓'), t('helperButton')),
  );
  helperForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = Number(helperField.input.value.trim());
    if (!Number.isInteger(n) || n < 1 || n > 90) {
      helperField.setError(t('helperInvalid'));
      helperResult.textContent = '';
      helperField.input.focus();
      return;
    }
    helperField.setError(null);
    const { game: next, result } = markHeardNumber(game, tickets, n);
    if (result.kind === 'marked') {
      commit(next);
      for (const code of result.tickets) setters.get(code)?.(n, true);
      const key = result.tickets.length === 1 ? 'helperMarkedOne' : 'helperMarkedMany';
      helperResult.textContent = `✓ ${t(key, { number: n, count: result.tickets.length })}`;
    } else if (result.kind === 'already') {
      helperResult.textContent = `✓ ${t('helperAlready', { number: n })}`;
    } else {
      helperResult.textContent = `✕ ${t('helperNotOnTicket', { number: n })}`;
    }
    helperField.input.value = '';
    helperField.input.focus();
  });

  /* ---------- Tickets ---------- */
  const ticketCards = game.ticketCodes.map((code, index) => {
    const label = t('ticketLabel', { code });
    const view = renderPlayableTicket(tickets.get(code)!, label, new Set(game.marks[code]), (n) => {
      const next = toggleMark(game, code, n);
      const nowMarked = next.marks[code].includes(n);
      commit(next);
      view.setMarked(n, nowMarked);
    });
    setters.set(code, view.setMarked);
    return h(
      'section',
      { class: 'card ticket-card', 'aria-label': label },
      h(
        'div',
        { class: 'ticket-head' },
        h('h2', {}, t('ticketNumberHeading', { n: index + 1, total: game.ticketCodes.length })),
        h(
          'p',
          { class: 'ticket-code' },
          h('span', { class: 'ticket-code-caption' }, t('ticketCodeCaption')),
          h('span', { 'aria-hidden': 'true' }, code),
          srOnly(code.split('').join(' ')),
        ),
      ),
      view.el,
    );
  });

  const info = h('p', { class: 'field-help' }, t('playerInfo', { code: game.gameCode, name: game.name }));
  const claimReminder = h(
        'section',
        { class: 'claim-reminder', 'aria-labelledby': 'claim-heading' },
        h('span', { class: 'big-icon', 'aria-hidden': 'true' }, '📣'),
        h(
          'div',
          {},
          h('h2', { id: 'claim-heading' }, t('howToClaim')),
          // The game code tells us whether the caller uses the strict claim rule.
          isStrictGameCode(game.gameCode)
            ? [h('p', { class: 'claim-strict' }, t('howToClaimStrict')), h('p', {}, t('howToClaimShowCode'))]
            : h('p', {}, t('howToClaimBody')),
        ),
  );
  const winnersNote = h('p', { class: 'winners-note' }, icon('🔊'), t('playerWinnersNote'));
  const notSynced = h('p', { class: 'notice' }, icon('ℹ'), t('playerNotSynced'));
  const helperToggle = checkboxRow(
    t('helperToggle'),
    game.helper,
    (on) => {
      commit({ ...game, helper: on });
      helperForm.hidden = !on;
      if (on) helperField.input.focus();
    },
    t('helperToggleHint'),
  ).wrap;
  const hintsToggle = checkboxRow(t('hintsToggle'), game.hints, (on) => commit({ ...game, hints: on }), t('hintsToggleHint')).wrap;
  const ticketList = h('div', { class: 'tickets' }, ticketCards);
  const footer = h(
        'div',
        { class: 'button-row player-footer' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-secondary',
            onclick: async () => {
              if (!(await confirmDialog(t('clearMarksConfirmTitle'), t('clearMarksConfirmBody')))) return;
              for (const code of game.ticketCodes) for (const n of game.marks[code]) setters.get(code)?.(n, false);
              const marks: Record<string, number[]> = {};
              for (const code of game.ticketCodes) marks[code] = [];
              commit({ ...game, marks });
            },
          },
          icon('🧽'),
          t('clearMarks'),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-quiet',
            onclick: async () => {
              if (!(await confirmDialog(t('leaveConfirmTitle'), t('leaveConfirmBody', { code: game.gameCode })))) return;
              forgetPlayerGame(game.gameCode);
              navigate('#/join');
            },
          },
          icon('🚪'),
          t('leaveGame'),
        ),
  );

  if (isInclusive()) {
    // Simplified screen: ticket, marking helper and claim reminder first;
    // everything else behind "More".
    const more = h(
      'div',
      { id: 'player-more', class: 'player-more stack', hidden: true },
      info,
      winnersNote,
      notSynced,
      h('div', { class: 'card player-options' }, helperToggle, hintsToggle),
      footer,
    );
    const moreBtn = h(
      'button',
      {
        type: 'button',
        class: 'btn btn-secondary btn-large player-more-btn',
        'aria-expanded': 'false',
        'aria-controls': 'player-more',
        onclick: () => {
          more.hidden = !more.hidden;
          moreBtn.setAttribute('aria-expanded', String(!more.hidden));
        },
      },
      icon('⋯'),
      t('playerMore'),
    );
    main.append(
      h(
        'div',
        { class: 'page player-simple' },
        pageTitle(t('playerTitle'), '🎟️'),
        claimReminder,
        h('div', { class: 'card helper-card' }, helperForm, helperResult),
        hintBox,
        ticketList,
        moreBtn,
        more,
      ),
    );
  } else {
    main.append(
      h(
        'div',
        { class: 'page' },
        pageTitle(t('playerTitle'), '🎟️'),
        info,
        claimReminder,
        winnersNote,
        notSynced,
        h('div', { class: 'card player-options' }, helperToggle, helperForm, helperResult, hintsToggle),
        hintBox,
        ticketList,
        footer,
      ),
    );
  }
  refreshHints();
};
