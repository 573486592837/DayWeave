import { h } from '../core/dom.js';
import { t } from '../i18n/i18n.js';
import { btn, iconButton } from './controls.js';

const stack = [];
let escBound = false;

function onKey(e) {
  if (e.key === 'Escape' && stack.length) {
    e.preventDefault();
    e.stopPropagation();
    stack[stack.length - 1].close();
  }
}

export function openModal({
  title = '',
  body,
  footer,
  size = '',
  className = '',
  onClose,
  closeOnBackdrop = true,
  initialFocus,
} = {}) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const modal = h('div', {
    class: `modal ${size} ${className}`.trim(),
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title,
  });
  const titleEl = h('h2', {}, title);
  const closeBtn = iconButton('x', t('common.close'), () => entry.close());
  const header = h('div', { class: 'modal-header' }, [titleEl, closeBtn]);
  const bodyEl = h('div', { class: 'modal-body' }, body || null);
  modal.append(header, bodyEl);
  let footerEl = null;
  if (footer) {
    footerEl = h('div', { class: 'modal-footer' }, footer);
    modal.append(footerEl);
  }
  backdrop.append(modal);
  document.getElementById('modal-root').append(backdrop);

  const entry = {
    backdrop,
    modal,
    body: bodyEl,
    footer: footerEl,
    close() {
      if (!entry.open) return;
      entry.open = false;
      backdrop.remove();
      const idx = stack.indexOf(entry);
      if (idx >= 0) stack.splice(idx, 1);
      onClose?.();
    },
    setTitle(text) {
      titleEl.textContent = text;
    },
    open: true,
  };
  stack.push(entry);

  if (!escBound) {
    document.addEventListener('keydown', onKey);
    escBound = true;
  }
  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop && closeOnBackdrop) entry.close();
  });
  requestAnimationFrame(() => {
    const target =
      initialFocus ||
      modal.querySelector('input:not([type="hidden"]):not([disabled]), textarea, select, button.primary');
    target?.focus?.();
  });
  return entry;
}

export function openModalCount() {
  return stack.length;
}

export function closeAllModals() {
  while (stack.length) stack[stack.length - 1].close();
}

export function confirmDialog({
  title,
  message,
  confirmText = t('common.confirm'),
  cancelText = t('common.cancel'),
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      entry.close();
      resolve(value);
    };
    const entry = openModal({
      title,
      body: h('p', { class: 'modal-text' }, message),
      size: 'narrow',
      footer: [
        btn({ label: cancelText, variant: 'ghost', onClick: () => done(false) }),
        btn({
          label: confirmText,
          variant: danger ? 'danger' : 'primary',
          onClick: () => done(true),
        }),
      ],
      onClose: () => done(false),
    });
  });
}

export function promptDialog({
  title,
  label,
  value = '',
  placeholder = '',
  confirmText = t('common.save'),
  validate,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const input = h('input', { type: 'text', value, placeholder });
    const error = h('p', { class: 'error-text' });
    const done = (val) => {
      if (settled) return;
      settled = true;
      entry.close();
      resolve(val);
    };
    const submit = () => {
      const val = input.value.trim();
      if (validate) {
        const msg = validate(val);
        if (msg) {
          error.textContent = msg;
          input.focus();
          return;
        }
      }
      done(val);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
    const entry = openModal({
      title,
      body: [h('div', { class: 'field' }, [label ? h('label', {}, label) : null, input]), error],
      size: 'narrow',
      footer: [
        btn({ label: t('common.cancel'), variant: 'ghost', onClick: () => done(null) }),
        btn({ label: confirmText, variant: 'primary', onClick: submit }),
      ],
      onClose: () => done(null),
      initialFocus: input,
    });
    setTimeout(() => input.select(), 30);
  });
}
