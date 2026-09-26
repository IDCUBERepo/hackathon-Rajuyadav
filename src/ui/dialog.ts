import { t } from '../i18n';
import { h, icon, uniqueId, type Child } from './dom';

export interface DialogHandle {
  dialog: HTMLDialogElement;
  body: HTMLElement;
  close: () => void;
}

/**
 * Open a modal <dialog>. Native showModal() gives us focus trapping, Escape to
 * close and an inert background in every current browser.
 */
export function openDialog(
  title: string,
  content: Child | Child[],
  options: { onClose?: () => void; wide?: boolean; className?: string } = {},
): DialogHandle {
  const titleId = uniqueId('dialog-title');
  const body = h('div', { class: 'dialog-body' }, content);
  const classes = ['dialog', options.wide ? 'dialog-wide' : '', options.className ?? ''].filter(Boolean).join(' ');
  const dialog = h(
    'dialog',
    { class: classes, 'aria-labelledby': titleId },
    h(
      'div',
      { class: 'dialog-header' },
      h('h2', { id: titleId }, title),
      h(
        'button',
        { type: 'button', class: 'btn btn-quiet', onclick: () => dialog.close() },
        icon('✕'),
        t('close'),
      ),
    ),
    body,
    h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true', 'data-live': 'polite' }),
    h('div', { class: 'sr-only', 'aria-live': 'assertive', 'aria-atomic': 'true', 'data-live': 'assertive' }),
  );
  dialog.addEventListener('close', () => {
    dialog.remove();
    options.onClose?.();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
  return { dialog, body, close: () => dialog.close() };
}

/** Ask a yes/no question. Resolves true only if the user confirms. */
export function confirmDialog(title: string, message: string, confirmLabel = t('confirm')): Promise<boolean> {
  return new Promise((resolve) => {
    let confirmed = false;
    const cancelBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, t('cancel'));
    const okBtn = h('button', { type: 'button', class: 'btn btn-primary' }, confirmLabel);
    const handle = openDialog(
      title,
      [h('p', {}, message), h('div', { class: 'button-row' }, cancelBtn, okBtn)],
      { onClose: () => resolve(confirmed) },
    );
    cancelBtn.addEventListener('click', () => handle.close());
    okBtn.addEventListener('click', () => {
      confirmed = true;
      handle.close();
    });
    // Safer default: focus Cancel so an accidental Enter does not confirm.
    cancelBtn.focus();
  });
}
