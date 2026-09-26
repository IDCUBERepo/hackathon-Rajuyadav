import {
  patternCapacity,
  patternState,
  pendingTieBreaks,
  TOTAL_NUMBERS,
  winnerPoints,
  winnersFor,
  type CallerGame,
  type Winner,
} from '../core/game';
import { strings, t } from '../i18n';
import { h, prefersReducedMotion, replaceChildren, srOnly } from './dom';

/** A piece of UI that can refresh itself from the current game. */
export interface Part {
  el: HTMLElement;
  update: (game: CallerGame) => void;
}

/** The big current number plus "32 of 90 called". */
export function currentNumberPart(): Part & { pop: () => void } {
  const number = h('div', { class: 'current-number', 'aria-hidden': 'true' });
  const srText = h('p', { class: 'sr-only' });
  const count = h('p', { class: 'called-count' });
  const el = h(
    'section',
    { class: 'current', 'aria-label': t('currentNumber') },
    h('p', { class: 'current-label', 'aria-hidden': 'true' }, t('currentNumber')),
    number,
    srText,
    count,
  );
  return {
    el,
    update(game) {
      const last = game.called[game.called.length - 1];
      number.textContent = last === undefined ? '–' : String(last);
      number.classList.toggle('is-empty', last === undefined);
      srText.textContent = last === undefined ? t('noNumberYet') : `${t('currentNumber')}: ${last}`;
      count.textContent = t('calledCount', { count: game.called.length });
    },
    /** Replay the entrance animation for a freshly drawn number. */
    pop() {
      if (prefersReducedMotion()) return;
      number.classList.remove('pop');
      void number.offsetWidth; // Force reflow so the animation restarts.
      number.classList.add('pop');
    },
  };
}

/** The previous numbers (most recent first), excluding the current one. */
export function lastFivePart(): Part {
  const list = h('ol', { class: 'last-five' });
  const el = h('section', { class: 'last-five-wrap' }, h('h2', { class: 'section-label' }, t('lastFive')), list);
  return {
    el,
    update(game) {
      const recent = game.called.slice(-6, -1).reverse();
      if (recent.length === 0) {
        replaceChildren(list, h('li', { class: 'last-five-empty' }, t('noneYet')));
        return;
      }
      replaceChildren(list, recent.map((n) => h('li', {}, n)));
    },
  };
}

/** The 1–90 board. Called numbers are filled, bold and ticked, not only coloured. */
export function boardPart(): Part {
  const cells: HTMLLIElement[] = [];
  const list = h('ol', { class: 'board', 'aria-label': t('board') });
  for (let n = 1; n <= TOTAL_NUMBERS; n++) {
    const cell = h('li', { class: 'board-cell' }, h('span', { class: 'board-n' }, n), srOnly(''));
    cells.push(cell);
    list.appendChild(cell);
  }
  const el = h('section', { class: 'board-wrap' }, h('h2', { class: 'section-label' }, t('board')), list);
  return {
    el,
    update(game) {
      const called = new Set(game.called);
      const last = game.called[game.called.length - 1];
      cells.forEach((cell, i) => {
        const n = i + 1;
        const isCalled = called.has(n);
        cell.classList.toggle('is-called', isCalled);
        cell.classList.toggle('is-latest', n === last);
        (cell.lastChild as HTMLElement).textContent = `, ${isCalled ? t('boardCalled') : t('boardNotCalled')}`;
      });
    },
  };
}

/**
 * A winner's name with their points and any tie-breaker outcome, e.g.
 * "Asha (33 pts)" or "Ben (100 pts, won the draw)".
 */
export function winnerLabel(game: CallerGame, w: Winner): string {
  const name = w.name || t('anonymous', { code: w.ticketCode });
  const extras: string[] = [];
  const points = winnerPoints(game, w);
  if (points !== null) extras.push(t('winnerPoints', { points }));
  if (w.tieBreak === 'won') extras.push(t('winnerWonDraw'));
  else if (!w.tieBreak && pendingTieBreaks(game).includes(w.pattern) && w.callCount === game.called.length) {
    extras.push(t('winnerTiePending'));
  }
  return extras.length ? `${name} (${extras.join(', ')})` : name;
}

function winnerNames(game: CallerGame, winners: Winner[]): string {
  return winners.map((w) => winnerLabel(game, w)).join(', ');
}

/** Text for a pattern's status in the prize tracker. */
export function prizeStatusText(game: CallerGame, pattern: CallerGame['settings']['patterns'][number]): string {
  const winners = winnersFor(game, pattern);
  const state = patternState(game, pattern);
  if (state === 'shared') return t('prizeShared', { names: winnerNames(game, winners) });
  if (state === 'won') return t('prizeWonBy', { names: winnerNames(game, winners) });
  if (winners.length > 0 && patternCapacity(game, pattern) > 1) {
    return t('prizeNextOpen', { names: winnerNames(game, winners) });
  }
  return t('prizeOpen');
}

export function prizeTrackerPart(title = t('prizes')): Part {
  const list = h('ul', { class: 'prize-list' });
  const el = h('section', { class: 'prizes card' }, h('h2', {}, title), list);
  return {
    el,
    update(game) {
      replaceChildren(
        list,
        game.settings.patterns.map((p) => {
          const state = patternState(game, p);
          const points = game.settings.points[p];
          const prize = [game.settings.prizes[p], points === undefined ? '' : t('winnerPoints', { points })]
            .filter(Boolean)
            .join(' · ');
          return h(
            'li',
            { class: `prize prize-${state}` },
            h('span', { class: 'prize-icon', 'aria-hidden': 'true' }, state === 'open' ? '○' : '★'),
            h(
              'span',
              { class: 'prize-text' },
              h('strong', {}, strings.patterns[p]),
              prize ? h('span', { class: 'prize-label' }, ` · ${prize}`) : null,
              h('span', { class: 'prize-status' }, prizeStatusText(game, p)),
            ),
          );
        }),
      );
    },
  };
}
