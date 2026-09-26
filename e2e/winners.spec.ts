import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { parseCallerGame } from '../src/core/game';
import { resultsText } from '../src/share';
import { findTie } from '../tests/helpers';

/** Letting the whole room know who won: voice, banner, TV winners board, sharing. */

const GAME = 'WMNG';
const TIE = findTie(GAME, 2, 'topLine');
const [A, B] = TIE.codes;
const T0 = new Date('2026-09-26T10:00:00');

interface Seed {
  called?: number[];
  settings?: Record<string, unknown>;
  winners?: object[];
  ended?: boolean;
}

function callerGame(s: Seed) {
  return {
    version: 1,
    gameCode: GAME,
    createdAt: T0.getTime(),
    settings: { settingsVersion: 3, voice: false, points: { topLine: 100 }, ...(s.settings ?? {}) },
    called: s.called ?? TIE.called,
    winners: s.winners ?? [],
    closed: [],
    ended: s.ended ?? false,
  };
}

async function seed(page: Page, s: Seed = {}, route = '/caller'): Promise<void> {
  await page.goto('/');
  await page.evaluate((g) => {
    localStorage.clear();
    localStorage.setItem('tt:caller', JSON.stringify(g));
  }, callerGame(s));
  await page.reload();
  await page.goto(`/#${route}`);
}

async function claim(page: Page, code: string, name: string, pattern = 'Top Line'): Promise<void> {
  const dialog = page.getByRole('dialog');
  if (!(await dialog.isVisible())) await page.getByRole('button', { name: 'Check a Claim' }).click();
  else await dialog.getByRole('button', { name: 'Check another claim' }).first().click();
  await dialog.getByText(pattern, { exact: true }).click();
  await dialog.getByLabel('Ticket code').fill(code);
  await dialog.getByLabel('Player name (optional)').fill(name);
  await dialog.getByRole('button', { name: 'Check ticket' }).click();
  await expect(dialog.locator('.result-message')).toBeVisible();
}

function mockSpeech(page: Page, voices: string[] = ['en-GB']): Promise<unknown> {
  return page.addInitScript((langs) => {
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
        getVoices: () => langs.map((lang) => ({ lang, name: lang, localService: true, default: false, voiceURI: lang })),
        speak: (u: { text: string; lang: string }) => u.text && (w.__spoken as object[]).push({ text: u.text, lang: u.lang }),
        cancel() {},
        addEventListener() {},
      },
    });
  }, voices);
}
const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: { text: string; lang: string }[] }).__spoken.map((s) => s.text));

/* ---------- 1. Voice ---------- */

test('voice: a single win and a shared win are each announced', async ({ page }) => {
  await mockSpeech(page);
  await seed(page, { settings: { voice: true } });
  await claim(page, A, 'Priya');
  expect(await spoken(page)).toContain('Congratulations Priya, winner of Top Line, 100 points!');
  await claim(page, B, 'Rahul');
  expect(await spoken(page)).toContain('Top Line is shared by Priya and Rahul, 50 points each!');
});

test('voice: nothing is spoken when voice is off', async ({ page }) => {
  await mockSpeech(page);
  await seed(page, { settings: { voice: false } });
  await claim(page, A, 'Priya');
  expect(await spoken(page)).toEqual([]);
});

test('voice: the winner line uses Hindi when that is the voice language', async ({ page }) => {
  await mockSpeech(page, ['en-GB', 'hi-IN']);
  await seed(page, { settings: { voice: true, voiceLang: 'hi' } });
  await claim(page, A, 'Priya');
  expect(await spoken(page)).toContain('बधाई हो Priya, टॉप लाइन के विजेता, 100 अंक!');
});

/* ---------- 2. Banner ---------- */

test('banner: shows name, pattern and points; closes by itself after 6 seconds', async ({ page }) => {
  await page.clock.install({ time: T0 });
  await seed(page);
  await page.clock.pauseAt(new Date(T0.getTime() + 60_000));
  await claim(page, A, 'Priya');
  const banner = page.locator('.winner-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Priya');
  await expect(banner).toContainText('wins Top Line · 100 points');
  // Announced for screen readers too (inside the open dialog's live region).
  await page.clock.runFor(100);
  await expect(page.getByRole('dialog').locator('[data-live="polite"]')).toHaveText('Congratulations Priya, winner of Top Line, 100 points!');
  await page.clock.runFor(5_800);
  await expect(banner).toBeVisible();
  await page.clock.runFor(200);
  await expect(banner).toHaveCount(0);
});

test('banner: "Continue" closes it straight away; shared wins show everyone', async ({ page }) => {
  await seed(page);
  await claim(page, A, 'Priya');
  await page.locator('.winner-banner').getByRole('button', { name: 'Continue' }).click();
  await expect(page.locator('.winner-banner')).toHaveCount(0);
  await claim(page, B, 'Rahul');
  await expect(page.locator('.winner-banner')).toContainText('Priya and Rahul');
  await expect(page.locator('.winner-banner')).toContainText('share Top Line · 50 points each');
});

test('banner: confetti is skipped with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seed(page);
  await claim(page, A, 'Priya');
  await expect(page.locator('.winner-banner')).toBeVisible();
  await expect(page.locator('.confetti')).toHaveCount(0);
});

/* ---------- 3. TV winners board ---------- */

test('TV: banner and winners board update after each win, and persist after refresh', async ({ context }) => {
  const caller = await context.newPage();
  await seed(caller);
  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await tv.goto('/#/caller/tv');
  const board = tv.locator('.tv-winners');
  await expect(board.locator('li', { hasText: 'Top Line' })).toContainText('Open');

  await claim(caller, A, 'Priya');
  await expect(tv.locator('.winner-banner-overlay')).toContainText('Priya');
  await expect(board.locator('li', { hasText: 'Top Line' })).toContainText('Won by Priya (100 pts)');

  await claim(caller, B, 'Rahul');
  await expect(tv.locator('.winner-banner-overlay')).toContainText('Priya and Rahul');
  await expect(board.locator('li', { hasText: 'Top Line' })).toContainText('Shared: Priya (50 pts), Rahul (50 pts)');

  await tv.reload();
  await expect(tv.locator('.tv-winners li', { hasText: 'Top Line' })).toContainText('Shared: Priya (50 pts), Rahul (50 pts)');
  await expect(tv.locator('.tv-winners li')).toHaveCount(6);
});

test('TV: claims can be checked from TV mode, and Escape only closes the dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, {}, '/caller/tv');
  await claim(page, A, 'Priya');
  await expect(page.getByRole('dialog').locator('.result-message')).toContainText('We have a winner for Top Line');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/caller\/tv$/);
  await expect(page.locator('.tv-winners li', { hasText: 'Top Line' })).toContainText('Won by Priya (100 pts)');
  // The claim window is still open for shared winners, and can be used or finished from TV mode.
  const open = page.locator('.tv-claims');
  await expect(open).toContainText('Claims are still open for Top Line');
  await open.getByRole('button', { name: 'Check another claim' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('TV: a long winners list scrolls inside the panel and never breaks the layout', async ({ page }) => {
  const many = ['earlyFive', 'topLine', 'middleLine', 'bottomLine', 'fourCorners'].flatMap((pattern) =>
    Array.from({ length: 12 }, (_, i) => ({
      pattern,
      name: `Player number ${i + 1} with a long name`,
      ticketCode: `ABC${'DEFGHJKMNPQR'[i]}2`,
      callCount: TIE.called.length,
      shared: i > 0,
    })),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seed(page, { winners: many, settings: { points: { topLine: 100 } } }, '/caller/tv');
  const panel = page.locator('.tv-winners');
  await expect(panel).toContainText('Player number 12');
  const m = await panel.evaluate((el) => ({
    scroll: el.scrollHeight,
    client: el.clientHeight,
    overflow: getComputedStyle(el).overflowY,
    pageExtraY: document.documentElement.scrollHeight - innerHeight,
    pageExtraX: document.documentElement.scrollWidth - innerWidth,
  }));
  expect(m.overflow).toBe('auto');
  expect(m.scroll).toBeGreaterThan(m.client);
  expect(m.pageExtraY).toBeLessThanOrEqual(0);
  expect(m.pageExtraX).toBeLessThanOrEqual(0);
  await expect(page.getByRole('button', { name: 'Exit TV mode' })).toBeInViewport();
});

/* ---------- 4. Share results ---------- */

const ENDED: Seed = {
  ended: true,
  settings: { points: { topLine: 100, earlyFive: 20 } },
  winners: [
    { pattern: 'earlyFive', name: 'Asha', ticketCode: 'ASHA2', callCount: 8, shared: false },
    { pattern: 'topLine', name: 'Priya', ticketCode: A, callCount: TIE.called.length, shared: false },
    { pattern: 'topLine', name: 'Rahul', ticketCode: B, callCount: TIE.called.length, shared: true },
  ],
};
const EXPECTED_TEXT = resultsText(parseCallerGame(callerGame(ENDED))!);

test('share: uses the Web Share API with the plain-text results', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: { title: string; text: string }) => {
        (window as unknown as { __shared: unknown }).__shared = data;
        return Promise.resolve();
      },
    });
  });
  await seed(page, ENDED);
  await page.getByRole('button', { name: 'Share results' }).click();
  const shared = await page.evaluate(() => (window as unknown as { __shared: { title: string; text: string } }).__shared);
  expect(shared.title).toBe('Tambola Together results');
  expect(shared.text).toBe(EXPECTED_TEXT);
  expect(shared.text).toContain('Top Line: shared by Priya (50 points) and Rahul (50 points)');
  expect(shared.text).toContain('Middle Line: no winner');
});

test('share: without Web Share it copies to the clipboard and says "Copied!"', async ({ browser }) => {
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  await page.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: undefined }));
  await seed(page, ENDED);
  await page.getByRole('button', { name: 'Share results' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Copied!' })).toBeVisible();
  // Windows' clipboard stores line breaks as CRLF; compare the text itself.
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.replace(/\r\n/g, '\n')).toBe(EXPECTED_TEXT);
  await ctx.close();
});

test('share: if copying is blocked too, the text is shown ready to copy by hand', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('blocked')) } });
  });
  await seed(page, ENDED);
  await page.getByRole('button', { name: 'Share results' }).click();
  await expect(page.getByText('Copying isn’t available here')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Tambola Together results' })).toHaveValue(EXPECTED_TEXT);
});

/* ---------- 5. Player note ---------- */

test('player screen tells players to listen for the winners', async ({ page }) => {
  await page.goto('/#/join');
  await page.getByLabel('Game code').fill(GAME);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByLabel('Your name').fill('Meera');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Get my tickets' }).click();
  await expect(page.getByText('Winners are announced by the caller — listen out!')).toBeVisible();
});

/* ---------- 6. Accessibility ---------- */

async function seriousViolations(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0]?.target}`);
}

for (const theme of ['light', 'dark', 'contrast']) {
  test(`axe: no serious issues on the winner banner and summary (${theme})`, async ({ context }) => {
    const caller = await context.newPage();
    await seed(caller);
    await caller.evaluate((th) => localStorage.setItem('tt:prefs', JSON.stringify({ theme: th, textSize: 0 })), theme);
    const tv = await context.newPage();
    await tv.goto('/#/caller/tv');
    await caller.reload();
    await caller.goto('/#/caller');
    await claim(caller, A, 'Priya');
    await expect(caller.locator('.winner-banner-inline')).toBeVisible();
    await expect(tv.locator('.winner-banner-overlay')).toBeVisible();
    expect(await seriousViolations(caller), 'banner in claim dialog').toEqual([]);
    expect(await seriousViolations(tv), 'banner on TV').toEqual([]);

    await seed(caller, ENDED);
    await caller.evaluate((th) => localStorage.setItem('tt:prefs', JSON.stringify({ theme: th, textSize: 0 })), theme);
    await caller.reload();
    await expect(caller.getByRole('button', { name: 'Share results' })).toBeVisible();
    expect(await seriousViolations(caller), 'summary').toEqual([]);
  });
}
