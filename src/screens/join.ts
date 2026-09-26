import { codeProblem, GAME_CODE_LENGTH, normalizeCode, playerTicketCodes, STRIP_SIZE } from '../core/codes';
import { createPlayerGame } from '../core/player';
import { t } from '../i18n';
import { loadPlayerGame, savePlayerGame } from '../player/store';
import { h, icon, navigate, replaceChildren } from '../ui/dom';
import { clearDeepLink, readDeepLink } from '../qr';
import { pageTitle, radioGroup, textField, type Screen } from '../ui/screen';

const CODE_ERRORS = {
  empty: 'joinCodeEmpty',
  length: 'joinCodeLength',
  characters: 'joinCodeChars',
} as const;

/**
 * Join in three short steps: game code → name → number of tickets.
 * Opened from a QR code (?game=KMPT), the code is filled in and checked, so
 * the player starts at the name step.
 */
export const joinScreen: Screen = (main) => {
  let gameCode = '';
  let name = '';
  let count = 1;
  const link = readDeepLink(location.search);

  const stepLabel = h('p', { class: 'join-step' });
  const linkNote = h('div', { class: 'join-link', hidden: true });
  const body = h('div');
  main.append(h('div', { class: 'page page-narrow join' }, pageTitle(t('joinTitle'), '🎟️'), stepLabel, linkNote, body));

  function goToPlayer(): void {
    clearDeepLink(); // A refresh now opens the player's tickets, not the join.
    navigate('#/player');
  }

  function showStep(step: 1 | 2 | 3): void {
    stepLabel.textContent = t('joinStep', { step });
    // The "joined from a link" note only makes sense after step 1.
    if (step === 1 && link.kind === 'valid') linkNote.hidden = true;
    const form = h('form', { class: 'card stack', novalidate: true });
    const back =
      step > 1
        ? h(
            'button',
            { type: 'button', class: 'btn btn-secondary', onclick: () => showStep((step - 1) as 1 | 2) },
            icon('←'),
            t('back'),
          )
        : null;

    if (step === 1) {
      const field = textField(t('joinCodeLabel'), t('joinCodeHelp'), {
        class: 'input input-code',
        value: gameCode,
        autocomplete: 'off',
        autocapitalize: 'characters',
        autocorrect: 'off',
        spellcheck: 'false',
        enterkeyhint: 'next',
        maxlength: GAME_CODE_LENGTH + 2,
      });
      form.append(field.wrap, h('div', { class: 'button-row' }, h('button', { type: 'submit', class: 'btn btn-primary btn-large' }, icon('→'), t('next'))));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = normalizeCode(field.input.value);
        field.input.value = code;
        const problem = codeProblem(code, GAME_CODE_LENGTH);
        if (problem) {
          field.setError(t(CODE_ERRORS[problem]));
          field.input.focus();
          return;
        }
        // Already have tickets for this game on this device? Go straight back to them.
        if (loadPlayerGame(code)) {
          savePlayerGame(loadPlayerGame(code)!);
          goToPlayer();
          return;
        }
        gameCode = code;
        showStep(2);
      });
      replaceChildren(body, form);
      field.input.focus();
    } else if (step === 2) {
      const field = textField(t('joinNameLabel'), t('joinNameHelp'), {
        value: name,
        autocomplete: 'given-name',
        enterkeyhint: 'next',
        maxlength: 40,
      });
      form.append(
        field.wrap,
        h('div', { class: 'button-row' }, back, h('button', { type: 'submit', class: 'btn btn-primary btn-large' }, icon('→'), t('next'))),
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const value = field.input.value.trim();
        if (!value) {
          field.setError(t('joinNameEmpty'));
          field.input.focus();
          return;
        }
        name = value;
        showStep(3);
      });
      replaceChildren(body, form);
      field.input.focus();
    } else {
      const options = Array.from({ length: STRIP_SIZE }, (_, i) => ({
        value: i + 1,
        label: String(i + 1),
        srLabel: t(i === 0 ? 'joinTicketsOption' : 'joinTicketsOptionPlural', { count: i + 1 }),
      }));
      form.append(
        radioGroup(t('joinTicketsLabel'), 'ticket-count', options, count, (v) => (count = v), 'tiles ticket-count'),
        h('p', { class: 'field-help' }, t('joinTicketsHint')),
        h(
          'div',
          { class: 'button-row' },
          back,
          h('button', { type: 'submit', class: 'btn btn-primary btn-large' }, icon('🎟️'), t('joinButton')),
        ),
      );
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        savePlayerGame(createPlayerGame(gameCode, name, playerTicketCodes(count)));
        goToPlayer();
      });
      replaceChildren(body, form);
      (form.querySelector('input:checked') as HTMLInputElement).focus();
    }
  }

  if (link.kind === 'valid') {
    if (loadPlayerGame(link.code)) {
      // Scanned again for a game we already have tickets for.
      savePlayerGame(loadPlayerGame(link.code)!);
      goToPlayer();
      return;
    }
    gameCode = link.code;
    replaceChildren(
      linkNote,
      h('p', { class: 'join-link-code' }, t('joinFromLink', { code: link.code })),
      h('p', { class: 'field-help' }, t('joinFromLinkHelp')),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-quiet',
          onclick: () => {
            clearDeepLink();
            gameCode = '';
            showStep(1);
          },
        },
        t('joinChangeGame'),
      ),
    );
    linkNote.hidden = false;
    showStep(2);
    return;
  }
  if (link.kind === 'invalid') {
    clearDeepLink();
    replaceChildren(linkNote, h('p', { class: 'notice', role: 'status' }, icon('ℹ'), t('joinLinkInvalid')));
    linkNote.hidden = false;
  }
  showStep(1);
};
