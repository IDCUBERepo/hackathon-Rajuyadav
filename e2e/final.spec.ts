/**
 * X. Final release checks on top of the SPEC.md quality checklist: production
 * build from a sub-folder, PWA install/offline/update, zoom and reflow,
 * orientation, a long auto-draw game, two tabs, storage edge cases, rapid
 * input, a second Full House, Inclusive Mode across a whole game, and the
 * browser console. IDs match the report.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { generateTicket, ticketNumbers } from '../src/core/ticket';
import { calledOrder, consoleWatch, decodeQr, expect, go, layoutProblems, mockSpeech, note, spoken } from './support';

const GAME = 'QAGD';
const CODE = 'DTU53';
const TICKET = generateTicket(GAME, CODE);
const ALL = ticketNumbers(TICKET);
const TOP = TICKET[0].filter((n): n is number => n !== null);
const T0 = new Date('2026-09-26T10:00:00');

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
          settings: { settingsVersion: 3, voice: false, ...(s.settings ?? {}) },
          called: s.called ?? [],
          winners: s.winners ?? [],
          ended: s.ended ?? false,
        }),
      );
      if (s.player) {
        localStorage.setItem('tt:player:current', GAME);
        localStorage.setItem(
          `tt:player:${GAME}`,
          JSON.stringify({ version: 1, gameCode: GAME, name: 'Meera', ticketCodes: [CODE], marks: { [CODE]: s.marks ?? [] }, helper: false, hints: false }),
        );
      }
      if (s.prefs) localStorage.setItem('tt:prefs', JSON.stringify(s.prefs));
    },
    { s, GAME, CODE },
  );
  await page.reload();
}

const callNext = (page: Page) => page.getByRole('button', { name: 'Call Next Number' }).click();

async function claim(page: Page, pattern: string, code: string, name = ''): Promise<string> {
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText(pattern, { exact: true }).click();
  await dialog.getByLabel('Ticket code').fill(code);
  if (name) await dialog.getByLabel('Player name (optional)').fill(name);
  await dialog.getByRole('button', { name: 'Check ticket' }).click();
  return (await dialog.locator('.result-message').innerText()).trim();
}

/** Close the claim dialog: "No more claims" when the claim window is open, otherwise Close. */
async function finishClaim(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog');
  const noMore = dialog.getByRole('button', { name: 'No more claims — continue' });
  if (await noMore.count()) await noMore.click();
  else await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** The caller's game as the app has it, and the board as shown. Must agree and have no duplicates. */
async function consistency(page: Page): Promise<{ called: number[]; board: number }> {
  const called = await calledOrder(page);
  const board = await page.locator('.board-cell.is-called').count();
  expect(new Set(called).size, 'no duplicate numbers').toBe(called.length);
  expect(board, 'board matches the saved game').toBe(called.length);
  await expect(page.locator('.called-count')).toHaveText(`${called.length} of 90 called`);
  return { called, board };
}

/* ------------------------------------------------------------------ X2 */

test('X2 the production build works from a sub-folder (/tambola/), including the QR join link', async ({ browser }, info) => {
  const base = 'http://localhost:4174/tambola/';
  const ctx = await browser.newContext({ baseURL: undefined });
  const caller = await ctx.newPage();
  const failed: string[] = [];
  caller.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
  await caller.goto(`${base}#/caller/setup`);
  await caller.getByRole('button', { name: 'Start game' }).click();
  const gameCode = (await caller.locator('.game-code-value').innerText()).trim();
  const link = await decodeQr(caller, '.game-code .qr');
  expect(link).toBe(`${base}?game=${gameCode}`);
  note(info, 'join link', link!);

  // The link opens the join screen with the code filled in, straight from the sub-folder.
  const pctx = await browser.newContext({ baseURL: undefined });
  const player = await pctx.newPage();
  player.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
  await player.goto(link!);
  await expect(player.getByText(`Game ${gameCode} ✓`)).toBeVisible();
  await player.getByLabel('Your name').fill('Sub');
  await player.getByRole('button', { name: 'Next' }).click();
  await player.getByRole('button', { name: 'Get my tickets' }).click();
  await expect(player.getByRole('grid')).toHaveCount(1);
  expect(player.url()).toBe(`${base}#/player`);
  await player.reload();
  await expect(player.getByRole('grid')).toHaveCount(1);

  // The service worker is scoped to the sub-folder.
  if (await player.evaluate(() => 'serviceWorker' in navigator)) {
    const scope = await player.evaluate(() => navigator.serviceWorker.ready.then((r) => r.scope));
    expect(scope).toBe(base);
  }
  expect(failed).toEqual([]);
  await ctx.close();
  await pctx.close();
});

/* ------------------------------------------------------------------ X3 */

test('X3a the web manifest is valid and every icon loads at its stated size', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  expect(href).toBe('./manifest.webmanifest');
  const res = await request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m).toMatchObject({ name: 'Tambola Together', start_url: './', scope: './', display: 'standalone' });
  expect(m.short_name.length).toBeLessThanOrEqual(12);
  expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(m.icons.some((i: { purpose: string }) => i.purpose.includes('maskable'))).toBe(true);
  for (const icon of [...m.icons, { src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]) {
    const r = await request.get(`/${icon.src}`);
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()['content-type']).toContain(icon.type);
    if (icon.sizes !== 'any') {
      const [w, h] = await page.evaluate(async (src) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        return [img.naturalWidth, img.naturalHeight];
      }, icon.src);
      expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
    }
  }
});

test('X3b the service worker installs, precaches the app, and an in-progress game survives offline', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  test.skip(!(await page.evaluate(() => 'serviceWorker' in navigator)), 'no service worker support in this browser');
  const state = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.active?.state));
  expect(state).toBe('activated');
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find((k) => k.startsWith('tambola-'))!);
    return { keys, urls: (await cache.keys()).map((r) => new URL(r.url).pathname) };
  });
  expect(cached.keys.filter((k) => k.startsWith('tambola-'))).toHaveLength(1);
  expect(cached.urls).toEqual(expect.arrayContaining(['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']));
  expect(cached.urls.some((u) => /\/assets\/.*\.js$/.test(u))).toBe(true);
  expect(cached.urls.some((u) => /\/assets\/.*\.css$/.test(u))).toBe(true);

  await page.reload();
  await go(page, '/caller/setup');
  await page.getByRole('button', { name: 'Start game' }).click();
  await callNext(page);
  await callNext(page);
  const before = await calledOrder(page);
  await ctx.setOffline(true);
  await page.reload();
  await expect(page.locator('.called-count')).toHaveText('2 of 90 called');
  await callNext(page);
  expect((await calledOrder(page)).slice(0, 2)).toEqual(before);
  await ctx.setOffline(false);
  await ctx.close();
});

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

/** A tiny static host whose content can be swapped, to simulate deploying a new build. */
function host(getRoot: () => string): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url!, 'http://x').pathname);
    const file = join(getRoot(), path === '/' ? 'index.html' : path);
    if (!existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` })));
}

test('X3c after a new build is deployed, the app updates on the next visit and keeps the game', async ({ browser }, info) => {
  test.setTimeout(120_000);
  // Build A is today's dist/. Build B is the same with a new marker and a new cache version.
  const a = mkdtempSync(join(tmpdir(), 'tt-a-'));
  const b = mkdtempSync(join(tmpdir(), 'tt-b-'));
  cpSync('dist', a, { recursive: true });
  cpSync('dist', b, { recursive: true });
  writeFileSync(join(b, 'index.html'), readFileSync(join(b, 'index.html'), 'utf8').replace('<head>', '<head>\n<meta name="tt-build" content="B">'));
  writeFileSync(join(b, 'sw.js'), readFileSync(join(b, 'sw.js'), 'utf8').replace(/tambola-[0-9a-f]{12}/, 'tambola-newbuild0001'));
  let root = a;
  const { server, url } = await host(() => root);
  const ctx = await browser.newContext({ baseURL: url });
  const page = await ctx.newPage();
  try {
    await page.goto('/');
    test.skip(!(await page.evaluate(() => 'serviceWorker' in navigator)), 'no service worker support in this browser');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await go(page, '/caller/setup');
    await page.getByRole('button', { name: 'Start game' }).click();
    for (let i = 0; i < 3; i++) await callNext(page);
    const game = await page.evaluate(() => localStorage.getItem('tt:caller'));
    const build = () => page.evaluate(() => document.querySelector('meta[name="tt-build"]')?.getAttribute('content') ?? 'A');

    root = b; // Deploy.
    await go(page, '/caller'); // Next visit.
    const firstVisit = await build();
    await expect(page.locator('.called-count')).toHaveText('3 of 90 called');
    await expect
      .poll(() => page.evaluate(() => caches.keys()), { timeout: 15_000 })
      .toEqual(['tambola-newbuild0001']); // New cache installed, old one removed.
    await go(page, '/caller'); // The visit after that.
    const secondVisit = await build();
    note(info, 'build shown', `first visit after deploy: ${firstVisit}; second visit: ${secondVisit}`);
    expect(secondVisit).toBe('B');
    expect(await page.evaluate(() => localStorage.getItem('tt:caller'))).toBe(game);
    await expect(page.locator('.called-count')).toHaveText('3 of 90 called');
    expect.soft(firstVisit, 'the very next visit shows the new build').toBe('B');
  } finally {
    await ctx.close();
    server.close();
  }
});

/* ------------------------------------------------------------------ X4 */

const ROUTES = ['/', '/caller/setup', '/caller', '/caller/tv', '/caller/print', '/player', '/join', '/how', '/settings', '/soon'];

async function everyScreen(page: Page, check: (where: string) => Promise<void>): Promise<void> {
  await seed(page, { called: [5, 17, 42, 63, 88], player: true, marks: [ALL[0]] });
  for (const route of ROUTES) {
    await go(page, route);
    await check(route);
  }
  await go(page, '/caller');
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  await page.getByRole('dialog').getByLabel('Ticket code').fill(CODE);
  await page.getByRole('dialog').getByRole('button', { name: 'Check ticket' }).click();
  await check('claim dialog');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Full-screen QR' }).click();
  await check('full-screen QR');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await seed(page, { called: ALL, ended: true, winners: [{ pattern: 'fullHouse', name: 'Meera', ticketCode: CODE, callCount: 15, shared: false }] });
  await go(page, '/caller');
  await check('summary');
}

/** Dialogs taller than the screen must scroll, not cut their content off. */
async function dialogCutOff(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('dialog[open]')]
      .filter((d) => {
        const cs = getComputedStyle(d);
        return d.scrollHeight > d.clientHeight + 1 && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll';
      })
      .map(() => 'dialog content cut off'),
  );
}

for (const [label, viewport] of [
  ['200% zoom (1280×800 at 200% = 640×400 CSS px)', { width: 640, height: 400 }],
  ['320px width (reflow)', { width: 320, height: 640 }],
] as const) {
  test(`X4 ${label}: every screen usable, nothing cut off, no sideways scrolling`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    const problems: string[] = [];
    await everyScreen(page, async (where) => {
      problems.push(...[...(await layoutProblems(page)), ...(await dialogCutOff(page))].map((p) => `${where}: ${p}`));
    });
    expect(problems).toEqual([]);
  });
}

test('X4 320px width with Inclusive Mode on: player screen has no sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await seed(page, { player: true, prefs: { theme: 'contrast', textSize: 2, inclusive: true, beforeInclusive: { theme: 'system', textSize: 0, players: {} } } });
  await go(page, '/player');
  expect(await layoutProblems(page)).toEqual([]);
});

/* ------------------------------------------------------------------ X5 */

const SIZES = {
  phone: { portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } },
  tablet: { portrait: { width: 820, height: 1180 }, landscape: { width: 1180, height: 820 } },
};

for (const [device, size] of Object.entries(SIZES)) {
  test(`X5 ${device}: caller, TV and player work in portrait and landscape, and rotating mid-game keeps everything`, async ({ browser }) => {
    test.setTimeout(180_000);
    const cctx = await browser.newContext({ viewport: size.portrait });
    const caller = await cctx.newPage();
    const tv = await cctx.newPage();
    const pctx = await browser.newContext({ viewport: size.portrait });
    const player = await pctx.newPage();
    await seed(caller, { called: ALL.slice(0, 4) });
    await seed(player, { player: true });
    await go(caller, '/caller');
    await go(tv, '/caller/tv');
    await go(player, '/player');
    for (const n of ALL.slice(0, 4)) await player.locator(`[role=gridcell][aria-label*="number ${n},"]`).click();
    await caller.getByRole('button', { name: 'Start auto-draw' }).click();

    const problems: string[] = [];
    const check = async (orientation: string) => {
      for (const [name, page] of [['caller', caller], ['tv', tv], ['player', player]] as const) {
        problems.push(...(await layoutProblems(page)).map((p) => `${orientation} ${name}: ${p}`));
      }
      await expect(caller.getByRole('button', { name: 'Call Next Number' })).toBeVisible();
      await expect(tv.locator('.current-number')).toBeInViewport();
      // The whole ticket is visible across the screen.
      for (const cell of await player.locator('.cell-number-cell').all()) await expect(cell).toBeInViewport({ ratio: 0.9 });
    };
    await check('portrait');
    const before = { called: await calledOrder(caller), marks: await player.locator('.is-marked .cell-number').allInnerTexts() };
    await caller.getByRole('button', { name: 'Pause auto-draw' }).click();
    const paused = await calledOrder(caller);

    for (const page of [caller, tv, player]) await page.setViewportSize(size.landscape); // Rotate.
    await check('landscape');
    expect(await calledOrder(caller)).toEqual(paused);
    expect(paused.slice(0, before.called.length)).toEqual(before.called);
    expect(await player.locator('.is-marked .cell-number').allInnerTexts()).toEqual(before.marks);
    await expect(tv.locator('.called-count')).toHaveText(`${paused.length} of 90 called`);
    await callNext(caller);
    await expect(tv.locator('.called-count')).toHaveText(`${paused.length + 1} of 90 called`);
    for (const page of [caller, tv, player]) await page.setViewportSize(size.portrait); // And back.
    expect(await player.locator('.is-marked .cell-number').allInnerTexts()).toEqual(before.marks);
    await consistency(caller);
    expect(problems).toEqual([]);
    await cctx.close();
    await pctx.close();
  });
}

/* ------------------------------------------------------------------ X6 */

test('X6 a full 90-number game on auto-draw at the fastest interval: no errors, no growth, no slowdown', async ({ page }, info) => {
  test.setTimeout(300_000);
  const watch = consoleWatch();
  watch.attach(page, 'caller');
  await mockSpeech(page);
  await page.clock.install({ time: T0 });
  await seed(page, { settings: { voice: true, autoIntervalSec: 5 } });
  await page.clock.pauseAt(new Date(T0.getTime() + 60_000));
  await go(page, '/caller');
  await page.getByRole('button', { name: 'Start auto-draw' }).click();

  const heap = async () => {
    if (info.project.name !== 'chromium' && info.project.name !== 'pixel7') return null;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    await cdp.detach();
    return usedSize;
  };
  const nodes = () => page.evaluate(() => document.getElementsByTagName('*').length);
  const times: number[] = [];
  let heap10: number | null = null;
  let nodes10 = 0;
  let claimed = { earlyFive: false, topLine: false };

  for (let i = 1; i <= 90; i++) {
    const t = Date.now();
    await page.clock.runFor(5_000);
    await expect(page.locator('.called-count')).toHaveText(`${i} of 90 called`);
    times.push(Date.now() - t);
    const called = await calledOrder(page);
    const hits = ALL.filter((n) => called.includes(n)).length;
    // Claim Early Five and Top Line for our ticket on the number that completes them.
    const due =
      !claimed.earlyFive && hits === 5 ? 'Early Five' : !claimed.topLine && TOP.every((n) => called.includes(n)) ? 'Top Line' : null;
    if (due) {
      expect(await claim(page, due, CODE, 'Meera')).toContain(`We have a winner for ${due}!`);
      await finishClaim(page);
      claimed = { ...claimed, [due === 'Early Five' ? 'earlyFive' : 'topLine']: true };
      if (i < 90) await page.getByRole('button', { name: 'Resume auto-draw' }).click();
    }
    if (i === 10) {
      heap10 = await heap();
      nodes10 = await nodes();
    }
  }
  const order = await calledOrder(page);
  note(info, 'order', order.join(','));
  expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
  await consistency(page);
  await expect(page.locator('.current-number')).toHaveText(String(order[89]));
  expect((await page.locator('.last-five li').allInnerTexts()).map(Number)).toEqual(order.slice(-5).reverse());
  await expect(page.getByRole('button', { name: 'Call Next Number' })).toBeDisabled();
  await expect(page.getByText('All 90 numbers have been called.')).toBeVisible();
  await expect(page.locator('.prize-earlyFive, .prize').filter({ hasText: 'Early Five' })).toContainText('Won by Meera');
  await expect(page.locator('.prize').filter({ hasText: 'Top Line' })).toContainText('Won by Meera');
  await expect(page.locator('.prize').filter({ hasText: 'Full House' })).toContainText('Open');
  expect((await spoken(page)).filter((s) => s.startsWith('Number '))).toHaveLength(90);
  await page.clock.runFor(30_000); // Nothing more happens after 90.
  expect(await calledOrder(page)).toHaveLength(90);

  // No slowdown: the last ten draws are no slower than the first ten (with slack for noise).
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const [first, last] = [avg(times.slice(0, 10)), avg(times.slice(-10))];
  note(info, 'draw time', `first 10 avg ${first.toFixed(0)} ms, last 10 avg ${last.toFixed(0)} ms`);
  expect(last).toBeLessThan(first * 2 + 100);
  // No growth: the page has the same number of elements, and the JS heap has not grown.
  const [heap90, nodes90] = [await heap(), await nodes()];
  note(info, 'dom nodes', `${nodes10} after 10 draws, ${nodes90} after 90`);
  expect(Math.abs(nodes90 - nodes10)).toBeLessThan(50);
  if (heap10 !== null && heap90 !== null) {
    note(info, 'js heap', `${(heap10 / 1e6).toFixed(2)} MB after 10 draws, ${(heap90 / 1e6).toFixed(2)} MB after 90`);
    expect(heap90 - heap10).toBeLessThan(2e6);
  }
  expect(watch.problems).toEqual([]);
});

/* ------------------------------------------------------------------ X7 */

test('X7 two caller tabs both drawing: no duplicate or lost numbers', async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await seed(a);
  await go(a, '/caller');
  await go(b, '/caller');
  let expected = 0;
  // Taking turns.
  for (let i = 0; i < 10; i++) {
    await callNext(i % 2 ? b : a);
    expected++;
  }
  // At the same moment.
  for (let i = 0; i < 10; i++) {
    await Promise.all([callNext(a), callNext(b)]);
    expected += 2;
  }
  await expect.poll(() => calledOrder(a)).toHaveLength(expected);
  for (const page of [a, b]) {
    await expect(page.locator('.called-count')).toHaveText(`${expected} of 90 called`);
    await consistency(page);
  }
});

/* ------------------------------------------------------------------ X8 */

test('X8a storage becomes full mid-game: the caller is told, and the game carries on', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page, { called: [1, 2] });
  await go(page, '/caller');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Full', 'QuotaExceededError');
    };
  });
  await callNext(page);
  await expect(page.locator('.called-count')).toHaveText('3 of 90 called');
  await expect(page.getByRole('alert')).toContainText(/not saving|storage|saved/i);
  expect(errors).toEqual([]);
});

test('X8b storage becomes full mid-game on a player phone: marking still works and the player is told', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page, { player: true });
  await go(page, '/player');
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Full', 'QuotaExceededError');
    };
  });
  const cell = page.locator(`[role=gridcell][aria-label*="number ${ALL[0]},"]`);
  await cell.click();
  await expect(cell).toHaveClass(/is-marked/);
  await expect(page.getByRole('alert')).toContainText(/not saving|storage|saved/i);
  expect(errors).toEqual([]);
});

test('X8c storage cleared mid-game: the game carries on and is saved again; after a refresh the app still works', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page, { called: [1, 2], player: true });
  await go(page, '/caller');
  await page.evaluate(() => localStorage.clear());
  await callNext(page);
  await expect(page.locator('.called-count')).toHaveText('3 of 90 called');
  expect(await calledOrder(page)).toHaveLength(3); // Saved again.
  await page.reload();
  await expect(page.locator('.called-count')).toHaveText('3 of 90 called');
  // The player game was cleared too: the player gets the join screen, not a blank page.
  await go(page, '/player');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Join a game/);
  expect(errors).toEqual([]);
});

const CORRUPT: [string, string, string][] = [
  ['caller: not JSON', 'tt:caller', '{"version":1,"gameCode":'],
  ['caller: wrong shape', 'tt:caller', '{"version":1,"gameCode":42,"called":"many"}'],
  ['caller: duplicate numbers', 'tt:caller', '{"version":1,"gameCode":"QAGD","called":[5,5],"winners":[]}'],
  [
    'caller: bad setting values',
    'tt:caller',
    '{"version":1,"gameCode":"QAGD","called":[5],"winners":[],"settings":{"patterns":"all","autoIntervalSec":"fast","voice":"loud","tieMode":7,"points":{"topLine":-3}}}',
  ],
  ['player: not JSON', 'tt:player:QAGD', '[[['],
  ['player: bad ticket code', 'tt:player:QAGD', '{"version":1,"gameCode":"QAGD","name":"M","ticketCodes":["OOOOO"],"marks":{}}'],
  ['prefs: unknown theme', 'tt:prefs', '{"theme":"neon","textSize":9}'],
  ['setup: bad last settings', 'tt:lastSettings', '{"patterns":7,"autoIntervalSec":-1,"callStyle":"shouty"}'],
];

for (const [label, key, value] of CORRUPT) {
  test(`X8d corrupted saved data (${label}): no crash, no blank screen`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.evaluate(
      ([key, value]) => {
        localStorage.setItem('tt:player:current', 'QAGD');
        localStorage.setItem(key, value);
      },
      [key, value],
    );
    for (const route of ['/', '/caller', '/caller/setup', '/caller/tv', '/player', '/settings']) {
      await page.goto(`/#${route}`);
      await expect(page.locator('h1').first(), route).toBeAttached();
      expect((await page.locator('main').innerText()).trim().length, `${route} is not blank`).toBeGreaterThan(10);
    }
    // Whatever was loaded must still work: start (or continue) a game and draw.
    await go(page, '/caller');
    if (page.url().includes('setup')) await page.getByRole('button', { name: 'Start game' }).click();
    const before = await page.locator('.called-count').innerText();
    await callNext(page);
    await expect(page.locator('.called-count')).not.toHaveText(before);
    // Auto-draw must still tick at a sensible interval.
    await page.getByRole('button', { name: /auto-draw/ }).first().click();
    await expect(page.locator('.auto-status')).toHaveText(/Next number in \d+s/);
    expect(errors).toEqual([]);
  });
}

test('X8e a saved caller game that cannot be read is reported to the caller, not silently dropped', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('tt:caller', '{"version":1,"gameCode":'));
  await go(page, '/caller');
  await expect(page.getByRole('alert')).toContainText(/saved game|could(n’|n'|no)t (be )?(read|load)/i);
});

/* ------------------------------------------------------------------ X9 */

test('X9a double-tapping "Call Next Number" never duplicates or loses numbers', async ({ page }, info) => {
  await seed(page);
  await go(page, '/caller');
  await page.getByRole('button', { name: 'Call Next Number' }).dblclick();
  const after = await consistency(page);
  note(info, 'double-tap', `${after.called.length} number(s) drawn by one double-tap`);
  // Each drawn number is shown on the board and in the history.
  expect(after.called.length).toBeGreaterThanOrEqual(1);
  expect(after.called.length).toBeLessThanOrEqual(2);
  expect.soft(after.called.length, 'a double-tap draws only one number').toBe(1);
});

test('X9b pressing Space repeatedly draws once per press; holding it down draws once', async ({ page }) => {
  await seed(page);
  await go(page, '/caller');
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  for (let i = 0; i < 10; i++) await page.keyboard.press(' ');
  const { called } = await consistency(page);
  expect(called).toHaveLength(10);
  await page.keyboard.down(' ');
  for (let i = 0; i < 5; i++) await page.keyboard.down(' '); // Auto-repeat while held.
  await page.keyboard.up(' ');
  expect(await calledOrder(page)).toHaveLength(11);
  await consistency(page);
});

test('X9c "Check a Claim" during a draw animation: judged on the numbers shown, no draws while checking', async ({ page }) => {
  await page.clock.install({ time: T0 });
  await seed(page, { settings: { autoIntervalSec: 5 } });
  await page.clock.pauseAt(new Date(T0.getTime() + 60_000));
  await go(page, '/caller');
  await page.getByRole('button', { name: 'Start auto-draw' }).click();
  await page.clock.runFor(4_900);
  await callNext(page); // The number is still animating in…
  await page.getByRole('button', { name: 'Check a Claim' }).click(); // …when Check a Claim is tapped.
  const shown = await calledOrder(page);
  expect(shown).toHaveLength(1);
  await page.clock.runFor(30_000);
  await page.keyboard.press(' ');
  expect(await calledOrder(page)).toEqual(shown);
  await page.getByRole('dialog').getByLabel('Ticket code').fill(CODE);
  await page.getByRole('dialog').getByRole('button', { name: 'Check ticket' }).click();
  await expect(page.getByRole('dialog').locator('.result-message')).toContainText('Not yet!');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('button', { name: 'Resume auto-draw' })).toBeVisible();
  await consistency(page);
});

/* ------------------------------------------------------------------ X10 */

test('X10 second Full House: both winners in the summary and share text, and a refresh keeps both', async ({ page }, info) => {
  test.setTimeout(180_000);
  const B = 'HWTP3';
  const bNums = ticketNumbers(generateTicket(GAME, B));
  const aLast = ALL.find((n) => !bNums.includes(n))!;
  const bLast = bNums.find((n) => !ALL.includes(n))!;
  const union = [...new Set([...ALL, ...bNums])].filter((n) => n !== aLast && n !== bLast);
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: string[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: { text: string }) => void w.__shared.push(d.text) });
  });
  await seed(page, { called: [...union, aLast], settings: { secondFullHouse: true, points: { fullHouse: 100 } } });
  await go(page, '/caller');

  expect(await claim(page, 'Full House', CODE, 'Asha')).toContain('We have a winner for Full House!');
  await finishClaim(page);
  await expect(page.getByRole('button', { name: 'Call Next Number' })).toBeEnabled(); // Play on.
  for (let i = 0; i < 90 && !(await calledOrder(page)).includes(bLast); i++) await callNext(page);
  note(info, 'order', (await calledOrder(page)).join(','));
  expect(await claim(page, 'Full House', B, 'Ben')).toContain('We have a winner for Full House!');
  await finishClaim(page);

  const check = async () => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Game over');
    const list = page.locator('.winner-list li');
    await expect(list).toHaveCount(2);
    await expect(list.nth(0)).toContainText(`Full House: Asha (${CODE}) · 100 points`);
    await expect(list.nth(1)).toContainText(`Full House: Ben (${B}) · 100 points`);
    await page.getByRole('button', { name: 'Share results' }).click();
    const text = await page.evaluate(() => (window as unknown as { __shared: string[] }).__shared.pop());
    expect(text).toContain('Full House: Asha (100 points); Ben (100 points)');
  };
  await check();
  await page.reload();
  await check();
});

/* ------------------------------------------------------------------ X11 */

test('X11 a whole game with the player in Inclusive Mode on a 360px phone, marking only with the helper', async ({ browser }, info) => {
  test.setTimeout(300_000);
  const watch = consoleWatch();
  const cctx = await browser.newContext();
  const caller = await cctx.newPage();
  const pctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const player = await pctx.newPage();
  watch.attach(caller, 'caller');
  watch.attach(player, 'player');
  await go(caller, '/caller/setup');
  await caller.getByRole('button', { name: 'Start game' }).click();
  const gameCode = (await caller.locator('.game-code-value').innerText()).trim();

  await go(player, '/');
  await player.getByRole('switch', { name: /Inclusive Mode/ }).click();
  await go(player, '/join');
  await player.getByLabel('Game code').fill(gameCode);
  await player.getByRole('button', { name: 'Next' }).click();
  await player.getByLabel('Your name').fill('Nani');
  await player.getByRole('button', { name: 'Next' }).click();
  await player.getByRole('button', { name: 'Get my tickets' }).click();
  const code = (await player.locator('.ticket-code [aria-hidden="true"]').innerText()).trim();
  const ticket = generateTicket(gameCode, code);
  const nums = ticketNumbers(ticket);
  const top = ticket[0].filter((n): n is number => n !== null);
  note(info, 'ticket', `${gameCode} ${code}`);

  const problems: string[] = [];
  let orientation = 'portrait';
  problems.push(...(await layoutProblems(player)).map((p) => `${orientation}: ${p}`));
  let topClaimed = false;
  for (let i = 1; i <= 90; i++) {
    if (i === 30) {
      await player.setViewportSize({ width: 740, height: 360 }); // Turn the phone sideways.
      orientation = 'landscape';
      problems.push(...(await layoutProblems(player)).map((p) => `${orientation}: ${p}`));
    }
    await callNext(caller);
    const called = await calledOrder(caller);
    const n = called[called.length - 1];
    // The player types each number they hear into the marking helper.
    await player.getByLabel('Number you heard').fill(String(n));
    await player.getByRole('button', { name: 'Mark it' }).click();
    await expect(player.locator('.helper-result')).toHaveText(
      nums.includes(n) ? `✓ Marked ${n} on your ticket.` : `✕ ${n} is not on your ticket.`,
    );
    if (!topClaimed && top.every((x) => called.includes(x))) {
      await expect(player.locator('.hint-banner')).toContainText('Top Line may be complete');
      expect(await claim(caller, 'Top Line', code, 'Nani')).toContain('We have a winner for Top Line!');
      await finishClaim(caller);
      topClaimed = true;
    }
    if (nums.every((x) => called.includes(x))) {
      expect(await claim(caller, 'Full House', code, 'Nani')).toContain('We have a winner for Full House!');
      await finishClaim(caller);
      break;
    }
  }
  await expect(caller.getByRole('heading', { level: 1 })).toContainText('Game over');
  const order = await calledOrder(caller);
  note(info, 'order', order.join(','));
  const marks = (await player.locator('.is-marked .cell-number').allInnerTexts()).map(Number).sort((a, b) => a - b);
  expect(marks).toEqual([...nums].sort((a, b) => a - b));
  expect(problems).toEqual([]);
  expect(watch.problems).toEqual([]);
  await cctx.close();
  await pctx.close();
});

/* ------------------------------------------------------------------ X12 */

async function tourAsCaller(caller: Page): Promise<void> {
  await go(caller, '/');
  await go(caller, '/caller/setup');
  await caller.getByRole('button', { name: 'Start game' }).click();
  for (let i = 0; i < 5; i++) await callNext(caller);
  await caller.getByRole('button', { name: 'Repeat' }).click();
  await caller.getByRole('button', { name: 'Start auto-draw' }).click();
  await caller.getByRole('button', { name: 'Pause auto-draw' }).click();
  await caller.getByRole('button', { name: 'Full-screen QR' }).click();
  await caller.keyboard.press('Escape');
  await caller.getByRole('button', { name: 'Check a Claim' }).click();
  await caller.getByRole('dialog').getByLabel('Ticket code').fill('ZZZZ2');
  await caller.getByRole('dialog').getByRole('button', { name: 'Check ticket' }).click();
  await caller.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await caller.getByRole('button', { name: 'Undo last number' }).click();
  await caller.getByRole('dialog').getByRole('button', { name: 'Yes, do it' }).click();
  await caller.getByRole('button', { name: 'TV mode' }).click();
  await caller.locator('.tv').waitFor();
  await caller.getByRole('button', { name: 'Exit TV mode' }).click();
  await go(caller, '/caller/print');
  await go(caller, '/how');
  await go(caller, '/soon');
  await go(caller, '/settings');
  for (const theme of ['Dark', 'High contrast', 'Light']) await caller.getByText(theme, { exact: true }).click();
  await caller.getByRole('switch', { name: /Inclusive Mode/ }).click();
  await caller.getByRole('switch', { name: /Inclusive Mode/ }).click();
  await go(caller, '/nowhere');
  await go(caller, '/caller');
  await caller.getByRole('button', { name: 'End game' }).click();
  await caller.getByRole('dialog').getByRole('button', { name: 'Yes, do it' }).click();
  await expect(caller.getByRole('heading', { level: 1 })).toContainText('Game over');
}

test('X12 no console errors or warnings on any screen during a full tour of the app', async ({ browser }) => {
  test.setTimeout(180_000);
  const watch = consoleWatch();
  const caller = await (await browser.newContext()).newPage();
  const player = await (await browser.newContext()).newPage();
  watch.attach(caller, 'caller');
  watch.attach(player, 'player');
  await tourAsCaller(caller).catch(async (e) => {
    throw new Error(`tour failed at ${caller.url()}: ${e}`);
  });
  await go(player, '/join');
  await player.getByLabel('Game code').fill('KMPT');
  await player.getByRole('button', { name: 'Next' }).click();
  await player.getByLabel('Your name').fill('Tour');
  await player.getByRole('button', { name: 'Next' }).click();
  await player.getByText('3', { exact: true }).click();
  await player.getByRole('button', { name: 'Get my tickets' }).click();
  await player.locator('.cell-number-cell').first().click();
  await player.getByLabel('Marking helper').check();
  await player.getByLabel('Number you heard').fill('45');
  await player.getByRole('button', { name: 'Mark it' }).click();
  await player.getByLabel('Pattern hints').check();
  await go(player, '/how');
  await player.goto('/?game=BAD!');
  await player.locator('h1').waitFor();
  expect(watch.problems).toEqual([]);
});

