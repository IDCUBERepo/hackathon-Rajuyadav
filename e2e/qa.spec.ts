/**
 * Quality-check suite (UI level). Test titles start with the checklist ID so
 * results map directly onto the QA report. Logic-level checks are in
 * tests/qa.test.ts.
 */
import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { completionIndex } from '../src/core/patterns';
import { generateTicket, ticketNumbers } from '../src/core/ticket';

const GAME = 'QAGD'; // D is at an even alphabet index → a "relaxed" code; rules come from settings.
const CODE = 'DTU53';
const TICKET = generateTicket(GAME, CODE);
const TOP = TICKET[0].filter((n): n is number => n !== null);
const ALL = ticketNumbers(TICKET);
const OTHERS = Array.from({ length: 90 }, (_, i) => i + 1).filter((n) => !ALL.includes(n));
const SHOTS = 'qa-screenshots';
const T0 = new Date('2026-09-26T10:00:00');

/**
 * Fake timers that do not move on their own: after freezeClock() time only
 * advances through clock.runFor(), so timer tests are exact, not racy.
 */
async function installClock(page: Page): Promise<void> {
  await page.clock.install({ time: T0 });
}
async function freezeClock(page: Page): Promise<void> {
  await page.clock.pauseAt(new Date(T0.getTime() + 10 * 60_000));
}
mkdirSync(SHOTS, { recursive: true });

interface Seed {
  called?: number[];
  settings?: Record<string, unknown>;
  winners?: object[];
  ended?: boolean;
  player?: boolean;
  marks?: number[];
  prefs?: object;
}

/** Put a caller game (and optionally a player game) into storage, then load the app. */
async function seed(page: Page, s: Seed = {}): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ s, GAME, CODE }) => {
      localStorage.clear();
      localStorage.setItem(
        'tt:caller',
        JSON.stringify({
          version: 1,
          gameCode: GAME,
          createdAt: 1,
          settings: { settingsVersion: 2, voice: false, ...(s.settings ?? {}) },
          called: s.called ?? [],
          winners: s.winners ?? [],
          ended: s.ended ?? false,
        }),
      );
      if (s.player) {
        localStorage.setItem('tt:player:current', GAME);
        localStorage.setItem(
          `tt:player:${GAME}`,
          JSON.stringify({ version: 1, gameCode: GAME, name: 'Meera', ticketCodes: [CODE, 'DTU54'], marks: { [CODE]: s.marks ?? [], DTU54: [] }, helper: false, hints: false }),
        );
      }
      if (s.prefs) localStorage.setItem('tt:prefs', JSON.stringify(s.prefs));
    },
    { s, GAME, CODE },
  );
  await page.reload();
}

async function go(page: Page, route: string): Promise<void> {
  await page.goto(`/#${route}`);
  await page.locator('h1').first().waitFor({ state: 'attached' });
}

async function openClaim(page: Page, pattern: string, code = CODE, name = ''): Promise<string> {
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText(pattern, { exact: true }).click();
  await dialog.getByLabel('Ticket code').fill(code);
  if (name) await dialog.getByLabel('Player name (optional)').fill(name);
  await dialog.getByRole('button', { name: 'Check ticket' }).click();
  return (await dialog.locator('.result-message, .field-error:visible').first().innerText()).trim();
}

async function closeDialog(page: Page): Promise<void> {
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
}

/** Speech mock: records what would be spoken. `voices` controls which languages exist. */
function mockSpeech(page: Page, voices: string[] = ['en-GB']): Promise<unknown> {
  return page.addInitScript((langs) => {
    const w = window as unknown as Record<string, unknown>;
    w.__spoken = [] as { text: string; lang: string }[];
    const list = langs.map((lang) => ({ lang, name: lang, localService: true, default: false, voiceURI: lang }));
    w.SpeechSynthesisUtterance = class {
      text: string;
      lang = '';
      voice: unknown = null;
      rate = 1;
      volume = 1;
      constructor(text: string) {
        this.text = text;
      }
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => list,
        speak: (u: { text: string; lang: string }) => {
          if (u.text) (w.__spoken as object[]).push({ text: u.text, lang: u.lang });
        },
        cancel() {},
        addEventListener() {},
      },
    });
  }, voices);
}
const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: { text: string; lang: string }[] }).__spoken);

/** Is keyboard focus visibly indicated on the active element? */
async function focusState(page: Page): Promise<{ ok: boolean; what: string }> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return { ok: true, what: 'body' };
    // Hidden radio inputs draw their focus ring on the label.
    const target = el.matches('.radio-option input') ? (el.nextElementSibling as HTMLElement) : el;
    const cs = getComputedStyle(target);
    const ok = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2;
    const what = `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`;
    return { ok, what };
  });
}

async function tabTo(page: Page, match: RegExp, invisible: string[], max = 60): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const f = await focusState(page);
    if (!f.ok) invisible.push(f.what);
    if (match.test(f.what)) return;
  }
  throw new Error(`Could not Tab to ${match}`);
}

/* ------------------------------------------------------------------ B */

test('B2 after 90 numbers the button is disabled and "all called" shows', async ({ page }) => {
  await seed(page, { called: Array.from({ length: 89 }, (_, i) => i + 1) });
  await go(page, '/caller');
  await page.getByRole('button', { name: 'Call Next Number' }).click();
  await expect(page.locator('.called-count')).toHaveText('90 of 90 called');
  await expect(page.getByRole('button', { name: 'Call Next Number' })).toBeDisabled();
  await expect(page.getByText('All 90 numbers have been called.')).toBeVisible();
  await page.locator('body').press('Space');
  await expect(page.locator('.called-count')).toHaveText('90 of 90 called');
});

test('B3 (UI) undo removes only the latest number', async ({ page }) => {
  await seed(page, { called: [5, 50, 77] });
  await go(page, '/caller');
  await page.getByRole('button', { name: 'Undo last number' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, do it' }).click();
  await expect(page.locator('.called-count')).toHaveText('2 of 90 called');
  await expect(page.locator('.board-cell.is-called .board-n')).toHaveText(['5', '50']);
  await expect(page.locator('.current-number')).toHaveText('50');
});

test('B4 undoing a number that completed a win warns and asks first', async ({ page }) => {
  const called = [OTHERS[0], ...TOP];
  await seed(page, {
    called,
    winners: [{ pattern: 'topLine', name: 'Meera', ticketCode: CODE, callCount: called.length, shared: false }],
  });
  await go(page, '/caller');
  await page.getByRole('button', { name: 'Undo last number' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Top Line');
  await expect(dialog).toContainText('Meera');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.prize-won')).toContainText('Won by Meera');
  await page.getByRole('button', { name: 'Undo last number' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, do it' }).click();
  await expect(page.locator('.prize-won')).toHaveCount(0);
  await expect(page.locator('.called-count')).toHaveText(`${called.length - 1} of 90 called`);
});

test('B5 auto-draw calls at the chosen interval and Pause stops it at once', async ({ page }) => {
  await installClock(page);
  await seed(page, { settings: { autoIntervalSec: 5 } });
  await go(page, '/caller');
  await freezeClock(page);
  await page.getByRole('button', { name: 'Start auto-draw' }).click();
  await page.clock.runFor(4_800);
  await expect(page.locator('.called-count')).toHaveText('0 of 90 called');
  await page.clock.runFor(400);
  await expect(page.locator('.called-count')).toHaveText('1 of 90 called');
  await page.clock.runFor(5_000);
  await expect(page.locator('.called-count')).toHaveText('2 of 90 called');
  await page.getByRole('button', { name: 'Pause auto-draw' }).click();
  await page.clock.runFor(30_000);
  await expect(page.locator('.called-count')).toHaveText('2 of 90 called');
  await expect(page.getByText('Auto-draw paused')).toBeVisible();
});

test('B6 Space and Enter call the next number, but not while typing in a text box', async ({ page }) => {
  await seed(page);
  await go(page, '/caller');
  await page.locator('body').press('Space');
  await page.locator('body').press('Enter');
  await expect(page.locator('.called-count')).toHaveText('2 of 90 called');
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  const name = page.getByLabel('Player name (optional)');
  await name.pressSequentially('Asha Rao');
  await name.press('Space');
  await expect(name).toHaveValue('Asha Rao ');
  await page.keyboard.press('Escape');
  await expect(page.locator('.called-count')).toHaveText('2 of 90 called');
});

/* ------------------------------------------------------------------ C / D / E (UI) */

test('C4 (UI) disabled patterns are not offered in the claim check', async ({ page }) => {
  await seed(page, { settings: { patterns: ['earlyFive', 'fullHouse'] }, called: [1] });
  await go(page, '/caller');
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Full House', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Top Line', { exact: true })).toHaveCount(0);
});

test('D4 (UI) a late claim shows "So close!", the completing number and how many calls ago', async ({ page }) => {
  await seed(page, { called: [...TOP, OTHERS[0], OTHERS[1], OTHERS[2]] });
  await go(page, '/caller');
  const msg = await openClaim(page, 'Top Line');
  expect(msg).toContain(`So close! Your Top Line was complete on number ${TOP[4]}`);
  expect(msg).toContain(`Number ${TOP[4]} was called 3 calls ago.`);
});

test('D7 "Check a Claim" pauses auto-draw instantly; the claim is judged at that moment', async ({ page }) => {
  await installClock(page);
  await seed(page, { called: [OTHERS[0], ...TOP], settings: { autoIntervalSec: 5 } });
  await go(page, '/caller');
  await freezeClock(page);
  await page.getByRole('button', { name: 'Start auto-draw' }).click();
  await page.clock.runFor(4_900); // The timer is about to fire…
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  await page.clock.runFor(30_000);
  await expect(page.locator('.called-count')).toHaveText('6 of 90 called');
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Top Line', { exact: true }).click();
  await dialog.getByLabel('Ticket code').fill(CODE);
  await dialog.getByRole('button', { name: 'Check ticket' }).click();
  await expect(dialog.locator('.result-message')).toContainText('We have a winner for Top Line!');
});

test('D8 (UI) without sharing, a second claim for a won pattern gets a clear message', async ({ page }) => {
  await seed(page, {
    called: [...TOP],
    settings: { sharedWinners: false },
    winners: [{ pattern: 'topLine', name: 'Asha', ticketCode: 'ZZZZ2', callCount: 5, shared: false }],
  });
  await go(page, '/caller');
  expect(await openClaim(page, 'Top Line')).toContain('Top Line has already been won by Asha.');
});

test('E2 (UI) a mistyped ticket code shows a friendly error and nothing breaks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await seed(page, { called: [1, 2] });
  await go(page, '/caller');
  const msg = await openClaim(page, 'Top Line', 'AB1');
  expect(msg).toContain('Ticket codes have 5 characters');
  await expect(page.getByLabel('Ticket code')).toHaveAttribute('aria-invalid', 'true');
  // A well-formed but unrelated code is simply "not yet", never a crash.
  await page.getByLabel('Ticket code').fill('WXYZ7');
  await page.getByRole('button', { name: 'Check ticket' }).click();
  await expect(page.getByRole('dialog').locator('.result-message')).toContainText('Not yet!');
  expect(errors).toEqual([]);
});

test('E4 the prize tracker shows Open, Won by <name> and Shared', async ({ page }) => {
  await seed(page, {
    called: [1, 2, 3],
    settings: { sharedWinners: true },
    winners: [
      { pattern: 'topLine', name: 'Asha', ticketCode: 'AAAA2', callCount: 3, shared: false },
      { pattern: 'middleLine', name: 'Ben', ticketCode: 'BBBB2', callCount: 3, shared: false },
      { pattern: 'middleLine', name: 'Chitra', ticketCode: 'CCCC2', callCount: 3, shared: true },
    ],
  });
  await go(page, '/caller');
  const tracker = page.locator('.prize-list');
  await expect(tracker.locator('li', { hasText: 'Top Line' })).toContainText('Won by Asha');
  await expect(tracker.locator('li', { hasText: 'Middle Line' })).toContainText('Shared: Ben, Chitra');
  await expect(tracker.locator('li', { hasText: 'Bottom Line' })).toContainText('Open');
  await expect(tracker.locator('li', { hasText: 'Full House' })).toContainText('Open');
});

test('E5 Full House ends the game with a summary; "second Full House" continues when enabled', async ({ page }) => {
  const other = generateTicket(GAME, 'DTU54');
  const both = [...new Set([...ALL, ...ticketNumbers(other)])];
  // Second Full House enabled: ticket A completes first, then ticket B.
  await seed(page, { settings: { secondFullHouse: true }, called: ALL });
  await go(page, '/caller');
  expect(await openClaim(page, 'Full House', CODE, 'Meera')).toContain('We have a winner for Full House!');
  await closeDialog(page);
  await expect(page.locator('.prize-list li', { hasText: 'Full House' })).toContainText('second prize open');
  await expect(page.getByRole('button', { name: 'Call Next Number' })).toBeEnabled();
  await page.evaluate((called) => {
    const g = JSON.parse(localStorage.getItem('tt:caller')!);
    g.called = called;
    localStorage.setItem('tt:caller', JSON.stringify(g));
  }, [...ALL, ...both.filter((n) => !ALL.includes(n))]);
  await page.reload();
  await go(page, '/caller');
  expect(await openClaim(page, 'Full House', 'DTU54', 'Ravi')).toContain('We have a winner for Full House!');
  await closeDialog(page);
  // Shared winners: closing the dialog leaves the claim window open on the caller screen.
  await page.getByRole('button', { name: 'No more claims — continue' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Game over');
  await expect(page.locator('.winner-list')).toContainText('Meera');
  await expect(page.locator('.winner-list')).toContainText('Ravi');
});

/* ------------------------------------------------------------------ F */

test('F1 join validates the code and name, and offers 1–6 tickets', async ({ page }) => {
  await go(page, '/join');
  await page.getByLabel('Game code').fill('AB1');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.field-error')).toContainText('letters A–Z');
  await page.getByLabel('Game code').fill('ABC');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.field-error')).toContainText('exactly 4 characters');
  await page.getByLabel('Game code').fill('abcd');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.locator('.field-error')).toContainText('Please type your name');
  await page.getByLabel('Your name').fill('Meera');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('radio')).toHaveCount(6);
  await page.getByText('6', { exact: true }).click();
  await page.getByRole('button', { name: 'Get my tickets' }).click();
  await expect(page.getByRole('grid')).toHaveCount(6);
});

test('F2 tapping marks and unmarks a number; blank cells cannot be marked', async ({ page }) => {
  await seed(page, { player: true });
  await go(page, '/player');
  const grid = page.getByRole('grid').first();
  const cell = grid.locator('.cell-number-cell').first();
  await cell.click();
  await expect(cell).toHaveClass(/is-marked/);
  await cell.click();
  await expect(cell).not.toHaveClass(/is-marked/);
  const blank = grid.locator('.cell-blank').first();
  await blank.click();
  await blank.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(grid.locator('.is-marked')).toHaveCount(0);
  await expect(blank).toHaveAttribute('aria-label', /blank$/);
});

test('F3 marking helper marks a number on the ticket, or says it is not there', async ({ page }) => {
  await seed(page, { player: true });
  await go(page, '/player');
  await page.getByLabel('Marking helper').check();
  await page.getByLabel('Number you heard').fill(String(ALL[3]));
  await page.getByRole('button', { name: 'Mark it' }).click();
  await expect(page.locator('.helper-result')).toContainText(`Marked ${ALL[3]}`);
  const both = new Set([...ALL, ...ticketNumbers(generateTicket(GAME, 'DTU54'))]);
  const absent = OTHERS.find((n) => !both.has(n))!;
  await page.getByLabel('Number you heard').fill(String(absent));
  await page.getByRole('button', { name: 'Mark it' }).click();
  await expect(page.locator('.helper-result')).toContainText(`${absent} is not on your ticket`);
});

test('F4 pattern hints only appear when turned on and never claim', async ({ page }) => {
  await seed(page, { player: true, marks: TOP });
  await go(page, '/player');
  await expect(page.locator('.hint-banner')).toBeHidden();
  await page.getByLabel('Pattern hints').check();
  await expect(page.locator('.hint-banner')).toContainText('Top Line may be complete');
  const caller = await page.evaluate(() => JSON.parse(localStorage.getItem('tt:caller')!));
  expect(caller.winners).toEqual([]);
  await page.getByLabel('Pattern hints').uncheck();
  await expect(page.locator('.hint-banner')).toBeHidden();
});

test('F5 players see the strict-claim reminder when Strict claim is ON', async ({ browser }) => {
  const reminders: string[] = [];
  for (const strict of [true, false]) {
    const caller = await (await browser.newContext()).newPage();
    await go(caller, '/caller/setup');
    const box = caller.getByLabel(/Strict claim/);
    if (strict) await box.check();
    else await box.uncheck();
    await caller.getByRole('button', { name: 'Start game' }).click();
    const code = (await caller.locator('.game-code-value').innerText()).trim();
    const player = await (await browser.newContext()).newPage();
    await joinAs(player, code, 'Meera', 1);
    reminders.push(await player.locator('.claim-reminder').innerText());
  }
  expect(reminders[0]).toContain('Shout “Claim!” before the next number is called, or your claim won’t count.');
  expect(reminders[1]).not.toContain('before the next number');
});

async function joinAs(page: Page, code: string, name: string, tickets: number): Promise<void> {
  await go(page, '/join');
  await page.getByLabel('Game code').fill(code);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText(String(tickets), { exact: true }).click();
  await page.getByRole('button', { name: 'Get my tickets' }).click();
  await expect(page.getByRole('grid')).toHaveCount(tickets);
}

/* ------------------------------------------------------------------ G */

test('G1 refreshing the caller restores numbers, winners and settings; auto-draw comes back paused', async ({ page }) => {
  await installClock(page);
  await seed(page, {
    called: [OTHERS[0], ...TOP],
    settings: { autoIntervalSec: 5, prizes: { topLine: '₹100' } },
    winners: [{ pattern: 'topLine', name: 'Meera', ticketCode: CODE, callCount: 6, shared: false }],
  });
  await go(page, '/caller');
  await freezeClock(page);
  await page.getByRole('button', { name: 'Start auto-draw' }).click();
  await page.clock.runFor(5_100);
  await expect(page.locator('.called-count')).toHaveText('7 of 90 called');
  const board = await page.locator('.board-cell.is-called .board-n').allInnerTexts();
  await page.reload();
  await expect(page.locator('.called-count')).toHaveText('7 of 90 called');
  expect(await page.locator('.board-cell.is-called .board-n').allInnerTexts()).toEqual(board);
  await expect(page.locator('.prize-won')).toContainText('Won by Meera');
  await expect(page.locator('.prize-list')).toContainText('₹100');
  await expect(page.getByRole('button', { name: 'Start auto-draw' })).toBeVisible();
  await page.clock.runFor(30_000);
  await expect(page.locator('.called-count')).toHaveText('7 of 90 called');
});

test('G2 refreshing the player restores tickets and marks', async ({ page }) => {
  await seed(page, { player: true });
  await go(page, '/player');
  const codes = await page.locator('.ticket-code [aria-hidden="true"]').allInnerTexts();
  const cells = page.locator('.cell-number-cell');
  await cells.nth(0).click();
  await cells.nth(7).click();
  await page.reload();
  expect(await page.locator('.ticket-code [aria-hidden="true"]').allInnerTexts()).toEqual(codes);
  await expect(page.locator('.is-marked')).toHaveCount(2);
});

for (const [label, script] of [
  ['unavailable', () => Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('Denied', 'SecurityError'); } })],
  ['full', () => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; }],
] as const) {
  test(`G3 localStorage ${label}: a notice shows and the game still works`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(script);
    await go(page, '/caller/setup');
    await expect(page.getByRole('alert')).toContainText('not saving data');
    await page.getByRole('button', { name: 'Start game' }).click();
    await page.getByRole('button', { name: 'Call Next Number' }).click();
    await expect(page.locator('.called-count')).toHaveText('1 of 90 called');
    await go(page, '/join');
    expect(errors).toEqual([]);
  });
}

test('G4 after the first load the app works offline', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await ctx.setOffline(true);
  await page.reload();
  await page.getByRole('link', { name: /I'm the Caller/ }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.getByRole('button', { name: 'Call Next Number' }).click();
  await expect(page.locator('.called-count')).toHaveText('1 of 90 called');
  await ctx.close();
});

test('G5 a new game clears the old game but keeps the saved settings', async ({ page }) => {
  await go(page, '/caller/setup');
  await page.getByLabel('Announce numbers out loud').uncheck();
  await page.getByText('Traditional:', { exact: false }).click();
  await page.getByRole('button', { name: 'Start game' }).click();
  const firstCode = (await page.locator('.game-code-value').innerText()).trim();
  await page.getByRole('button', { name: 'Call Next Number' }).click();
  await page.getByRole('button', { name: 'New game' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, do it' }).click();
  await expect(page).toHaveURL(/caller\/setup/);
  expect(await page.evaluate(() => localStorage.getItem('tt:caller'))).toBeNull();
  await expect(page.getByLabel('Announce numbers out loud')).not.toBeChecked();
  await expect(page.getByRole('radio', { name: /Traditional/ })).toBeChecked();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('.called-count')).toHaveText('0 of 90 called');
  expect((await page.locator('.game-code-value').innerText()).trim()).not.toBe(firstCode);
});

/* ------------------------------------------------------------------ H */

test('H1 each drawn number is announced once, in the chosen style', async ({ page }) => {
  await mockSpeech(page);
  for (const style of ['plain', 'traditional'] as const) {
    await seed(page, { settings: { voice: true, callStyle: style } });
    await go(page, '/caller');
    await page.evaluate(() => ((window as unknown as { __spoken: unknown[] }).__spoken.length = 0));
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Call Next Number' }).click();
    const said = await spoken(page);
    expect(said).toHaveLength(3);
    const current = await page.locator('.current-number').innerText();
    const last = said[2].text;
    if (style === 'plain') expect(last).toMatch(new RegExp(`^Number ${current} … `));
    else expect(last).toMatch(new RegExp(`^[A-Z].* … ${current}$`));
  }
});

test('H2 "Repeat" re-announces the current number', async ({ page }) => {
  await mockSpeech(page);
  await seed(page, { settings: { voice: true } });
  await go(page, '/caller');
  await page.getByRole('button', { name: 'Call Next Number' }).click();
  await page.getByRole('button', { name: 'Repeat' }).click();
  const said = await spoken(page);
  expect(said).toHaveLength(2);
  expect(said[1].text).toBe(said[0].text);
});

test('H3a with no speech engine a notice shows and the game continues silently', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined }));
  await go(page, '/caller/setup');
  await expect(page.getByText('This browser cannot speak out loud')).toBeVisible();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByText('This browser cannot speak out loud')).toBeVisible();
  await page.getByRole('button', { name: 'Call Next Number' }).click();
  await page.getByRole('button', { name: 'Repeat' }).click();
  await expect(page.locator('.called-count')).toHaveText('1 of 90 called');
  expect(errors).toEqual([]);
});

test('H3b with no Hindi voice a notice shows and English is used', async ({ page }) => {
  await mockSpeech(page, ['en-GB']);
  await go(page, '/caller/setup');
  await page.getByText('हिन्दी (Hindi)').click();
  await expect(page.getByText('No Hindi voice was found')).toBeVisible();
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.getByText('No Hindi voice was found')).toBeVisible();
  await page.getByRole('button', { name: 'Call Next Number' }).click();
  const said = await spoken(page);
  expect(said[0].lang).toMatch(/^en/);
  expect(said[0].text).toMatch(/^Number \d+/);
});

test('H3c with a Hindi voice, numbers are spoken in Hindi', async ({ page }) => {
  await mockSpeech(page, ['en-GB', 'hi-IN']);
  await go(page, '/caller/setup');
  await page.getByText('हिन्दी (Hindi)').click();
  await expect(page.getByText('No Hindi voice was found')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.getByRole('button', { name: 'Call Next Number' }).click();
  const said = await spoken(page);
  expect(said[0].lang).toBe('hi-IN');
  expect(said[0].text).toMatch(/^नंबर /);
});

/* ------------------------------------------------------------------ I */

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('I1 axe: no serious or critical violations on the main screens', async ({ page }) => {
  await seed(page, { called: [3, 17, 22, 45], player: true, marks: [TOP[0]] });
  const report: string[] = [];
  const all: string[] = [];
  const check = async (name: string) => {
    const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    for (const v of result.violations) {
      all.push(`${name}: ${v.id} (${v.impact})`);
      if (v.impact === 'serious' || v.impact === 'critical') report.push(`${name}: ${v.id} (${v.impact})`);
    }
  };
  for (const [name, route] of [
    ['home', '/'],
    ['caller setup', '/caller/setup'],
    ['caller game', '/caller'],
    ['player tickets', '/player'],
    ['how to play', '/how'],
    ['settings', '/settings'],
  ]) {
    await go(page, route);
    await check(name);
  }
  await go(page, '/caller');
  await openClaim(page, 'Top Line');
  await check('claim check');
  console.log('I1 all violations:', all.length ? all.join('; ') : 'none');
  expect(report).toEqual([]);
});

test('I2 a whole game can be played with the keyboard only, with focus always visible', async ({ browser }) => {
  const invisible: string[] = [];
  const caller = await (await browser.newContext()).newPage();
  await go(caller, '/caller/setup');
  await tabTo(caller, /Start game/, invisible);
  await caller.keyboard.press('Enter');
  await expect(caller.locator('.game-code-value')).toBeVisible();
  const code = (await caller.locator('.game-code-value').innerText()).trim();
  await caller.keyboard.press('Space');
  await caller.keyboard.press('Space');
  await expect(caller.locator('.called-count')).toHaveText('2 of 90 called');

  // Player joins and marks with the keyboard.
  const player = await (await browser.newContext()).newPage();
  await go(player, '/join');
  await player.keyboard.type(code);
  await player.keyboard.press('Enter');
  await player.keyboard.type('Meera');
  await player.keyboard.press('Enter');
  await player.keyboard.press('ArrowRight'); // 2 tickets
  await player.keyboard.press('Enter');
  await expect(player.getByRole('grid')).toHaveCount(2);
  await tabTo(player, /^div "Row/, invisible);
  const before = await player.evaluate(() => document.activeElement!.getAttribute('aria-label'));
  await player.keyboard.press('Space');
  const after = await player.evaluate(() => document.activeElement!.getAttribute('aria-label'));
  expect(before).toMatch(/not marked$/);
  expect(after).toMatch(/, marked$/);
  await player.keyboard.press('ArrowDown');
  await player.keyboard.press('ArrowRight');
  const f = await focusState(player);
  if (!f.ok) invisible.push(f.what);
  const ticketCode = (await player.locator('.ticket-code [aria-hidden="true"]').first().innerText()).trim();

  // Caller checks the claim with the keyboard.
  await tabTo(caller, /Check a Claim/, invisible);
  await caller.keyboard.press('Enter');
  await expect(caller.getByLabel('Ticket code')).toBeFocused();
  await caller.keyboard.type(ticketCode);
  await caller.keyboard.press('Enter');
  await expect(caller.getByRole('dialog').locator('.result-message')).toBeVisible();
  await tabTo(caller, /Check another claim/, invisible);
  await caller.keyboard.press('Escape');
  await expect(caller.getByRole('dialog')).toHaveCount(0);

  // End the game with the keyboard.
  await tabTo(caller, /End game/, invisible);
  await caller.keyboard.press('Enter');
  await caller.keyboard.press('Tab'); // Cancel → Yes
  await caller.keyboard.press('Enter');
  await expect(caller.getByRole('heading', { level: 1 })).toContainText('Game over');
  expect(invisible).toEqual([]);
});

test('I3 called numbers and claim results are announced in aria-live regions', async ({ page }) => {
  await seed(page, { called: [OTHERS[0], ...TOP.slice(0, 4)] });
  await go(page, '/caller');
  await expect(page.locator('#live-polite')).toHaveAttribute('aria-live', 'polite');
  await expect(page.locator('#live-assertive')).toHaveAttribute('aria-live', 'assertive');
  await page.getByRole('button', { name: 'Call Next Number' }).click();
  const current = await page.locator('.current-number').innerText();
  await expect(page.locator('#live-polite')).toHaveText(`Number ${current}`);
  const result = await openClaim(page, 'Early Five');
  // While the claim dialog is open, the page behind it is inert, so the result
  // is announced in the dialog's own assertive live region.
  const live = page.getByRole('dialog').locator('[data-live="assertive"]');
  await expect(live).toHaveAttribute('aria-live', 'assertive');
  await expect(live).toContainText(result.replace(/^\W+/u, '').slice(0, 20));
});

test('I4 ticket cells have labels like "Row 1, column 3, number 24, marked"', async ({ page }) => {
  await seed(page, { player: true, marks: [TICKET[0].find((n) => n !== null)!] });
  await go(page, '/player');
  const labels = await page.getByRole('grid').first().getByRole('gridcell').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  expect(labels).toHaveLength(27);
  for (const l of labels) expect(l).toMatch(/^Row [1-3], column [1-9], (number \d{1,2}, (marked|not marked)|blank)$/);
  expect(labels.filter((l) => l!.endsWith(', marked'))).toHaveLength(1);
});

for (const theme of ['light', 'contrast'] as const) {
  test(`I5 marked and called states use more than colour (${theme} theme)`, async ({ page }) => {
    await seed(page, { called: [TOP[0]], player: true, marks: [TOP[0]], prefs: { theme, textSize: 0 } });
    await go(page, '/caller');
    const board = await page.locator('.board-cell.is-called').first().evaluate((el) => ({
      tick: getComputedStyle(el, '::after').content,
      weight: getComputedStyle(el).fontWeight,
    }));
    expect(board.tick).toContain('✓');
    expect(Number(board.weight)).toBeGreaterThanOrEqual(700);
    await go(page, '/player');
    const dab = await page.locator('.cell.is-marked').first().evaluate((el) => {
      const s = getComputedStyle(el, '::after');
      return { width: parseFloat(s.borderTopWidth), style: s.borderTopStyle, radius: s.borderTopLeftRadius };
    });
    expect(dab.width).toBeGreaterThanOrEqual(3);
    expect(dab.style).toBe('solid');
    const blank = await page.locator('.cell-blank').first().evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(blank).toContain('repeating-linear-gradient');
    await page.screenshot({ path: `${SHOTS}/I5-player-${theme}.png` });
  });
}

test('I6 text size A / A+ / A++ works, is saved, and nothing overflows at A++', async ({ page }) => {
  await seed(page, { called: [1, 2, 3], player: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await go(page, '/settings');
  for (const [label, px] of [['Large text', 20], ['Normal text', 18], ['Extra large text', 23]] as const) {
    await page.getByRole('radio', { name: label, exact: true }).check({ force: true });
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(px);
  }
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.text)).toBe('2');
  const overflow: string[] = [];
  for (const route of ['/', '/caller/setup', '/caller', '/player', '/join', '/how', '/settings', '/soon', '/caller/print']) {
    await go(page, route);
    const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (w > 0) overflow.push(`${route} +${w}px`);
    await page.screenshot({ path: `${SHOTS}/I6-${route.replace(/\//g, '_') || 'home'}-A++.png`, fullPage: true });
  }
  expect(overflow).toEqual([]);
});

test('I7 with reduced motion, the number animation is off', async ({ page }) => {
  // Control: normal motion animates the new number.
  await seed(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await go(page, '/caller');
  await page.getByRole('button', { name: 'Call Next Number' }).click();
  await expect(page.locator('.current-number')).toHaveClass(/pop/);
  // Reduced motion: no animation class and no CSS animation at all.
  await seed(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await go(page, '/caller');
  await page.getByRole('button', { name: 'Call Next Number' }).click();
  await expect(page.locator('.current-number')).not.toHaveClass(/pop/);
  expect(await page.locator('.current-number').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});

test('I7b confetti appears for a winner normally, and not with reduced motion', async ({ page }) => {
  for (const motion of ['no-preference', 'reduce'] as const) {
    await seed(page, { called: [OTHERS[0], ...TOP] });
    await page.emulateMedia({ reducedMotion: motion });
    await go(page, '/caller');
    expect(await openClaim(page, 'Top Line')).toContain('We have a winner');
    await expect(page.locator('.confetti')).toHaveCount(motion === 'reduce' ? 0 : 1);
  }
});

test('I8 Light, Dark and High Contrast themes apply (and "match my device" follows the system)', async ({ page }) => {
  await go(page, '/settings');
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.getByRole('radio', { name: 'Light' }).check({ force: true });
  expect(await bg()).toBe('rgb(255, 247, 236)');
  await page.getByRole('radio', { name: 'Dark' }).check({ force: true });
  expect(await bg()).toBe('rgb(23, 17, 13)');
  await page.getByRole('radio', { name: 'High contrast' }).check({ force: true });
  expect(await bg()).toBe('rgb(0, 0, 0)');
  await page.reload();
  expect(await bg()).toBe('rgb(0, 0, 0)');
  await page.getByRole('radio', { name: 'Match my device' }).check({ force: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await bg()).toBe('rgb(23, 17, 13)');
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await bg()).toBe('rgb(255, 247, 236)');
});

/** Horizontal overflow and overlapping interactive elements on the current page. */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const extra = document.documentElement.scrollWidth - window.innerWidth;
    if (extra > 0) problems.push(`horizontal scroll +${extra}px`);
    const els = [...document.querySelectorAll<HTMLElement>('button, a[href], input:not([type=radio]), select, label, [role=gridcell]')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !e.classList.contains('skip-link') && getComputedStyle(e).visibility !== 'hidden';
    });
    const name = (e: HTMLElement) => `${e.tagName.toLowerCase()}"${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 20)}"`;
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j];
        if (a.contains(b) || b.contains(a)) continue;
        const r = a.getBoundingClientRect(), s = b.getBoundingClientRect();
        const w = Math.min(r.right, s.right) - Math.max(r.left, s.left);
        const h = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
        if (w > 1 && h > 1) problems.push(`overlap ${name(a)} × ${name(b)}`);
      }
    }
    return problems;
  });
}

test('I9 no horizontal scrolling or overlapping controls at 360, 768, 1280 and 1920 (TV)', async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, { called: [3, 17, 22, 45, 61, 88], player: true, marks: [TOP[0]] });
  const problems: string[] = [];
  const routes = ['/', '/caller/setup', '/caller', '/player', '/join', '/how', '/settings', '/soon', '/caller/print'];
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await go(page, route);
      problems.push(...(await layoutProblems(page)).map((p) => `${width}px ${route}: ${p}`));
      await page.screenshot({ path: `${SHOTS}/I9-${width}${route.replace(/\//g, '_') || '_home'}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await go(page, '/caller/tv');
  problems.push(...(await layoutProblems(page)).map((p) => `1920px TV: ${p}`));
  // A TV shows one screen: everything, including the controls, must fit without scrolling.
  const tvOverflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  if (tvOverflow > 0) problems.push(`1920px TV: vertical scroll +${tvOverflow}px (controls off-screen)`);
  await page.screenshot({ path: `${SHOTS}/I9-1920-tv.png` });
  expect(problems).toEqual([]);
});

test('I10 all buttons and button-like controls are at least 48×48px', async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, { called: [3, 17], player: true });
  const small: string[] = [];
  const cellSizes = new Set<string>();
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/caller/setup', '/caller', '/caller/tv', '/player', '/join', '/how', '/settings', '/soon', '/caller/print']) {
      await go(page, route);
      const found = await page.evaluate(() => {
        const sel = 'button, a[href], [role=button], .radio-option label, .check-row label, input[type=range], input[type=text], input[type=number]';
        return [...document.querySelectorAll<HTMLElement>(sel)]
          .filter((e) => !e.classList.contains('skip-link') && e.getBoundingClientRect().width > 0)
          .map((e) => ({ what: `${e.tagName.toLowerCase()}"${(e.textContent ?? '').trim().slice(0, 24)}"`, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height }))
          .filter((b) => b.w < 47.5 || b.h < 47.5)
          .map((b) => `${b.what} ${Math.round(b.w)}×${Math.round(b.h)}`);
      });
      small.push(...found.map((f) => `${width}px ${route}: ${f}`));
      if (route === '/player') {
        const box = await page.locator('.cell-number-cell').first().boundingBox();
        cellSizes.add(`${width}px: ${Math.round(box!.width)}×${Math.round(box!.height)}`);
      }
    }
  }
  console.log('I10 ticket cell sizes:', [...cellSizes].join(', '));
  expect(small).toEqual([]);
});

test('I11 Coming Soon items are visible, badged and cannot be activated', async ({ page }) => {
  await go(page, '/soon');
  const items = page.locator('.soon-item');
  await expect(items).toHaveCount(10);
  for (let i = 0; i < 10; i++) {
    await expect(items.nth(i)).toBeVisible();
    await expect(items.nth(i)).toHaveAttribute('aria-disabled', 'true');
    await expect(items.nth(i).locator('.badge')).toHaveText('Coming Soon');
  }
  const before = page.url();
  const html = await page.locator('main').innerHTML();
  // force: Playwright refuses to click aria-disabled items, but a real user can - that's what we test.
  await items.first().click({ force: true });
  await items.nth(3).focus();
  await page.keyboard.press('Enter');
  expect(page.url()).toBe(before);
  expect(await page.locator('main').innerHTML()).toBe(html);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

/* ------------------------------------------------------------------ J */

async function drawUntil(caller: Page, needed: number[]): Promise<void> {
  for (let i = 0; i < 90; i++) {
    const called = new Set((await caller.locator('.board-cell.is-called .board-n').allInnerTexts()).map(Number));
    if (needed.every((n) => called.has(n))) return;
    await caller.getByRole('button', { name: 'Call Next Number' }).click();
  }
  throw new Error('ran out of numbers');
}

const calledOrder = (caller: Page) => caller.evaluate(() => JSON.parse(localStorage.getItem('tt:caller')!).called as number[]);

async function fullGame(browser: Browser) {
  const caller = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await go(caller, '/caller/setup');
  await caller.getByRole('button', { name: 'Start game' }).click();
  const gameCode = (await caller.locator('.game-code-value').innerText()).trim();
  return { caller, player, gameCode };
}

test('J1–J5 full game across two browsers: join, valid, late, not-yet, Full House, summary', async ({ browser }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  const { caller, player, gameCode } = await fullGame(browser);
  caller.on('pageerror', (e) => errors.push(String(e)));
  player.on('pageerror', (e) => errors.push(String(e)));

  // J1: a player joins with 2 tickets.
  await joinAs(player, gameCode, 'Meera', 2);
  const codes = (await player.locator('.ticket-code [aria-hidden="true"]').allInnerTexts()).map((c) => c.trim());
  const grids = player.getByRole('grid');
  const t1All = (await grids.nth(0).locator('.cell-number').allInnerTexts()).map(Number);
  const t1Top = (await grids.nth(0).getByRole('row').first().locator('.cell-number').allInnerTexts()).map(Number);
  const t2All = (await grids.nth(1).locator('.cell-number').allInnerTexts()).map(Number);
  expect(codes).toHaveLength(2);
  expect(generateTicket(gameCode, codes[0]).flat().filter((n) => n !== null)).toEqual(t1All);

  // J2: draw until ticket 1's Top Line completes, claim at once → VALID.
  await drawUntil(caller, t1Top);
  expect(await openClaim(caller, 'Top Line', codes[0], 'Meera')).toContain('We have a winner for Top Line!');
  await closeDialog(caller);

  // J3: one more number, then claim a pattern that was already complete → LATE.
  await caller.getByRole('button', { name: 'Call Next Number' }).click();
  const order = await calledOrder(caller);
  const idx = completionIndex(generateTicket(gameCode, codes[0]), order, 'earlyFive');
  const late = await openClaim(caller, 'Early Five', codes[0], 'Meera');
  expect(late).toContain(`So close! Your Early Five was complete on number ${order[idx]}`);
  const ago = order.length - 1 - idx;
  expect(late).toContain(ago === 1 ? '1 call ago' : `${ago} calls ago`);
  await closeDialog(caller);

  // J4: claim a pattern that is really incomplete right now → rejected with the missing numbers.
  // (Which one depends on the random draw, so pick it from the actual game state.)
  const calledNow = new Set(await calledOrder(caller));
  const rowsOf = (code: string) => generateTicket(gameCode, code).map((r) => r.filter((n): n is number => n !== null));
  const candidates = [
    { code: codes[1], pattern: 'Full House', nums: t2All },
    ...rowsOf(codes[1]).map((nums, r) => ({ code: codes[1], pattern: ['Top Line', 'Middle Line', 'Bottom Line'][r], nums })),
    { code: codes[0], pattern: 'Full House', nums: t1All },
  ];
  const target = candidates.find((c) => c.nums.some((n) => !calledNow.has(n)))!;
  const missing = target.nums.filter((n) => !calledNow.has(n));
  const notYet = await openClaim(caller, target.pattern, target.code, 'Meera');
  expect(notYet).toContain('Not yet!');
  const listed = notYet.split(': ')[1].split(', ').map(Number);
  expect(listed.sort((a, b) => a - b)).toEqual([...missing].sort((a, b) => a - b));
  await closeDialog(caller);

  // J5: draw until a ticket's Full House completes, claim at once → game over,
  // and the summary lists all winners correctly.
  const fhIndex = t1All.some((n) => !calledNow.has(n)) ? 0 : 1;
  const fhNumbers = fhIndex === 0 ? t1All : t2All;
  expect(fhNumbers.some((n) => !calledNow.has(n)), 'a Full House is still open').toBe(true);
  await drawUntil(caller, fhNumbers);
  expect(await openClaim(caller, 'Full House', codes[fhIndex], 'Meera')).toContain('We have a winner for Full House!');
  await caller.getByRole('dialog').getByRole('button', { name: 'No more claims — continue' }).click();
  await expect(caller.getByRole('heading', { level: 1 })).toContainText('Game over');
  const winners = caller.locator('.winner-list li');
  await expect(winners).toHaveCount(2);
  await expect(winners.nth(0)).toContainText(`Top Line: Meera (${codes[0]})`);
  await expect(winners.nth(1)).toContainText(`Full House: Meera (${codes[fhIndex]})`);
  expect(errors).toEqual([]);
});
