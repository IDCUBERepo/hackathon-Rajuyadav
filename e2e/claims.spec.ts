import { expect, test, type Page } from '@playwright/test';
import { generateTicket } from '../src/core/ticket';

/** Strict claim in the real UI, using ticket DTU53 in game ABCD. */
const TICKET = generateTicket('ABCD', 'DTU53');
const TOP_LINE = TICKET[0].filter((n): n is number => n !== null);
// Two numbers that are not on the ticket, to draw after the line is complete.
const [X, Y] = Array.from({ length: 90 }, (_, i) => i + 1).filter((n) => !TICKET.flat().includes(n));

async function seedCaller(page: Page, called: number[], settings: object = {}): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ called, settings }) => {
      localStorage.setItem(
        'tt:caller',
        JSON.stringify({ version: 1, gameCode: 'ABCD', createdAt: 1, settings: { voice: false, ...settings }, called, winners: [], ended: false }),
      );
    },
    { called, settings },
  );
  await page.reload();
  await page.goto('/#/caller');
}

async function submitClaim(page: Page, pattern: string): Promise<string> {
  const dialog = page.getByRole('dialog');
  await dialog.getByText(pattern, { exact: true }).click();
  await dialog.getByLabel('Ticket code').fill('DTU53');
  await dialog.getByRole('button', { name: 'Check ticket' }).click();
  return (await dialog.locator('.result-message').innerText()).trim();
}

test('"Check a Claim" pauses auto-draw at once and judges the claim at that moment', async ({ page }) => {
  await seedCaller(page, [X, ...TOP_LINE], { autoIntervalSec: 5 });
  await page.getByRole('button', { name: 'Start auto-draw' }).click();
  await page.waitForTimeout(3500); // Close to the next automatic draw.
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  await page.waitForTimeout(3000); // Auto-draw would have fired by now.
  await expect(page.locator('.called-count')).toHaveText('6 of 90 called');
  expect(await submitClaim(page, 'Top Line')).toContain('We have a winner for Top Line!');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Resume auto-draw' })).toBeVisible();
});

test('a late claim gets a kind message with the completing number and how long ago', async ({ page }) => {
  await seedCaller(page, [...TOP_LINE, X, Y]);
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  const message = await submitClaim(page, 'Top Line');
  expect(message).toContain(`So close! Your Top Line was complete on number ${TOP_LINE[4]}, but the claim came late.`);
  expect(message).toContain(`Number ${TOP_LINE[4]} was called 2 calls ago.`);
});

test('with Strict claim OFF a late claim still wins', async ({ page }) => {
  await seedCaller(page, [...TOP_LINE, X, Y], { strictClaim: false });
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  expect(await submitClaim(page, 'Top Line')).toContain('We have a winner for Top Line!');
});

test('setup shows Strict claim ON, and players see the matching reminder', async ({ browser }) => {
  const ctx = await browser.newContext();
  const caller = await ctx.newPage();
  await caller.goto('/#/caller/setup');
  const strict = caller.getByLabel(/Strict claim/);
  await expect(strict).toBeChecked();
  await expect(caller.getByText('Turn this off for relaxed family games')).toBeVisible();

  // Strict game → strict reminder for players.
  await caller.getByRole('button', { name: 'Start game' }).click();
  const strictCode = (await caller.locator('.game-code-value').innerText()).trim();

  // Relaxed game → normal reminder. The choice is remembered for next time.
  await caller.goto('/#/caller/setup');
  await caller.getByLabel(/Strict claim/).uncheck();
  await caller.getByRole('button', { name: 'Start game' }).click();
  const relaxedCode = (await caller.locator('.game-code-value').innerText()).trim();
  await caller.goto('/#/caller/setup');
  await expect(caller.getByLabel(/Strict claim/)).not.toBeChecked();

  const player = await (await browser.newContext()).newPage();
  for (const [code, expected] of [
    [strictCode, 'before the next number is called, or your claim won’t count'],
    [relaxedCode, 'Shout “Claim!” straight away'],
  ]) {
    await player.goto('/#/join');
    await player.getByLabel('Game code').fill(code);
    await player.getByRole('button', { name: 'Next' }).click();
    await player.getByLabel('Your name').fill('Meera');
    await player.getByRole('button', { name: 'Next' }).click();
    await player.getByRole('button', { name: 'Get my tickets' }).click();
    await expect(player.locator('.claim-reminder')).toContainText(expected);
    await player.evaluate(() => localStorage.clear());
  }
});

test('old saved settings are migrated to Strict claim ON once', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('tt:lastSettings', JSON.stringify({ voice: false, strictClaim: false })));
  await page.reload();
  await page.goto('/#/caller/setup');
  await expect(page.getByLabel(/Strict claim/)).toBeChecked();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tt:lastSettings') ?? '{}'));
  // Saved back straight away with the current settings version (3 since shared winners became the default).
  expect(saved).toMatchObject({ settingsVersion: 3, strictClaim: true, voice: false });
});

test('How to Play explains the strict claim rule', async ({ page }) => {
  await page.goto('/#/how');
  await expect(page.getByRole('heading', { name: /strict claim rule/ })).toBeVisible();
  await expect(page.getByText('before the caller calls the next number')).toBeVisible();
});
