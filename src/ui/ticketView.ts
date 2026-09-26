import { columnRange, COLS, ROWS, type Ticket } from '../core/ticket';
import { t } from '../i18n';
import { h, srOnly } from './dom';

/**
 * Read-only ticket as a semantic <table>. Used by claim checks, printing and
 * the How to Play examples. `called` cells are filled; `outline` cells get a
 * thick dashed border (the pattern being checked).
 */
export function renderTicketTable(
  ticket: Ticket,
  caption: string,
  options: { called?: ReadonlySet<number>; outline?: ReadonlySet<number> } = {},
): HTMLTableElement {
  const { called, outline } = options;
  return h(
    'table',
    { class: 'ticket ticket-table' },
    h('caption', { class: 'sr-only' }, caption),
    h(
      'thead',
      { class: 'sr-only' },
      h(
        'tr',
        {},
        Array.from({ length: COLS }, (_, c) => {
          const [lo, hi] = columnRange(c);
          return h('th', { scope: 'col' }, `${lo}–${hi}`);
        }),
      ),
    ),
    h(
      'tbody',
      {},
      ticket.map((row) =>
        h(
          'tr',
          {},
          row.map((cell) => {
            if (cell === null) return h('td', { class: 'cell cell-blank' }, srOnly(t('blank')));
            const isCalled = called?.has(cell) ?? false;
            const inPattern = outline?.has(cell) ?? false;
            const notes = [isCalled ? t('boardCalled') : '', inPattern ? t('inPattern') : '']
              .filter(Boolean)
              .join(', ');
            return h(
              'td',
              {
                class: ['cell', isCalled && 'is-called', inPattern && 'in-pattern'].filter(Boolean).join(' '),
              },
              h('span', { class: 'cell-number' }, cell),
              notes ? srOnly(`, ${notes}`) : null,
            );
          }),
        ),
      ),
    ),
  );
}

function cellLabel(row: number, col: number, n: number | null, marked: boolean): string {
  if (n === null) return t('cellBlank', { row: row + 1, col: col + 1 });
  return t('cellLabel', {
    row: row + 1,
    col: col + 1,
    number: n,
    state: marked ? t('marked') : t('notMarked'),
  });
}

/**
 * Interactive ticket for players, following the ARIA grid pattern: one Tab
 * stop per ticket, arrow keys move between cells, Enter or Space toggles a
 * mark. Returns the element and a function to refresh one cell's mark.
 */
export function renderPlayableTicket(
  ticket: Ticket,
  label: string,
  marked: ReadonlySet<number>,
  onToggle: (n: number) => void,
): { el: HTMLElement; setMarked: (n: number, isMarked: boolean) => void } {
  const cells: HTMLElement[][] = [];
  let focusRow = 0;
  let focusCol = ticket[0].findIndex((c) => c !== null);

  const grid = h('div', { class: 'ticket ticket-grid', role: 'grid', 'aria-label': label });

  ticket.forEach((row, r) => {
    const rowEl = h('div', { class: 'ticket-row', role: 'row' });
    cells[r] = [];
    row.forEach((n, c) => {
      const isMarked = n !== null && marked.has(n);
      const cell = h(
        'div',
        {
          role: 'gridcell',
          class: ['cell', n === null ? 'cell-blank' : 'cell-number-cell', isMarked && 'is-marked']
            .filter(Boolean)
            .join(' '),
          tabindex: r === focusRow && c === focusCol ? 0 : -1,
          'aria-label': cellLabel(r, c, n, isMarked),
          'data-row': r,
          'data-col': c,
        },
        n === null ? null : h('span', { class: 'cell-number', 'aria-hidden': 'true' }, n),
      );
      if (n !== null) {
        cell.addEventListener('click', () => {
          moveFocus(r, c, false);
          onToggle(n);
        });
      }
      cells[r][c] = cell;
      rowEl.appendChild(cell);
    });
    grid.appendChild(rowEl);
  });

  function moveFocus(r: number, c: number, focus = true): void {
    cells[focusRow][focusCol].tabIndex = -1;
    focusRow = r;
    focusCol = c;
    cells[r][c].tabIndex = 0;
    if (focus) cells[r][c].focus();
  }

  grid.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    const r = Number(target.dataset.row);
    const c = Number(target.dataset.col);
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    // Blank cells can be hidden (compact Inclusive Mode layout); skip those.
    const visible = (row: number, col: number) => cells[row][col].offsetParent !== null;
    const step = (dr: number, dc: number): [number, number] => {
      let [nr, nc] = [r + dr, c + dc];
      while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
        if (visible(nr, nc)) return [nr, nc];
        if (dr !== 0) {
          // Moving up/down into a hidden cell: take the nearest visible cell in that row.
          const near = [...Array(COLS).keys()].filter((k) => visible(nr, k)).sort((a, b) => Math.abs(a - c) - Math.abs(b - c))[0];
          if (near !== undefined) return [nr, near];
        }
        [nr, nc] = [nr + dr, nc + dc];
      }
      return [r, c];
    };
    const rowEdge = (fromEnd: boolean): [number, number] => {
      const cols = [...Array(COLS).keys()].filter((k) => visible(r, k));
      return [r, (fromEnd ? cols[cols.length - 1] : cols[0]) ?? c];
    };
    const moves: Record<string, () => [number, number]> = {
      ArrowUp: () => step(-1, 0),
      ArrowDown: () => step(1, 0),
      ArrowLeft: () => step(0, -1),
      ArrowRight: () => step(0, 1),
      Home: () => rowEdge(false),
      End: () => rowEdge(true),
    };
    if (e.key in moves) {
      e.preventDefault();
      moveFocus(...moves[e.key]());
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const n = ticket[r][c];
      if (n !== null) onToggle(n);
    }
  });

  function setMarked(n: number, isMarked: boolean): void {
    ticket.forEach((row, r) =>
      row.forEach((value, c) => {
        if (value !== n) return;
        cells[r][c].classList.toggle('is-marked', isMarked);
        cells[r][c].setAttribute('aria-label', cellLabel(r, c, n, isMarked));
      }),
    );
  }

  return { el: grid, setMarked };
}
