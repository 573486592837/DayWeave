import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { t } from '../i18n/i18n.js';
import { formatPercent, startOfDay } from '../i18n/format.js';
import { registerWidget } from './registry.js';

function bounds(mode, now) {
  if (mode === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end };
  }
  if (mode === 'day') {
    const start = startOfDay(now);
    const end = new Date(start.getTime() + 86_400_000);
    return { start, end };
  }
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return { start, end };
}

export function renderProgress(container, widget) {
  const mode = widget.config?.mode || 'year';
  const wrap = h('div', { class: 'progress' });
  container.append(wrap);
  let timer = null;

  const paint = () => {
    const now = new Date();
    const { start, end } = bounds(mode, now);
    const pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
    const label = t(`widget.progress.${mode}`);
    wrap.replaceChildren(
      h('div', { class: 'progress-top' }, [
        h('span', { class: 'progress-label' }, label),
        h('span', { class: 'progress-value tnum' }, formatPercent(pct)),
      ]),
      h('div', { class: 'progress-track' }, [
        h('div', { class: 'progress-fill', style: { width: `${pct}%` } }),
      ]),
      h('div', { class: 'progress-sub' }, [
        h('span', {}, `${t('widget.progress.elapsed')} ${formatPercent(pct)}`),
        h('span', {}, `${t('widget.progress.remaining')} ${formatPercent(100 - pct)}`),
      ]),
    );
  };

  paint();
  timer = setInterval(paint, 30_000);
  return () => clearInterval(timer);
}

registerWidget('progress', renderProgress);
