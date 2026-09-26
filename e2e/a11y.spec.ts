import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * axe-core (the engine behind Lighthouse's accessibility score) on every
 * screen, including the ones that need a game in progress, in all three
 * themes. Fails on any WCAG 2.x A/AA violation.
 */

const CALLER_GAME = {
  version: 1,
  gameCode: 'ABCT',
  createdAt: 1,
  settings: { voice: false, prizes: { fullHouse: '₹500' } },
  called: [3, 17, 22, 45, 61, 88],
  winners: [{ pattern: 'earlyFive', name: 'Asha', ticketCode: 'TTU53', callCount: 6, shared: false }],
  ended: false,
};
const PLAYER_GAME = {
  version: 1,
  gameCode: 'ABCT',
  name: 'Meera',
  ticketCodes: ['TTU53', 'TTU54'],
  marks: { TTU53: [26, 37, 51, 61, 71], TTU54: [15] },
  helper: true,
  hints: true,
};

async function seed(page: Page, theme: string, ended = false): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ caller, player, theme }) => {
      localStorage.setItem('tt:caller', JSON.stringify(caller));
      localStorage.setItem('tt:player:ABCT', JSON.stringify(player));
      localStorage.setItem('tt:player:current', 'ABCT');
      localStorage.setItem('tt:prefs', JSON.stringify({ theme, textSize: 0 }));
    },
    { caller: { ...CALLER_GAME, ended }, player: PLAYER_GAME, theme },
  );
  await page.reload();
}

async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`);
}

const ROUTES = ['/', '/caller/setup', '/caller', '/caller/tv', '/caller/print', '/player', '/join', '/how', '/settings', '/soon'];

for (const theme of ['light', 'dark', 'contrast']) {
  test(`no WCAG violations on any screen (${theme} theme)`, async ({ page }) => {
    await seed(page, theme);
    const found: string[] = [];
    for (const route of ROUTES) {
      await page.goto(`/#${route}`);
      await page.locator('h1').first().waitFor();
      found.push(...(await violations(page)).map((v) => `${route} ${v}`));
    }

    // The claim dialog with a result showing.
    await page.goto('/#/caller');
    await page.getByRole('button', { name: 'Check a Claim' }).click();
    await page.getByLabel('Ticket code').fill('TTU53');
    await page.getByRole('button', { name: 'Check ticket' }).click();
    found.push(...(await violations(page)).map((v) => `claim-dialog ${v}`));
    await page.keyboard.press('Escape');

    // The end-of-game summary.
    await seed(page, theme, true);
    await page.goto('/#/caller');
    found.push(...(await violations(page)).map((v) => `summary ${v}`));

    expect(found).toEqual([]);
  });
}

test('the whole caller screen can be operated by keyboard', async ({ page }) => {
  await seed(page, 'light');
  await page.goto('/#/caller');
  await page.locator('body').press('Space');
  await expect(page.locator('.called-count')).toHaveText('7 of 90 called');
  // Tab reaches the main controls in a logical order.
  const order: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''));
  }
  const idx = (label: string) => order.findIndex((t) => t.includes(label));
  expect(idx('Call Next Number')).toBeGreaterThanOrEqual(0);
  expect(idx('Call Next Number')).toBeLessThan(idx('Start auto-draw'));
  expect(idx('Start auto-draw')).toBeLessThan(idx('Check a Claim'));
  // Enter on a focused button activates it rather than drawing a number.
  await page.getByRole('button', { name: 'Check a Claim' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Ticket code')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.called-count')).toHaveText('7 of 90 called');
});
