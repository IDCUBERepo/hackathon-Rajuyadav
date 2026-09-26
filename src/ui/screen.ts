import { h, icon, uniqueId, type Attrs } from './dom';

/** A screen renders into <main> and may return a cleanup function. */
export type Screen = (main: HTMLElement) => (() => void) | void;

/** Page heading; focusable so the router can move focus to it on navigation. */
export function pageTitle(text: string, symbol?: string): HTMLHeadingElement {
  return h('h1', { tabindex: -1, class: 'page-title' }, symbol ? icon(symbol) : null, text);
}

export interface Field<T extends HTMLElement> {
  wrap: HTMLElement;
  input: T;
  setError: (message: string | null) => void;
}

/**
 * Labelled text input with help text and an error message that is linked via
 * aria-describedby and marked with aria-invalid when shown.
 */
export function textField(label: string, help: string | null, attrs: Attrs = {}): Field<HTMLInputElement> {
  const id = uniqueId('field');
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const error = h('p', { id: errorId, class: 'field-error', hidden: true });
  const input = h('input', {
    id,
    class: 'input',
    type: 'text',
    'aria-describedby': help ? helpId : null,
    ...attrs,
  });
  const wrap = h(
    'div',
    { class: 'field' },
    h('label', { for: id, class: 'field-label' }, label),
    help ? h('p', { id: helpId, class: 'field-help' }, help) : null,
    input,
    error,
  );
  return {
    wrap,
    input,
    setError(message) {
      error.hidden = message === null;
      error.textContent = message ? `⚠ ${message}` : '';
      if (message) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', [help ? helpId : '', errorId].filter(Boolean).join(' '));
      } else {
        input.removeAttribute('aria-invalid');
        if (help) input.setAttribute('aria-describedby', helpId);
        else input.removeAttribute('aria-describedby');
      }
    },
  };
}

/** A checkbox with its label (and optional hint) as one large tappable row. */
export function checkboxRow(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
  hint?: string,
): { wrap: HTMLElement; input: HTMLInputElement } {
  const id = uniqueId('check');
  const hintId = `${id}-hint`;
  const input = h('input', {
    id,
    type: 'checkbox',
    class: 'checkbox',
    checked,
    'aria-describedby': hint ? hintId : null,
    onchange: () => onChange(input.checked),
  });
  const wrap = h(
    'div',
    { class: 'check-row' },
    input,
    h(
      'label',
      { for: id },
      h('span', { class: 'check-label' }, label),
      hint ? h('span', { id: hintId, class: 'check-hint' }, hint) : null,
    ),
  );
  return { wrap, input };
}

/** A group of radio buttons styled as large tiles. */
export function radioGroup<V extends string | number>(
  legend: string,
  name: string,
  options: { value: V; label: string; srLabel?: string }[],
  selected: V,
  onChange: (value: V) => void,
  className = 'tiles',
): HTMLFieldSetElement {
  return h(
    'fieldset',
    { class: `radio-group ${className}` },
    h('legend', {}, legend),
    h(
      'div',
      { class: 'radio-options' },
      options.map((opt) => {
        const id = uniqueId(name);
        return h(
          'div',
          { class: 'radio-option' },
          h('input', {
            type: 'radio',
            id,
            name,
            value: String(opt.value),
            checked: opt.value === selected,
            onchange: () => onChange(opt.value),
          }),
          h('label', { for: id, 'aria-label': opt.srLabel ?? null }, opt.label),
        );
      }),
    ),
  );
}
