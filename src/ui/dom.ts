/** Minimal DOM helpers so screens stay readable without a UI framework. */

export type Child = Node | string | number | null | undefined | false;
type AttrValue = string | number | boolean | null | undefined | EventListener;
export type Attrs = Record<string, AttrValue>;

/**
 * Create an element. `on*` function attributes become event listeners,
 * `class` sets className, `value`/`checked` set properties, booleans toggle
 * attributes, and null/undefined/false are skipped.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'class') {
      el.className = String(value);
    } else if (key === 'value' || key === 'checked') {
      (el as unknown as Record<string, unknown>)[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: (Child | Child[])[]): void {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function replaceChildren(parent: Element, ...children: (Child | Child[])[]): void {
  parent.textContent = '';
  append(parent, children);
}

/** Decorative icon hidden from screen readers (the text label carries the meaning). */
export function icon(symbol: string): HTMLSpanElement {
  return h('span', { class: 'icon', 'aria-hidden': 'true' }, symbol);
}

/** Text only for screen readers. */
export function srOnly(text: string): HTMLSpanElement {
  return h('span', { class: 'sr-only' }, text);
}

let uid = 0;
export function uniqueId(prefix: string): string {
  return `${prefix}-${++uid}`;
}

/**
 * Speak a message through the page-level aria-live regions. The region is
 * cleared first so repeating the same message is still announced.
 */
export function announce(message: string, urgent = false): void {
  // While a modal dialog is open the rest of the page is inert, so its live
  // regions may not be read out; each dialog carries its own pair.
  const dialog = document.querySelector('dialog[open]');
  const region = dialog
    ? dialog.querySelector(urgent ? '[data-live="assertive"]' : '[data-live="polite"]')
    : document.getElementById(urgent ? 'live-assertive' : 'live-polite');
  if (!region) return;
  region.textContent = '';
  window.setTimeout(() => {
    region.textContent = message;
  }, 60);
}

/** Reduced motion from the system setting, or because Inclusive Mode is on. */
export function prefersReducedMotion(): boolean {
  if (document.documentElement.dataset.inclusive === 'true') return true;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function navigate(hash: string, replace = false): void {
  if (replace) location.replace(hash);
  else location.hash = hash;
}
