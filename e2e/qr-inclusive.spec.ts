import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium, expect, test, type Page } from '@playwright/test';
import { findTie } from '../tests/helpers';

/** QR instant join, Inclusive Mode and the AI Host "Coming Soon" item. IDs match the report. */

const GAME = 'KMPT';
const TIE = findTie(GAME, 1, 'topLine');
const JSQR = resolve('node_modules/jsqr/dist/jsQR.js');

async function seedCaller(page: Page, extra: Record<string, unknown> = {}, prefs?: object): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ({ GAME, called, extra, prefs }) => {
      localStorage.setItem(
        'tt:caller',
        JSON.stringify({ version: 1, gameCode: GAME, createdAt: 1, settings: { settingsVersion: 3, voice: false, ...extra }, called, winners: [], closed: [], ended: false }),
      );
      if (prefs) localStorage.setItem('tt:prefs', JSON.stringify(prefs));
    },
    { GAME, called: TIE.called.slice(0, -1), extra, prefs },
  );
  await page.reload();
}

async function seedPlayer(page: Page, helper = false, hints = false): Promise<void> {
  await page.evaluate(
    ({ GAME, code, helper, hints }) => {
      localStorage.setItem('tt:player:current', GAME);
      localStorage.setItem(`tt:player:${GAME}`, JSON.stringify({ version: 1, gameCode: GAME, name: 'Nani', ticketCodes: [code], marks: { [code]: [] }, helper, hints }));
    },
    { GAME, code: TIE.codes[0], helper, hints },
  );
}

/** Decode the QR code inside `selector` by drawing its SVG onto a canvas and running jsQR. */
async function decodeQr(page: Page, selector: string): Promise<string | null> {
  await page.locator(`${selector} svg`).first().waitFor();
  await page.addScriptTag({ path: JSQR });
  return page.evaluate(async (sel) => {
    const svg = document.querySelector(`${sel} svg`)!;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 400;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 400, 400);
    ctx.drawImage(img, 0, 0, 400, 400);
    const data = ctx.getImageData(0, 0, 400, 400);
    const jsQR = (window as unknown as { jsQR: (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null }).jsQR;
    return jsQR(data.data, 400, 400)?.data ?? null;
  }, selector);
}

async function turnInclusive(page: Page, on: boolean): Promise<void> {
  await page.goto('/#/');
  const sw = page.getByRole('switch', { name: /Inclusive Mode/ });
  if ((await sw.getAttribute('aria-checked')) !== String(on)) await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', String(on));
}

const storedPrefs = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('tt:prefs') ?? 'null'));
const storedPlayer = (page: Page) => page.evaluate((g) => JSON.parse(localStorage.getItem(`tt:player:${g}`) ?? 'null'), GAME);

/* ------------------------------------------------------------------ QR */

test('QR1 the caller QR code (and TV QR) encodes this app’s URL with the game code', async ({ page, baseURL }) => {
  await seedCaller(page);
  await page.goto('/#/caller');
  await expect(page.getByText('Scan → Join → Play.')).toBeVisible();
  await expect(page.locator('.game-code-value')).toHaveText(GAME);
  expect(await decodeQr(page, '.game-code .qr')).toBe(`${baseURL}/?game=${GAME}`);
  await page.goto('/#/caller/tv');
  expect(await decodeQr(page, '.tv-code .qr')).toBe(`${baseURL}/?game=${GAME}`);
});

test('QR2 opening ?game=KMPT shows the join screen with KMPT filled in', async ({ page }) => {
  await page.goto(`/?game=${GAME}`);
  await expect(page).toHaveURL(/#\/join$/);
  await expect(page.locator('.join-link')).toContainText(`Game ${GAME} ✓`);
  await expect(page.getByText('Step 2 of 3')).toBeVisible();
  await expect(page.getByLabel('Your name')).toBeFocused();
  // "Back" shows the code already typed in.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Game code')).toHaveValue(GAME);
});

test('QR3 an invalid code in the URL falls back to the normal join screen with a friendly message', async ({ page }) => {
  await page.goto('/?game=KM0T');
  await expect(page.getByText('Step 1 of 3')).toBeVisible();
  await expect(page.getByText('That link didn’t have a valid game code')).toBeVisible();
  await expect(page.getByLabel('Game code')).toHaveValue('');
  expect(new URL(page.url()).searchParams.has('game')).toBe(false);
});

test('QR4 after joining the parameter is removed, and a refresh keeps the player in the game', async ({ page }) => {
  await page.goto(`/?game=${GAME}`);
  await page.getByLabel('Your name').fill('Nani');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Get my tickets' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('My tickets');
  expect(new URL(page.url()).search).toBe('');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('My tickets');
  await expect(page.getByRole('grid')).toHaveCount(1);
});

test('QR5 the QR code is made offline, with no network requests, and has a text alternative', async ({ context, baseURL }) => {
  const page = await context.newPage();
  await seedCaller(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const outside: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(baseURL!) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) outside.push(r.url());
  });
  await context.setOffline(true);
  await page.goto('/#/caller');
  await expect(page.getByRole('img', { name: `QR code to join game ${GAME}` })).toBeVisible();
  expect(await decodeQr(page, '.game-code .qr')).toBe(`${baseURL}/?game=${GAME}`);
  expect(outside).toEqual([]);
  await context.setOffline(false);
});

test('QR6 the "phones can only scan…" note appears only when running locally', async ({ page }) => {
  await seedCaller(page);
  await page.goto('/#/caller');
  await expect(page.getByText('Phones can only scan this when the app is hosted online')).toBeVisible();

  // Same app under a public-looking host name (mapped to localhost, whichever of IPv4/IPv6 the server uses).
  const browser = await chromium.launch({ args: ['--host-resolver-rules=MAP tambola.example localhost'] });
  const online = await browser.newPage({ baseURL: 'http://tambola.example:4173' });
  await seedCaller(online);
  await online.goto('/#/caller');
  await expect(online.locator('.game-code-value')).toHaveText(GAME);
  await expect(online.getByText('Phones can only scan this')).toHaveCount(0);
  expect(await decodeQr(online, '.game-code .qr')).toBe(`http://tambola.example:4173/?game=${GAME}`);
  await browser.close();
});

test('QR7 full-screen QR opens and closes with mouse, touch and keyboard', async ({ browser }) => {
  const ctx = await browser.newContext({ hasTouch: true });
  const page = await ctx.newPage();
  await seedCaller(page);
  await page.goto('/#/caller');
  const open = page.getByRole('button', { name: 'Full-screen QR' });
  const dialog = page.getByRole('dialog', { name: 'Scan → Join → Play.' });

  await open.click(); // mouse
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('img', { name: `QR code to join game ${GAME}` })).toBeVisible();
  await expect(dialog.locator('.qr-huge-code')).toHaveText(GAME);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);

  await open.tap(); // touch
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).tap();
  await expect(dialog).toHaveCount(0);

  await open.focus(); // keyboard
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await ctx.close();
});

/* ------------------------------------------------------------------ Inclusive Mode */

test('SM1 turning Inclusive Mode ON applies every setting', async ({ page }) => {
  await seedCaller(page, { voice: false });
  await seedPlayer(page, false, false);
  await turnInclusive(page, true);

  // Device-wide: A++ text, High Contrast, big targets, reduced motion.
  const root = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    text: document.documentElement.dataset.text,
    size: getComputedStyle(document.documentElement).fontSize,
  }));
  expect(root).toEqual({ theme: 'contrast', text: '2', size: '23px' });
  const sw = await page.getByRole('switch', { name: /Inclusive Mode/ }).boundingBox();
  expect(sw!.height).toBeGreaterThanOrEqual(64);

  // Player: helper and hints ON, simplified screen.
  await page.goto('/#/player');
  await expect(page.getByLabel('Number you heard')).toBeVisible();
  expect(await storedPlayer(page)).toMatchObject({ helper: true, hints: true });
  const cell = await page.getByRole('gridcell').filter({ hasText: /\d/ }).first().boundingBox();
  expect(Math.min(cell!.width, cell!.height)).toBeGreaterThanOrEqual(64);

  // Caller: no number animation; no confetti for a winner.
  await page.goto('/#/caller');
  await page.getByRole('button', { name: 'Call Next Number' }).click();
  await expect(page.locator('.current-number')).not.toHaveClass(/pop/);

  // Joining: one ticket by default.
  const fresh = await page.context().newPage();
  await fresh.goto('/#/join');
  await fresh.getByLabel('Game code').fill('ABCD');
  await fresh.getByRole('button', { name: 'Next' }).click();
  await fresh.getByLabel('Your name').fill('Nani');
  await fresh.getByRole('button', { name: 'Next' }).click();
  await expect(fresh.getByRole('radio', { name: '1 ticket', exact: true })).toBeChecked();
});

test('SM1b no confetti for a winner in Inclusive Mode', async ({ page }) => {
  await seedCaller(page, {}, { theme: 'light', textSize: 0, inclusive: true, beforeInclusive: { theme: 'light', textSize: 0, players: {} } });
  await page.goto('/');
  await page.evaluate((called) => {
    const g = JSON.parse(localStorage.getItem('tt:caller')!);
    g.called = called;
    localStorage.setItem('tt:caller', JSON.stringify(g));
  }, TIE.called);
  await page.reload();
  await page.goto('/#/caller');
  await page.getByRole('button', { name: 'Check a Claim' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Top Line', { exact: true }).click();
  await dialog.getByLabel('Ticket code').fill(TIE.codes[0]);
  await dialog.getByRole('button', { name: 'Check ticket' }).click();
  await expect(page.locator('.winner-banner')).toBeVisible();
  await expect(page.locator('.confetti')).toHaveCount(0);
});

test('SM2 turning it OFF restores the previous individual settings exactly', async ({ page }) => {
  await seedCaller(page, {}, { theme: 'dark', textSize: 1 });
  await seedPlayer(page, false, true);
  const originalPlayer = await storedPlayer(page);
  await turnInclusive(page, true);
  await page.goto('/#/player'); // the mode is applied to the game here
  await turnInclusive(page, false);
  expect(await storedPrefs(page)).toEqual({ theme: 'dark', textSize: 1, inclusive: false });
  expect(await storedPlayer(page)).toEqual(originalPlayer);
  const root = await page.evaluate(() => [document.documentElement.dataset.theme, document.documentElement.dataset.text, document.documentElement.dataset.inclusive]);
  expect(root).toEqual(['dark', '1', 'false']);
});

test('SM3 the mode survives a refresh', async ({ page }) => {
  await turnInclusive(page, true);
  await page.reload();
  await expect(page.getByRole('switch', { name: /Inclusive Mode/ })).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => document.documentElement.dataset.inclusive)).toBe('true');
});

test('SM4 single settings can still be changed while the mode is on', async ({ page }) => {
  await seedCaller(page);
  await seedPlayer(page);
  await turnInclusive(page, true);
  await page.goto('/#/settings');
  await page.getByRole('radio', { name: 'Normal text', exact: true }).check({ force: true });
  await page.getByRole('radio', { name: 'Dark', exact: true }).check({ force: true });
  expect(await storedPrefs(page)).toMatchObject({ inclusive: true, textSize: 0, theme: 'dark' });
  await page.goto('/#/player');
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByLabel('Pattern hints').uncheck();
  await page.reload();
  expect(await storedPlayer(page)).toMatchObject({ helper: true, hints: false });
  await page.getByRole('button', { name: 'More' }).click();
  await expect(page.getByLabel('Pattern hints')).not.toBeChecked();
});

test('SM5 the voice is slower and says each number twice', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__spoken = [];
    w.SpeechSynthesisUtterance = class {
      lang = '';
      voice: unknown = null;
      rate = 1;
      volume = 1;
      constructor(public text: string) {}
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [{ lang: 'en-GB', name: 'en', localService: true, default: true, voiceURI: 'en' }],
        speak: (u: { text: string; rate: number }) => u.text && (w.__spoken as object[]).push({ text: u.text, rate: u.rate }),
        cancel() {},
        addEventListener() {},
      },
    });
  });
  await seedCaller(page, { voice: true, callStyle: 'plain' });
  await turnInclusive(page, true);
  await page.goto('/#/caller');
  await page.getByRole('button', { name: 'Call Next Number' }).click();
  const n = await page.locator('.current-number').innerText();
  const said = await page.evaluate(() => (window as unknown as { __spoken: { text: string; rate: number }[] }).__spoken);
  expect(said).toHaveLength(1);
  expect(said[0].rate).toBe(0.8);
  expect(said[0].text.startsWith(`Number ${n} … `)).toBe(true);
  expect(said[0].text.endsWith(` … ${n}`)).toBe(true);
});

test('SM6 the simplified player screen shows only the ticket, helper and claim reminder; "More" shows the rest', async ({ page }) => {
  await seedCaller(page);
  await seedPlayer(page);
  await turnInclusive(page, true);
  await page.goto('/#/player');
  await expect(page.locator('.claim-reminder')).toBeVisible();
  await expect(page.getByLabel('Number you heard')).toBeVisible();
  await expect(page.getByRole('grid')).toBeVisible();
  for (const hidden of ['Your screen does not follow the caller', 'Winners are announced by the caller']) {
    await expect(page.getByText(hidden)).toBeHidden();
  }
  await expect(page.getByLabel('Marking helper')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Leave game' })).toBeHidden();
  const more = page.getByRole('button', { name: 'More' });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Your screen does not follow the caller')).toBeVisible();
  await expect(page.getByLabel('Marking helper')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave game' })).toBeVisible();
});

async function inclusiveSetup(page: Page): Promise<void> {
  await seedCaller(page);
  await seedPlayer(page);
  await turnInclusive(page, true);
  await page.goto('/#/player'); // adopt the game (helpers on)
}

const ROUTES = ['/', '/settings', '/caller', '/player', '/join', '/how', '/soon'];

test('SM7 axe: no serious/critical issues with the mode on; buttons and cells are at least 64×64', async ({ page }) => {
  test.setTimeout(240_000);
  await inclusiveSetup(page);
  const serious: string[] = [];
  const small: string[] = [];
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ROUTES) {
      await page.goto(`/#${route}`);
      await page.locator('h1').first().waitFor({ state: 'attached' });
      if (route === '/player') await page.getByRole('button', { name: 'More' }).click();
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      serious.push(...r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${width} ${route} ${v.id}`));
      small.push(
        ...(await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('button, a.btn, a.role-button, a.brand, a.text-link, .radio-option label, .check-row label, [role=switch], .ticket-grid .cell-number-cell')]
            .filter((e) => !e.classList.contains('skip-link') && e.getBoundingClientRect().width > 0)
            .map((e) => ({ e, r: e.getBoundingClientRect() }))
            .filter(({ r }) => r.width < 63.5 || r.height < 63.5)
            .map(({ e, r }) => `${e.tagName.toLowerCase()}"${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 20)}" ${Math.round(r.width)}×${Math.round(r.height)}`),
        )).map((s) => `${width} ${route}: ${s}`),
      );
    }
  }
  expect(serious).toEqual([]);
  expect(small).toEqual([]);
});

test('SM8 at 360px and 768px with the mode on: no overlapping and no sideways scrolling', async ({ page }) => {
  test.setTimeout(240_000);
  await inclusiveSetup(page);
  const problems: string[] = [];
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ROUTES) {
      await page.goto(`/#${route}`);
      await page.locator('h1').first().waitFor({ state: 'attached' });
      if (route === '/player') await page.getByRole('button', { name: 'More' }).click();
      const found = await page.evaluate(() => {
        // Measure the layout itself: once scrolled, content passes under the sticky header by design.
        scrollTo(0, 0);
        const out: string[] = [];
        const extra = document.documentElement.scrollWidth - innerWidth;
        if (extra > 0) out.push(`horizontal scroll +${extra}px`);
        const els = [...document.querySelectorAll<HTMLElement>('button, a[href], input:not([type=radio]), label, [role=gridcell]')].filter(
          (e) => e.getBoundingClientRect().width > 0 && !e.classList.contains('skip-link') && e.offsetParent !== null,
        );
        for (let i = 0; i < els.length; i++)
          for (let j = i + 1; j < els.length; j++) {
            const [a, b] = [els[i], els[j]];
            if (a.contains(b) || b.contains(a)) continue;
            const r = a.getBoundingClientRect(), s = b.getBoundingClientRect();
            if (Math.min(r.right, s.right) - Math.max(r.left, s.left) > 1 && Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top) > 1) {
              out.push(`overlap ${a.textContent?.trim().slice(0, 15)} × ${b.textContent?.trim().slice(0, 15)}`);
            }
          }
        return out;
      });
      problems.push(...found.map((p) => `${width}px ${route}: ${p}`));
      await page.screenshot({ path: `qa-screenshots/SM8-${width}${route.replace(/\//g, '_') || '_home'}.png`, fullPage: true });
    }
  }
  expect(problems).toEqual([]);
});

/* ------------------------------------------------------------------ AI Host */

test('AI1 the AI Host item is in Coming Soon, badged, and cannot be activated', async ({ page }) => {
  await page.goto('/#/soon');
  const item = page.locator('.soon-item', { hasText: 'AI Host' });
  await expect(item).toBeVisible();
  await expect(item).toContainText('🤖 AI Host');
  await expect(item).toContainText('multilingual Tambola host');
  await expect(item.locator('.badge')).toHaveText('Coming Soon');
  await expect(item).toHaveAttribute('aria-disabled', 'true');
  const html = await page.locator('main').innerHTML();
  await item.click({ force: true });
  await item.focus();
  await page.keyboard.press('Enter');
  expect(page.url()).toMatch(/#\/soon$/);
  expect(await page.locator('main').innerHTML()).toBe(html);
});
