/**
 * L. Full game with many players. PLAYER_COUNT (default 5) players join one
 * caller: most by opening the QR code's join link, Player 1 by typing the
 * code, and Player 2 in Inclusive Mode. Numbers are drawn at random, so the
 * ticket codes and draw order are logged to reproduce any failure.
 */
import { test, type BrowserContext, type Page } from '@playwright/test';
import { generateTicket, ticketNumbers } from '../src/core/ticket';
import { calledOrder, consoleWatch, decodeQr, expect, go, mockSpeech, note, spoken } from './support';

const PLAYER_COUNT = Number(process.env.PLAYER_COUNT ?? 5);
const POINTS = 100;

interface Player {
  name: string;
  page: Page;
  code: string;
  numbers: number[];
  top: number[];
}

async function openClaimDialog(caller: Page, pattern: string): Promise<void> {
  await caller.getByRole('button', { name: 'Check a Claim' }).click();
  await caller.getByRole('dialog').getByText(pattern, { exact: true }).click();
}

async function submit(caller: Page, p: Player): Promise<string> {
  const dialog = caller.getByRole('dialog');
  await dialog.getByLabel('Ticket code').fill(p.code);
  await dialog.getByLabel('Player name (optional)').fill(p.name);
  await dialog.getByRole('button', { name: 'Check ticket' }).click();
  return (await dialog.locator('.result-message').innerText()).trim();
}

async function another(caller: Page): Promise<void> {
  await caller.getByRole('dialog').getByRole('button', { name: 'Check another claim' }).first().click();
}

test('L full game: one caller, PLAYER_COUNT players via QR and typing, Top Line, Full House, reload', async ({ browser }, info) => {
  test.setTimeout(600_000);
  const watch = consoleWatch();
  const mobile = !!info.project.use.isMobile;
  const contexts: BrowserContext[] = [];
  const newPage = async (phone: boolean) => {
    const ctx = await browser.newContext(phone && !mobile ? { viewport: { width: 390, height: 844 } } : {});
    contexts.push(ctx);
    return ctx.newPage();
  };

  // 1. The caller creates a game: Strict claim ON, Shared winners ON, default patterns.
  const caller = await newPage(false);
  watch.attach(caller, 'caller');
  await mockSpeech(caller);
  await go(caller, '/caller/setup');
  await expect(caller.getByLabel('Strict claim', { exact: false })).toBeChecked();
  await expect(caller.getByLabel('Shared winners', { exact: false })).toBeChecked();
  await caller.getByLabel('Top Line: Points (optional)').fill(String(POINTS));
  await caller.getByLabel('Full House: Points (optional)').fill(String(POINTS));
  await caller.getByRole('button', { name: 'Start game' }).click();
  const gameCode = (await caller.locator('.game-code-value').innerText()).trim();
  const link = await decodeQr(caller, '.game-code .qr');
  expect(link).toBe(`${info.project.use.baseURL}/?game=${gameCode}`);

  // The TV window (another tab of the caller's browser) follows the caller.
  const tv = await caller.context().newPage();
  watch.attach(tv, 'tv');
  await go(tv, '/caller/tv');

  // 2. Players join: Player 1 types the code, everyone else opens the QR link.
  const players: Player[] = [];
  for (let i = 1; i <= PLAYER_COUNT; i++) {
    const name = `Player ${i}`;
    const page = await newPage(true);
    watch.attach(page, name);
    if (i === 2) {
      await go(page, '/');
      await page.getByRole('switch', { name: /Inclusive Mode/ }).click();
      await expect(page.getByRole('switch', { name: /Inclusive Mode/ })).toHaveAttribute('aria-checked', 'true');
    }
    if (i === 1) {
      await go(page, '/join');
      await page.getByLabel('Game code').fill(gameCode.toLowerCase());
      await page.getByRole('button', { name: 'Next' }).click();
    } else {
      await page.goto(link!);
      await expect(page.getByText(`Game ${gameCode} ✓`)).toBeVisible();
    }
    await page.getByLabel('Your name').fill(name);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('radio', { name: '1 ticket' })).toBeChecked();
    await page.getByRole('button', { name: 'Get my tickets' }).click();
    await expect(page.getByRole('grid')).toHaveCount(1);
    expect(page.url()).not.toContain('?game=');

    // 3. Read the ticket code and numbers; they must match the generator.
    const code = (await page.locator('.ticket-code [aria-hidden="true"]').innerText()).trim();
    const numbers = (await page.locator('.cell-number').allInnerTexts()).map(Number);
    const ticket = generateTicket(gameCode, code);
    expect(numbers).toEqual(ticketNumbers(ticket));
    players.push({ name, page, code, numbers, top: ticket[0].filter((n): n is number => n !== null) });
  }
  expect(new Set(players.map((p) => p.code)).size, 'all ticket codes differ').toBe(PLAYER_COUNT);
  expect(new Set(players.map((p) => p.numbers.join())).size, 'all tickets differ').toBe(PLAYER_COUNT);
  note(info, 'game', gameCode);
  note(info, 'tickets', players.map((p) => `${p.name}=${p.code}`).join(', '));

  const drawOne = async (): Promise<number> => {
    await caller.getByRole('button', { name: 'Call Next Number' }).click();
    const order = await calledOrder(caller);
    const n = order[order.length - 1];
    // 5. Every player with that number taps it, and sees it marked.
    for (const p of players.filter((p) => p.numbers.includes(n))) {
      const cell = p.page.locator(`[role=gridcell][aria-label*="number ${n},"]`);
      await cell.click();
      await expect(cell).toHaveClass(/is-marked/);
    }
    return n;
  };
  const has = (called: Set<number>, nums: number[]) => nums.every((n) => called.has(n));

  try {
    // 4–6. Call numbers until someone's top row is complete, then check it at once.
    let called = new Set<number>();
    let topWinners: Player[] = [];
    while (topWinners.length === 0) {
      await drawOne();
      called = new Set(await calledOrder(caller));
      topWinners = players.filter((p) => has(called, p.top));
    }
    const topNumber = [...called].pop();
    await openClaimDialog(caller, 'Top Line');
    for (const [i, p] of topWinners.entries()) {
      if (i > 0) await another(caller);
      const r = await submit(caller, p);
      expect(r).toContain(i === 0 ? 'We have a winner for Top Line!' : 'Top Line is shared!');
    }
    // 7. Banner, voice, prize tracker and TV winners board.
    await expect(caller.locator('.winner-banner')).toContainText(topWinners[topWinners.length - 1].name);
    const topNames = topWinners.map((p) => p.name);
    expect((await spoken(caller)).some((s) => topNames.every((n) => s.includes(n)))).toBe(true);
    for (const n of topNames) await expect(tv.locator('.tv-winners')).toContainText(n);

    // 8. Negative check: a player without a complete Top Line is told what's missing.
    const loser = players.find((p) => !has(called, p.top))!;
    const missing = loser.top.filter((n) => !called.has(n));
    await another(caller);
    const r = await submit(caller, loser);
    expect(r).toContain('Not yet!');
    expect(r.split(': ')[1].split(', ').map(Number).sort((a, b) => a - b)).toEqual(missing.sort((a, b) => a - b));

    // 9. "No more claims — continue", then keep calling.
    await caller.getByRole('dialog').getByRole('button', { name: 'No more claims — continue' }).click();
    await expect(caller.getByRole('dialog')).toHaveCount(0);
    for (const n of topNames) await expect(caller.locator('.prizes')).toContainText(n);

    // 10. Continue until a DIFFERENT player completes Full House; claim it at once.
    let fhWinners: Player[] = [];
    while (fhWinners.length === 0) {
      await drawOne();
      called = new Set(await calledOrder(caller));
      // Only newly complete tickets are on time (strict claim).
      fhWinners = players.filter((p) => !topWinners.includes(p) && has(called, p.numbers));
    }
    await openClaimDialog(caller, 'Full House');
    for (const [i, p] of fhWinners.entries()) {
      if (i > 0) await another(caller);
      expect(await submit(caller, p)).toContain(i === 0 ? 'We have a winner for Full House!' : 'Full House is shared!');
    }
    await caller.getByRole('dialog').getByRole('button', { name: 'No more claims — continue' }).click();

    // 11. The game ends; the summary lists every winner, pattern and points.
    await expect(caller.getByRole('heading', { level: 1 })).toContainText('Game over');
    const summary = caller.locator('.winner-list');
    const each = (k: number) => Math.round(POINTS / k);
    for (const p of topWinners) await expect(summary).toContainText(`Top Line: ${p.name} (${p.code}) · ${each(topWinners.length)} points`);
    for (const p of fhWinners) await expect(summary).toContainText(`Full House: ${p.name} (${p.code}) · ${each(fhWinners.length)} points`);
    await expect(summary.locator('li')).toHaveCount(topWinners.length + fhWinners.length);

    // 12. Reload everyone: nothing changes, and nothing more can be called.
    const summaryText = await summary.innerText();
    const order = await calledOrder(caller);
    const marksBefore = await Promise.all(players.map((p) => p.page.locator('.is-marked .cell-number').allInnerTexts()));
    await caller.reload();
    await expect(caller.locator('.winner-list')).toHaveText(summaryText);
    expect(await calledOrder(caller)).toEqual(order);
    await expect(caller.locator('.board-cell.is-called')).toHaveCount(order.length);
    await expect(caller.getByRole('button', { name: 'Call Next Number' })).toHaveCount(0);
    for (const [i, p] of players.entries()) {
      await p.page.reload();
      await expect(p.page.locator('.ticket-code [aria-hidden="true"]')).toHaveText(p.code);
      expect(await p.page.locator('.is-marked .cell-number').allInnerTexts()).toEqual(marksBefore[i]);
      // Marks are exactly the called numbers on the ticket.
      expect(marksBefore[i].map(Number).sort((a, b) => a - b)).toEqual(p.numbers.filter((n) => order.includes(n)).sort((a, b) => a - b));
    }
    note(info, 'top line', `${topNames.join(' & ')} on ${topNumber}`);
    note(info, 'full house', fhWinners.map((p) => p.name).join(' & '));
    note(info, 'order', order.join(','));
    expect(watch.problems).toEqual([]);
  } finally {
    note(info, 'called', (await calledOrder(caller).catch(() => [])).join(','));
    await Promise.all(contexts.map((c) => c.close()));
  }
});
