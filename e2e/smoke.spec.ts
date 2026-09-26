import { expect, test, type Page } from '@playwright/test';

/**
 * One complete game across two browsers: the caller creates a game, a player
 * joins on a separate device, numbers are drawn, an invalid and a valid claim
 * are checked, both sides survive a refresh, Full House ends the game, and the
 * app keeps working offline.
 */

async function calledNumbers(caller: Page): Promise<Set<number>> {
  const texts = await caller.locator('.board-cell.is-called .board-n').allInnerTexts();
  return new Set(texts.map(Number));
}

/** Draw until every number in `needed` has been called. */
async function drawUntil(caller: Page, needed: number[]): Promise<void> {
  for (let i = 0; i < 90; i++) {
    const called = await calledNumbers(caller);
    if (needed.every((n) => called.has(n))) return;
    await caller.getByRole('button', { name: 'Call Next Number' }).click();
  }
  throw new Error('Ran out of numbers');
}

async function checkClaim(caller: Page, pattern: string, code: string, name: string): Promise<string> {
  await caller.getByRole('button', { name: 'Check a Claim' }).click();
  const dialog = caller.getByRole('dialog');
  await dialog.getByText(pattern, { exact: true }).click();
  await dialog.getByLabel('Ticket code').fill(code.toLowerCase());
  await dialog.getByLabel('Player name (optional)').fill(name);
  await dialog.getByRole('button', { name: 'Check ticket' }).click();
  const message = (await dialog.locator('.result-message').innerText()).trim();
  await dialog.getByRole('button', { name: 'Close' }).click();
  return message;
}

test('a full game from setup to summary', async ({ browser }) => {
  const errors: string[] = [];
  const callerCtx = await browser.newContext();
  const playerCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const caller = await callerCtx.newPage();
  const player = await playerCtx.newPage();
  for (const p of [caller, player]) p.on('pageerror', (e) => errors.push(String(e)));

  // Caller sets up a game.
  await caller.goto('/');
  await caller.getByRole('link', { name: /I'm the Caller/ }).click();
  await caller.getByRole('button', { name: 'Start game' }).click();
  const gameCode = (await caller.locator('.game-code-value').innerText()).trim();
  expect(gameCode).toMatch(/^[A-Z2-9]{4}$/);

  // Player joins on another device.
  await player.goto('/');
  await player.getByRole('link', { name: /I'm a Player/ }).click();
  await player.getByLabel('Game code').fill(gameCode);
  await player.getByRole('button', { name: 'Next' }).click();
  await player.getByLabel('Your name').fill('Meera');
  await player.getByRole('button', { name: 'Next' }).click();
  await player.getByRole('button', { name: 'Get my tickets' }).click();
  await expect(player.getByRole('grid')).toHaveCount(1);

  const ticketCode = (await player.locator('.ticket-code [aria-hidden="true"]').innerText()).trim();
  const grid = player.getByRole('grid');
  const topRow = (await grid.getByRole('row').first().locator('.cell-number').allInnerTexts()).map(Number);
  const allNumbers = (await grid.locator('.cell-number').allInnerTexts()).map(Number);
  expect(topRow).toHaveLength(5);
  expect(allNumbers).toHaveLength(15);

  // An early, invalid claim gets a kind message listing what is missing.
  await caller.getByRole('button', { name: 'Call Next Number' }).click();
  const early = await checkClaim(caller, 'Top Line', ticketCode, 'Meera');
  expect(early).toContain('Not yet!');

  // Refresh mid-game on both devices: nothing is lost.
  await player.locator('.cell-number-cell').first().click();
  const countBefore = await caller.locator('.called-count').innerText();
  await caller.reload();
  await player.reload();
  await expect(caller.locator('.called-count')).toHaveText(countBefore);
  await expect(caller.locator('.game-code-value')).toHaveText(gameCode);
  await expect(player.locator('.is-marked')).toHaveCount(1);

  // Draw until the top line is complete, then claim it.
  await drawUntil(caller, topRow);
  const topLine = await checkClaim(caller, 'Top Line', ticketCode, 'Meera');
  expect(topLine).toContain('We have a winner for Top Line!');
  await expect(caller.locator('.prize-won')).toContainText('Won by Meera');

  // Full House ends the game and shows the summary.
  await drawUntil(caller, allNumbers);
  const fullHouse = await checkClaim(caller, 'Full House', ticketCode, 'Meera');
  expect(fullHouse).toContain('We have a winner for Full House!');
  // Shared winners: the game ends once the caller confirms there are no more claims.
  // (If Top Line was also won on this same number, its window is listed too.)
  await caller
    .locator('.claims-open', { hasText: 'Full House' })
    .getByRole('button', { name: 'No more claims — continue' })
    .click();
  await expect(caller.getByRole('heading', { level: 1 })).toContainText('Game over');
  await expect(caller.locator('.winner-list')).toContainText('Top Line');
  await expect(caller.locator('.winner-list')).toContainText('Full House');

  expect(errors).toEqual([]);
});

test('works offline after the first load', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // Now controlled by the service worker.
  await ctx.setOffline(true);
  await page.reload();
  await expect(page.getByRole('link', { name: /I'm the Caller/ })).toBeVisible();
  await page.getByRole('link', { name: /I'm the Caller/ }).click();
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();
  await ctx.close();
});
