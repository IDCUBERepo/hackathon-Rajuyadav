import { resolve } from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';

/** Shared helpers for the full-game (L) and final (X) suites. */

const JSQR = resolve('node_modules/jsqr/dist/jsQR.js');

export async function go(page: Page, route: string): Promise<void> {
  await page.goto(`/#${route}`);
  await page.locator('h1').first().waitFor({ state: 'attached' });
}

/** Decode the QR code inside `selector` by drawing its SVG onto a canvas and running jsQR. */
export async function decodeQr(page: Page, selector: string): Promise<string | null> {
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

/** Speech mock: records what would be spoken (with the rate used). */
export async function mockSpeech(page: Page, voices: string[] = ['en-GB']): Promise<void> {
  await page.addInitScript((langs) => {
    const w = window as unknown as Record<string, unknown>;
    w.__spoken = [] as { text: string; lang: string; rate: number }[];
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
        speak: (u: { text: string; lang: string; rate: number }) => {
          if (u.text) (w.__spoken as object[]).push({ text: u.text, lang: u.lang, rate: u.rate });
        },
        cancel() {},
        addEventListener() {},
      },
    });
  }, voices);
}

export const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: { text: string; lang: string; rate: number }[] }).__spoken.map((s) => s.text));

/** Collect uncaught errors and console errors/warnings from every page it's attached to. */
export function consoleWatch() {
  const problems: string[] = [];
  return {
    problems,
    attach(page: Page, label: string) {
      page.on('pageerror', (e) => problems.push(`${label} pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') problems.push(`${label} console.${m.type()}: ${m.text()}`);
      });
    },
  };
}

/** Horizontal page scrolling and content cut off at the sides or by overflow clipping. */
export function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const extra = document.documentElement.scrollWidth - innerWidth;
    if (extra > 1) out.push(`sideways scroll +${extra}px`);
    const scrollers = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll') return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      if (el.closest('.sr-only, .confetti, svg') || el.offsetParent === null) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const name = `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} "${(el.textContent ?? '').trim().slice(0, 20)}"`;
      if ((r.right > innerWidth + 1 || r.left < -1) && !scrollers(el)) out.push(`off-screen ${name}`);
      const cs = getComputedStyle(el);
      if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1 && el.textContent?.trim()) {
        out.push(`clipped ${name}`);
      }
    }
    return [...new Set(out)];
  });
}

/** Record something for the report (e.g. ticket codes and draw order) so a failure can be reproduced. */
export function note(info: TestInfo, type: string, description: string): void {
  info.annotations.push({ type, description });
  console.log(`[${info.project.name}] ${type}: ${description}`);
}

/** Called numbers in draw order, straight from the caller's saved game. */
export const calledOrder = (caller: Page) =>
  caller.evaluate(() => JSON.parse(localStorage.getItem('tt:caller')!).called as number[]);

export { expect };
