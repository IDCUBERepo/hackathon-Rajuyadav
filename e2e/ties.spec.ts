import { expect, test, type Page } from '@playwright/test';
import { findTie } from '../tests/helpers';

/** Several players claiming the same pattern on the same number, in the real UI. */

const GAME = 'TIEG';
const LINE = findTie(GAME, 3, 'topLine');
const FULL = findTie(GAME, 2, 'fullHouse', 7);
const NAMES = ['Asha', 'Ben', 'Chitra'];

async function seed(page: Page, called: number[], settings: Record<string, unknown>): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ called, settings, GAME }) => {
      localStorage.clear();
      localStorage.setItem(
        'tt:caller',
        JSON.stringify({ version: 1, gameCode: GAME, createdAt: 1, settings: { settingsVersion: 3, voice: false, ...settings }, called, winners: [], ended: false }),
      );
    },
    { called, settings, GAME },
  );
  await page.reload();
  await page.goto('/#/caller');
}

/** Fill the (already open) claim form and submit it. */
async function claimIn(page: Page, pattern: string, code: string, name: string): Promise<string> {
  const dialog = page.getByRole('dialog');
  await dialog.getByText(pattern, { exact: true }).click();
  await dialog.getByLabel('Ticket code').fill(code);
  await dialog.getByLabel('Player name (optional)').fill(name);
  await dialog.getByRole('button', { name: 'Check ticket' }).click();
  return (await dialog.locator('.result-message').innerText()).trim();
}

test('setup: shared winners ON with "Split the prize"; turning sharing OFF shows the warning', async ({ page }) => {
  await page.goto('/#/caller/setup');
  const shared = page.getByLabel(/Shared winners/);
  await expect(shared).toBeChecked();
  await expect(page.getByRole('radio', { name: /Split the prize/ })).toBeChecked();
  const warning = page.getByText('Only the first ticket you check will win, even if players shout at the same time.');
  await expect(warning).toBeHidden();
  await shared.uncheck();
  await expect(warning).toBeVisible();
  await expect(page.getByRole('radio', { name: /Split the prize/ })).toBeHidden();
  await shared.check();
  await expect(warning).toBeHidden();
});

test('three players tie: each claim is recorded, then "No more claims" closes it; 100 points split 33 each', async ({ page }) => {
  await seed(page, LINE.called, { points: { topLine: 100 } });
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  const dialog = page.getByRole('dialog');
  for (let i = 0; i < 3; i++) {
    const msg = await claimIn(page, 'Top Line', LINE.codes[i], NAMES[i]);
    expect(msg).toContain(i === 0 ? 'We have a winner for Top Line!' : 'Top Line is shared!');
    await expect(dialog.getByRole('heading', { name: `Any more claims for Top Line on number ${LINE.number}?` })).toBeVisible();
    if (i < 2) await dialog.getByRole('button', { name: 'Check another claim' }).first().click();
  }
  await dialog.getByRole('button', { name: 'No more claims — continue' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.prize-list li', { hasText: 'Top Line' })).toContainText(
    'Shared: Asha (33 pts), Ben (33 pts), Chitra (33 pts)',
  );
  // The pattern is closed for this number.
  await expect(page.locator('.claims-banner')).toBeHidden();
});

test('tie-breaker draw: Call Next waits; "Finish checking claims" picks one winner and announces it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page, LINE.called, { tieMode: 'draw', points: { topLine: 100 } });
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  await claimIn(page, 'Top Line', LINE.codes[0], 'Asha');
  await page.getByRole('dialog').getByRole('button', { name: 'Check another claim' }).first().click();
  await claimIn(page, 'Top Line', LINE.codes[1], 'Ben');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // The claim window stays open on the caller screen; no new number until the draw.
  await expect(page.locator('.claims-banner')).toContainText(`Claims are still open for Top Line on number ${LINE.number}`);
  await expect(page.getByText('Finish checking claims before calling the next number.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Call Next Number' })).toBeDisabled();
  await expect(page.locator('.prize-list')).toContainText('tie-breaker to come');

  await page.locator('.claims-banner').getByRole('button', { name: 'Finish checking claims' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.result-message')).toContainText(/(Asha|Ben) wins the tie-breaker for Top Line!/);
  // Announced in the open dialog's own live region (the page behind a modal is inert).
  await expect(dialog.locator('[data-live="polite"]')).toContainText('wins the tie-breaker');
  const winner = (await dialog.locator('.tie-name').innerText()).trim();
  const loser = winner === 'Asha' ? 'Ben' : 'Asha';
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.prize-list li', { hasText: 'Top Line' })).toContainText(`${winner} (100 pts, won the draw)`);
  await expect(page.locator('.prize-list li', { hasText: 'Top Line' })).toContainText(`${loser} (0 pts)`);
  await expect(page.getByRole('button', { name: 'Call Next Number' })).toBeEnabled();
});

test('"Everyone gets the full prize": each tied winner gets 100 points', async ({ page }) => {
  await seed(page, LINE.called, { tieMode: 'full', points: { topLine: 100 } });
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  await claimIn(page, 'Top Line', LINE.codes[0], 'Asha');
  await page.getByRole('dialog').getByRole('button', { name: 'Check another claim' }).first().click();
  await claimIn(page, 'Top Line', LINE.codes[1], 'Ben');
  await page.getByRole('dialog').getByRole('button', { name: 'No more claims — continue' }).click();
  await expect(page.locator('.prize-list li', { hasText: 'Top Line' })).toContainText('Shared: Asha (100 pts), Ben (100 pts)');
});

test('sharing OFF: the first valid ticket wins and the second is told the prize is taken', async ({ page }) => {
  await seed(page, LINE.called, { sharedWinners: false, points: { topLine: 100 } });
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  expect(await claimIn(page, 'Top Line', LINE.codes[0], 'Asha')).toContain('We have a winner');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /Any more claims/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Check another claim' }).click();
  expect(await claimIn(page, 'Top Line', LINE.codes[1], 'Ben')).toContain('Top Line has already been won by Asha.');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.prize-list li', { hasText: 'Top Line' })).toContainText('Won by Asha (100 pts)');
});

test('a claim after the next number is called is late, even while sharing is on', async ({ page }) => {
  await seed(page, LINE.called, {});
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  await claimIn(page, 'Top Line', LINE.codes[0], 'Asha');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Call Next Number' }).click();
  await expect(page.locator('.claims-banner')).toBeHidden();
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  expect(await claimIn(page, 'Top Line', LINE.codes[1], 'Ben')).toContain(`So close! Your Top Line was complete on number ${LINE.number}`);
});

test('shared Full House: the game ends after "No more claims" and the summary shows everyone with points', async ({ page }) => {
  await seed(page, FULL.called, { points: { fullHouse: 100 } });
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  await claimIn(page, 'Full House', FULL.codes[0], 'Asha');
  await expect(page.getByRole('dialog')).not.toContainText('the game is over');
  await page.getByRole('dialog').getByRole('button', { name: 'Check another claim' }).first().click();
  await claimIn(page, 'Full House', FULL.codes[1], 'Ben');
  await page.getByRole('dialog').getByRole('button', { name: 'No more claims — continue' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Game over');
  const winners = page.locator('.winner-list li');
  await expect(winners).toHaveCount(2);
  await expect(winners.nth(0)).toContainText(`Full House: Asha (${FULL.codes[0]}) · 50 points`);
  await expect(winners.nth(1)).toContainText(`Full House: Ben (${FULL.codes[1]}) · 50 points`);
});
