import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { t } from '../i18n/i18n.js';
import {
  addDays,
  formatDateShort,
  formatRange,
  formatWeekday,
  sameDay,
  startOfDay,
} from '../i18n/format.js';
import { emptyState } from '../ui/controls.js';
import { iconSvg } from '../ui/icons.js';
import { openEventEditor } from '../events/event-editor.js';
import { expandEvents } from '../events/repeat.js';
import { registerWidget } from './registry.js';

export function renderEventList(container, widget) {
  const config = widget.config || {};
  const range = config.range || '3d';
  const days = range === 'today' ? 1 : range === '7d' ? 7 : 3;
  const showDone = config.showDone !== false;
  const today = startOfDay(new Date());
  const start = today;
  const end = addDays(today, days - 1);
  const h12 = store.settings().timeFormat === '12h';
  const instances = expandEvents(store.data.events, start, end)
    .filter((inst) => showDone || !inst.done)
    .sort((a, b) => a.occurrenceStart - b.occurrenceStart);

  const list = h('div', { class: 'event-list' });
  if (!instances.length) {
    list.append(emptyState(t('widget.eventList.empty'), 'calendar'));
  }
  const display = document.body.classList.contains('display-mode');
  for (const inst of instances) {
    const color = store.category(inst.categoryId)?.color || 'var(--primary)';
    const dayLabel = sameDay(inst.occurrenceStart, today)
      ? formatRange(inst.occurrenceStart, inst.occurrenceEnd, h12).split(' – ')[0]
      : `${formatWeekday(inst.occurrenceStart)} ${formatDateShort(inst.occurrenceStart)}`;
    const row = h('button', {
      class: `list-row ${inst.done ? 'done' : ''}`,
      type: 'button',
      style: { '--ev-color': color },
      onclick: () => {
        if (display) return;
        const source = store.data.events.find((e) => e.id === (inst.sourceId || inst.id));
        if (!source) return;
        openEventEditor({ event: source, instance: inst.isRepeat ? inst : null });
      },
    }, [
      h('span', { class: 'list-dot' }),
      h('span', { class: 'list-main' }, [
        h('span', { class: 'list-title' }, inst.title || t('event.untitled')),
        h('span', { class: 'list-meta' }, [
          inst.allDay ? t('view.allDay') : dayLabel,
          inst.isRepeat ? h('span', { class: 'ev-repeat', html: iconSvg('repeat', 10) }) : null,
        ]),
      ]),
    ]);
    list.append(row);
  }
  container.append(list);
}

registerWidget('eventList', renderEventList);
