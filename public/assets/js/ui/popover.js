import { h } from '../core/dom.js';
import { iconSvg } from './icons.js';

let active = null;

// 工具栏/菜单通用浮层：点击外部或 Esc 关闭
export function openPopover(anchor, content, { align = 'end', width } = {}) {
  closePopover();
  const pop = h('div', { class: 'popover', style: { visibility: 'hidden' } }, content);
  if (width) pop.style.minWidth = `${width}px`;
  document.body.append(pop);
  const rect = anchor.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();
  let left = align === 'start' ? rect.left : rect.right - popRect.width;
  left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));
  let top = rect.bottom + 6;
  if (top + popRect.height > window.innerHeight - 8) {
    top = Math.max(8, rect.top - popRect.height - 6);
  }
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.visibility = 'visible';

  const onPointer = (e) => {
    if (!pop.contains(e.target) && !anchor.contains(e.target)) closePopover();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePopover();
    }
  };
  const onResize = () => closePopover();
  setTimeout(() => document.addEventListener('pointerdown', onPointer), 0);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  active = {
    pop,
    close() {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onResize);
      pop.remove();
      active = null;
    },
  };
  return active;
}

export function closePopover() {
  active?.close();
}

export function menuItem({ icon, label, onClick, active: isActive = false, disabled = false }) {
  return h(
    'button',
    {
      type: 'button',
      class: isActive ? 'active' : '',
      disabled,
      onclick: () => {
        closePopover();
        onClick?.();
      },
    },
    [icon ? h('span', { html: iconSvg(icon, 15) }) : null, h('span', {}, label)],
  );
}

export function menuSeparator() {
  return h('div', { class: 'sep' });
}

export function menuTitle(text) {
  return h('div', { class: 'popover-title' }, text);
}
