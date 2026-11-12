import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { getLocale } from '../i18n/i18n.js';
import { formatDate, formatWeekday } from '../i18n/format.js';
import { registerWidget } from './registry.js';

function digital(now, config) {
  const settings = store.settings();
  const time = new Intl.DateTimeFormat(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    second: config.showSeconds ? '2-digit' : undefined,
    hour12: settings.timeFormat === '12h',
  }).format(now);
  return h('div', { class: 'clock-time tnum' }, time);
}

function analog(now) {
  const sec = now.getSeconds();
  const min = now.getMinutes() + sec / 60;
  const hour = (now.getHours() % 12) + min / 60;
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const angle = i * 30;
    return `<line class="tick" x1="50" y1="7" x2="50" y2="${i % 3 === 0 ? 13 : 11}" transform="rotate(${angle} 50 50)" />`;
  }).join('');
  return h('div', {
    style: { width: '100%', display: 'grid', placeItems: 'center' },
    html: `<svg class="clock-analog" viewBox="0 0 100 100" role="img">
      <circle class="face" cx="50" cy="50" r="46" stroke-width="2" />
      ${ticks}
      <line class="hand" x1="50" y1="50" x2="50" y2="30" stroke-width="4" transform="rotate(${hour * 30} 50 50)" />
      <line class="hand" x1="50" y1="50" x2="50" y2="20" stroke-width="2.6" transform="rotate(${min * 6} 50 50)" />
      <line class="hand hand-second" x1="50" y1="56" x2="50" y2="16" stroke-width="1.2" transform="rotate(${sec * 6} 50 50)" />
      <circle cx="50" cy="50" r="2.4" fill="currentColor" />
    </svg>`,
  });
}

export function renderClock(container, widget) {
  const el = h('div', { class: 'clock' });
  container.append(el);
  const config = widget.config || {};

  function paint() {
    const now = new Date();
    el.replaceChildren();
    if (config.mode === 'analog') {
      el.append(analog(now));
    } else {
      el.append(digital(now, config));
    }
    if (config.showDate !== false) {
      el.append(
        h('div', { class: 'clock-date' }, `${formatWeekday(now, true)} · ${formatDate(now)}`),
      );
    }
  }

  paint();
  const timer = setInterval(paint, 1000);
  return () => clearInterval(timer);
}

registerWidget('clock', renderClock);
