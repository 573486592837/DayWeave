import { h } from '../core/dom.js';
import { iconSvg } from './icons.js';

const root = () => document.getElementById('toast-root');

export function toast(message, { type = 'info', title = '', duration = 3200, icon = '' } = {}) {
  const el = h('div', { class: `toast ${type}`, role: 'status', 'aria-live': 'polite' }, [
    icon ? h('span', { html: iconSvg(icon, 18) }) : null,
    h('div', { class: 'toast-body' }, [
      title ? h('div', { class: 'toast-title' }, title) : null,
      h('div', {}, message),
    ]),
    h('button', {
      class: 'toast-close',
      type: 'button',
      'aria-label': 'close',
      text: '×',
      onclick: () => remove(),
    }),
  ]);
  const remove = () => {
    if (!el.isConnected) return;
    el.style.transition = 'opacity .2s, transform .2s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 200);
  };
  root().append(el);
  if (duration > 0) setTimeout(remove, duration);
  return { el, close: remove };
}

export function reminderToast({ title, body, onClick, duration = 15000 }) {
  const entry = toast(body, {
    type: 'reminder',
    title,
    icon: 'bell',
    duration,
  });
  if (onClick) {
    entry.el.style.cursor = 'pointer';
    entry.el.addEventListener('click', (e) => {
      if (e.target.closest('.toast-close')) return;
      onClick();
    });
  }
  return entry;
}
