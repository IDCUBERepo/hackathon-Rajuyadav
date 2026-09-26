import { announceTieBreak, claim, finishClaims, getGame, pauseAuto } from '../caller/session';
import { normalizeCode, TICKET_CODE_LENGTH } from '../core/codes';
import { calledAt, isClaimWindowOpen, patternState, type ClaimResult, type TieBreakResult } from '../core/game';
import { patternNumbers, type PatternId } from '../core/patterns';
import type { Ticket } from '../core/ticket';
import { strings, t } from '../i18n';
import { openDialog } from './dialog';
import { announce, h, icon, prefersReducedMotion, replaceChildren } from './dom';
import { radioGroup, textField } from './screen';
import { renderTicketTable } from './ticketView';

function names(result: Extract<ClaimResult, { kind: 'alreadyWon' }>): string {
  return result.winners.map((w) => w.name || t('anonymous', { code: w.ticketCode })).join(', ');
}

/** Label for the button that closes a pattern's claim window. */
export function finishLabel(): string {
  const settings = getGame()?.settings;
  return settings?.sharedWinners && settings.tieMode === 'draw' ? t('claimFinish') : t('claimNoMore');
}

/**
 * Show a tie-breaker draw: names flick past for a moment, then the winner is
 * revealed. With reduced motion the winner is shown straight away.
 */
function showTieBreak(host: HTMLElement, result: TieBreakResult, pattern: PatternId): Promise<void> {
  const patternName = strings.patterns[pattern];
  const display = h('p', { class: 'tie-name', 'aria-hidden': 'true' });
  const status = h('p', { class: 'result-message' });
  const box = h('div', { class: 'result result-good tie-break', tabindex: -1 }, h('h3', {}, t('tieBreakTitle', { pattern: patternName })), display, status);
  replaceChildren(host, box);
  const nameOf = (w: TieBreakResult['winner']) => w.name || t('anonymous', { code: w.ticketCode });
  const reveal = () => {
    display.textContent = nameOf(result.winner);
    status.textContent = `🏆 ${t('tieBreakWinner', { name: nameOf(result.winner), pattern: patternName })}`;
    box.focus();
    // Voice, winner banner, confetti and the screen-reader announcement.
    announceTieBreak(result);
  };
  if (prefersReducedMotion()) {
    reveal();
    return Promise.resolve();
  }
  status.textContent = t('tieBreakDrawing');
  box.focus();
  return new Promise((resolve) => {
    let i = 0;
    const timer = window.setInterval(() => {
      display.textContent = nameOf(result.candidates[i++ % result.candidates.length]);
    }, 110);
    window.setTimeout(() => {
      window.clearInterval(timer);
      reveal();
      resolve();
    }, 1800);
  });
}

/**
 * Close a pattern's claim window. If that triggers a tie-breaker draw, it is
 * shown in `host` (or in a new dialog). Returns true if a draw was shown.
 */
export async function finishClaimsFor(pattern: PatternId, host?: HTMLElement): Promise<boolean> {
  const tieBreak = finishClaims(pattern);
  if (!tieBreak) return false;
  const target = host ?? openDialog(t('tieBreakTitle', { pattern: strings.patterns[pattern] }), [], {}).body;
  await showTieBreak(target, tieBreak, pattern);
  return true;
}

/**
 * "Check a Claim": pauses auto-draw, rebuilds the ticket from its code and
 * shows it with called numbers filled and the pattern outlined.
 *
 * Fairness: auto-draw is paused before anything else, and every claim in this
 * dialog is judged against the numbers called at this moment (`snapshot`), so
 * a claim is never rejected because another number was drawn meanwhile.
 * With shared winners, the caller is asked for more claims on the same number
 * before the pattern is closed.
 */
export function openClaimDialog(preselect?: PatternId): void {
  pauseAuto();
  const game = getGame();
  if (!game) return;
  const snapshot = game.called.length;

  const enabled = game.settings.patterns;
  let pattern: PatternId =
    preselect && enabled.includes(preselect)
      ? preselect
      : (enabled.find((p) => isClaimWindowOpen(game, p)) ?? enabled.find((p) => patternState(game, p) === 'open') ?? enabled[0]);

  const codeField = textField(t('claimTicketCode'), t('claimTicketHelp'), {
    class: 'input input-code',
    autocomplete: 'off',
    autocapitalize: 'characters',
    autocorrect: 'off',
    spellcheck: 'false',
    inputmode: 'text',
    enterkeyhint: 'go',
    maxlength: TICKET_CODE_LENGTH + 2,
  });
  const nameField = textField(t('claimName'), null, { autocomplete: 'off', maxlength: 40 });
  const result = h('div', { class: 'claim-result' });

  const form = h(
    'form',
    { class: 'stack', novalidate: true },
    radioGroup(
      t('claimPattern'),
      'claim-pattern',
      enabled.map((p) => ({ value: p, label: strings.patterns[p] })),
      pattern,
      (p) => (pattern = p),
    ),
    codeField.wrap,
    nameField.wrap,
    h('button', { type: 'submit', class: 'btn btn-primary btn-large' }, icon('🔍'), t('claimCheck')),
  );

  function checkAnother(): void {
    codeField.input.value = '';
    nameField.input.value = '';
    replaceChildren(result);
    form.hidden = false;
    codeField.input.focus();
  }

  const anotherBtn = () =>
    h('button', { type: 'button', class: 'btn btn-secondary btn-large', onclick: checkAnother }, icon('↻'), t('claimAnother'));

  /** "Any more claims for Top Line on number 42?" with the two big buttons. */
  function morePrompt(): HTMLElement {
    const current = getGame()!;
    const number = current.called[current.called.length - 1];
    const patternName = strings.patterns[pattern];
    return h(
      'section',
      { class: 'more-claims card', 'aria-labelledby': 'more-claims-title' },
      h('h3', { id: 'more-claims-title' }, t('claimMorePrompt', { pattern: patternName, number })),
      h('p', { class: 'field-help' }, t('claimMoreHelp', { pattern: patternName })),
      h(
        'div',
        { class: 'button-row' },
        h('button', { type: 'button', class: 'btn btn-primary btn-large', onclick: checkAnother }, icon('↻'), t('claimAnother')),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn-secondary btn-large',
            onclick: async () => {
              const drew = await finishClaimsFor(pattern, result);
              if (!drew) handle.close();
            },
          },
          icon('✓'),
          finishLabel(),
        ),
      ),
    );
  }

  function showTicket(ticket: Ticket, code: string): HTMLElement {
    const current = getGame();
    const outline = new Set(patternNumbers(ticket, pattern) ?? []);
    return h(
      'div',
      { class: 'claim-ticket' },
      h('h3', {}, t('claimTicketHeading', { code })),
      renderTicketTable(ticket, t('claimTicketHeading', { code }), {
        called: new Set(current ? calledAt(current, snapshot) : []),
        outline,
      }),
      h('p', { class: 'field-help' }, t('claimLegend')),
    );
  }

  function showResult(r: ClaimResult, code: string): void {
    const patternName = strings.patterns[pattern];
    let message: string;
    let tone: 'good' | 'kind' = 'kind';
    let ticket: Ticket | null = null;
    switch (r.kind) {
      case 'valid':
        tone = 'good';
        message = r.shared ? t('claimValidShared', { pattern: patternName }) : t('claimValid', { pattern: patternName });
        ticket = r.ticket;
        break;
      case 'notYet':
        message =
          pattern === 'earlyFive'
            ? t('claimNotYetEarly', { matched: 5 - r.stillNeeded })
            : t('claimNotYet', { numbers: r.missing.join(', ') });
        ticket = r.ticket;
        break;
      case 'late':
        message = [
          t('claimLate', { pattern: patternName, number: r.completedOn }),
          t(r.callsAgo === 1 ? 'claimLateAgoOne' : 'claimLateAgoMany', { number: r.completedOn, count: r.callsAgo }),
        ].join(' ');
        ticket = r.ticket;
        break;
      case 'alreadyWon':
        message = t('claimAlreadyWon', { pattern: patternName, names: names(r) });
        break;
      case 'duplicate':
        message = t('claimDuplicate', { pattern: patternName });
        break;
      case 'patternOff':
        message = t('claimPatternOff', { pattern: patternName });
        break;
      case 'badCode':
        return; // Handled as a field error before we get here.
    }
    const current = getGame();
    const ended = r.kind === 'valid' && current?.ended;
    // Ask for more claims while this pattern's claim window is open.
    const askForMore = !!current && isClaimWindowOpen(current, pattern) && snapshot === current.called.length;
    replaceChildren(
      result,
      h(
        'div',
        { class: `result result-${tone}`, tabindex: -1 },
        h('p', { class: 'result-message' }, icon(tone === 'good' ? '🎉' : '🙂'), message),
        ended ? h('p', {}, t('claimGameEnded')) : null,
      ),
      askForMore ? morePrompt() : h('div', { class: 'button-row' }, anotherBtn()),
      ticket ? showTicket(ticket, code) : null,
    );
    form.hidden = true;
    announce(askForMore ? `${message} ${t('claimMorePrompt', { pattern: patternName, number: current!.called[current!.called.length - 1] })}` : message, true);
    // (A valid claim also shows the winner banner, with confetti, via the session.)
    result.querySelector<HTMLElement>('.result')?.focus();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = normalizeCode(codeField.input.value);
    codeField.input.value = code;
    const r = claim(pattern, code, nameField.input.value.trim(), snapshot);
    if (!r || r.kind === 'badCode') {
      codeField.setError(t('claimBadCode'));
      codeField.input.focus();
      return;
    }
    codeField.setError(null);
    showResult(r, code);
  });

  const handle = openDialog(t('claimTitle'), [form, result], { wide: true });
  codeField.input.focus();
}
