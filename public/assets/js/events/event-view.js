import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { t, getLocale } from '../i18n/i18n.js';
import {
  addDays,
  addMonths,
  dateKey,
  formatDate,
  formatMonthYear,
  formatRange,
  formatRangeLabel,
  formatWeekday,
  monthGrid,
  sameDay,
  startOfWeek,
  startOfDay,
  toDateTimeString,
} from '../i18n/format.js';
import { iconSvg } from '../ui/icons.js';
import { openModal, openModalCount, confirmDialog } from '../ui/modal.js';
import { btn, segmented } from '../ui/controls.js';
import { toast } from '../ui/toast.js';
import { openEventEditor, askScope } from './event-editor.js';
import { expandEvents, instanceKey } from './repeat.js';

const HOUR_HEIGHT = 52;
const cursorByWidget = new Map();
let selectedInstance = null;

function isDisplayMode() {
  return document.body.classList.contains('display-mode');
}

function categoryColor(id) {
  return store.category(id)?.color || 'var(--primary)';
}

function sourceOf(instance) {
  return store.data.events.find((e) => e.id === (instance.sourceId || instance.id)) || null;
}

function editInstance(instance) {
  if (isDisplayMode()) return;
  const source = sourceOf(instance);
  if (!source) return;
  selectedInstance = instance;
  document.querySelectorAll('.ev.selected').forEach((el) => el.classList.remove('selected'));
  const key = instanceKey(instance);
  document.querySelectorAll('.ev').forEach((el) => {
    if (el.dataset.key === key) el.classList.add('selected');
  });
  openEventEditor({ event: source, instance: instance.isRepeat ? instance : null });
}

async function deleteSelectedInstance() {
  if (!selectedInstance) return;
  const inst = selectedInstance;
  const source = sourceOf(inst);
  if (!source) {
    selectedInstance = null;
    return;
  }
  if (source.repeat) {
    const scope = await askScope('delete');
    if (!scope) return;
    store.update((data) => {
      if (scope === 'all') data.events = data.events.filter((e) => e.id !== source.id);
      else {
        const idx = source.overrides.findIndex((o) => o.date === inst.instanceDate);
        const record = { date: inst.instanceDate, deleted: true };
        if (idx >= 0) source.overrides[idx] = record;
        else source.overrides.push(record);
      }
    }, { reason: 'events' });
  } else {
    const ok = await confirmDialog({
      title: t('event.deleteTitle'),
      message: t('event.deleteConfirm', { title: source.title || t('event.untitled') }),
      confirmText: t('common.delete'),
      danger: true,
    });
    if (!ok) return;
    store.update((data) => {
      data.events = data.events.filter((e) => e.id !== source.id);
    }, { reason: 'events' });
  }
  selectedInstance = null;
  toast(t('event.deleted'));
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Delete' || !selectedInstance) return;
  if (isDisplayMode() || document.body.classList.contains('layout-editing')) return;
  if (openModalCount() > 0) return;
  if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  e.preventDefault();
  deleteSelectedInstance();
});

function toggleDone(instance, event, el) {
  if (isDisplayMode()) return;
  event.stopPropagation();
  const source = sourceOf(instance);
  if (!source) return;
  store.update(() => {
    source.done = !source.done;
    source.updatedAt = new Date().toISOString();
  }, { reason: 'events' });
}

function snapMinutes(minutes) {
  return Math.round(minutes / 15) * 15;
}

function eventElement(instance, { compact = false } = {}) {
  const color = categoryColor(instance.categoryId);
  const title = instance.title || t('event.untitled');
  const el = h('div', {
    class: `ev ${instance.done ? 'done' : ''} ${compact ? 'compact' : ''} ${
      selectedInstance && instanceKey(selectedInstance) === instanceKey(instance) ? 'selected' : ''
    }`,
    style: { '--ev-color': color },
    dataset: { key: instanceKey(instance) },
    title,
  });
  const titleRow = h('div', { class: 'ev-title' }, [
    instance.isRepeat ? h('span', { class: 'ev-repeat', html: iconSvg('repeat', 11) }) : null,
    h('span', { class: 'ev-title-text' }, title),
  ]);
  const timeText = instance.allDay
    ? t('view.allDay')
    : formatRange(instance.occurrenceStart, instance.occurrenceEnd, store.settings().timeFormat === '12h');
  const timeEl = h('div', { class: 'ev-time' }, timeText);
  const check = h('button', {
    class: `ev-check ${instance.done ? 'checked' : ''}`,
    type: 'button',
    'aria-label': t('event.done'),
    html: iconSvg('check', 9),
    onclick: (e) => toggleDone(instance, e, el),
  });
  el.append(titleRow, timeEl, check);
  return el;
}

function monthChip(instance) {
  const color = categoryColor(instance.categoryId);
  const time = instance.allDay
    ? ''
    : `${formatRange(instance.occurrenceStart, instance.occurrenceEnd, store.settings().timeFormat === '12h').split(' – ')[0]} `;
  const chip = h('div', {
    class: `month-chip ${instance.done ? 'done' : ''}`,
    style: { '--ev-color': color },
    title: instance.title,
  }, `${instance.isRepeat ? '↻ ' : ''}${time}${instance.title || t('event.untitled')}`);
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    editInstance(instance);
  });
  return chip;
}

function layoutSegments(segments) {
  segments.sort((a, b) => a.start - b.start || b.end - a.end);
  const clusters = [];
  let cluster = [];
  let clusterEnd = -Infinity;
  for (const seg of segments) {
    if (cluster.length && seg.start >= clusterEnd) {
      clusters.push(cluster);
      cluster = [];
      clusterEnd = -Infinity;
    }
    cluster.push(seg);
    clusterEnd = Math.max(clusterEnd, seg.end);
  }
  if (cluster.length) clusters.push(cluster);
  for (const list of clusters) {
    const colEnds = [];
    for (const seg of list) {
      let col = 0;
      while (colEnds[col] != null && colEnds[col] > seg.start) col++;
      colEnds[col] = seg.end;
      seg.col = col;
    }
    for (const seg of list) seg.cols = colEnds.length;
  }
  return segments;
}

function collectAllDay(instances, day) {
  const key = dateKey(day);
  return instances.filter((inst) => {
    if (!inst.allDay) return false;
    const startKey = dateKey(inst.occurrenceStart);
    const endKey = dateKey(inst.occurrenceEnd);
    return key >= startKey && key <= endKey;
  });
}

function instancesOnDay(instances, day) {
  const key = dateKey(day);
  return instances.filter((inst) => {
    if (inst.allDay) {
      return key >= dateKey(inst.occurrenceStart) && key <= dateKey(inst.occurrenceEnd);
    }
    return dateKey(inst.occurrenceStart) === key;
  });
}

function dayDetail(day) {
  const instances = expandEvents(store.data.events, day, day);
  const list = h('div', { class: 'event-list', style: { maxHeight: '52vh' } });
  if (!instances.length) {
    list.append(h('div', { class: 'empty' }, t('view.noEvents')));
  }
  for (const inst of instances) {
    const color = categoryColor(inst.categoryId);
    const row = h('button', {
      class: `list-row ${inst.done ? 'done' : ''}`,
      type: 'button',
      style: { '--ev-color': color },
      onclick: () => {
        modal.close();
        editInstance(inst);
      },
    }, [
      h('span', { class: 'list-dot' }),
      h('span', { class: 'list-main' }, [
        h('span', { class: 'list-title' }, inst.title || t('event.untitled')),
        h('span', { class: 'list-meta' }, inst.allDay
          ? t('view.allDay')
          : formatRange(inst.occurrenceStart, inst.occurrenceEnd, store.settings().timeFormat === '12h')),
      ]),
      inst.isRepeat ? h('span', { class: 'ev-repeat', html: iconSvg('repeat', 11) }) : null,
    ]);
    list.append(row);
  }
  const defaultStart = new Date(day);
  defaultStart.setHours(9, 0, 0, 0);
  const modal = openModal({
    title: `${formatDate(day)} · ${t('view.dayDetail')}`,
    body: list,
    size: 'narrow',
    footer: [
      btn({ icon: 'plus', label: t('view.addOnDay'), variant: 'primary', onClick: () => {
        modal.close();
        openEventEditor({ initial: { start: toDateTimeString(defaultStart), end: toDateTimeString(new Date(defaultStart.getTime() + 3600_000)) } });
      } }),
    ],
  });
}

export function renderCalendarWidget(container, widget) {
  const settings = store.settings();
  const firstDay = settings.firstDayOfWeek;
  let view = widget.config.view || settings.defaultView || 'day';
  let cursor = cursorByWidget.get(widget.id) || new Date();
  const startHour = Math.min(22, Math.max(0, Number(widget.config.dayStart ?? settings.dayStartHour)));
  const endHour = Math.min(24, Math.max(startHour + 1, Number(widget.config.dayEnd ?? settings.dayEndHour)));

  const root = h('div', { class: 'cal' });
  container.append(root);
  let cleanups = [];

  function cleanup() {
    for (const fn of cleanups) fn();
    cleanups = [];
  }

  function persistView(next) {
    view = next;
    store.update(() => {
      widget.config.view = next;
    }, { reason: 'silent' });
  }

  function newEventAt(baseDate, hour = null) {
    const date = new Date(baseDate);
    if (hour != null) {
      date.setHours(hour, 0, 0, 0);
    } else {
      const now = new Date();
      date.setHours(Math.min(22, Math.max(8, Math.ceil((now.getHours() + now.getMinutes() / 60) * 2) / 2)), 0, 0, 0);
    }
    openEventEditor({
      initial: {
        start: toDateTimeString(date),
        end: toDateTimeString(new Date(date.getTime() + 3600_000)),
      },
    });
  }

  function buildHeader() {
    let title = '';
    if (view === 'month') title = formatMonthYear(cursor);
    else if (view === 'week') {
      const s = startOfWeek(cursor, firstDay);
      title = formatRangeLabel(s, addDays(s, 6));
    } else {
      title = `${formatWeekday(cursor, true)} · ${formatDate(cursor)}`;
    }
    const prev = h('button', { class: 'icon-btn', type: 'button', title: t('view.prev'), 'aria-label': t('view.prev'), html: iconSvg('chevronLeft', 14) });
    const next = h('button', { class: 'icon-btn', type: 'button', title: t('view.next'), 'aria-label': t('view.next'), html: iconSvg('chevronRight', 14) });
    const today = h('button', { class: 'btn small ghost', type: 'button' }, t('view.today'));
    prev.onclick = () => {
      if (view === 'month') cursor = addMonths(cursor, -1);
      else if (view === 'week') cursor = addDays(cursor, -7);
      else cursor = addDays(cursor, -1);
      cursorByWidget.set(widget.id, cursor);
      render();
    };
    next.onclick = () => {
      if (view === 'month') cursor = addMonths(cursor, 1);
      else if (view === 'week') cursor = addDays(cursor, 7);
      else cursor = addDays(cursor, 1);
      cursorByWidget.set(widget.id, cursor);
      render();
    };
    today.onclick = () => {
      cursor = new Date();
      cursorByWidget.set(widget.id, cursor);
      render();
    };
    const viewSeg = segmented(
      [
        { value: 'day', label: t('view.day') },
        { value: 'week', label: t('view.week') },
        { value: 'month', label: t('view.month') },
      ],
      view,
      (v) => {
        persistView(v);
        render();
      },
    );
    const addBtn = h('button', {
      class: 'icon-btn',
      type: 'button',
      title: t('view.newEvent'),
      'aria-label': t('view.newEvent'),
      html: iconSvg('plus', 16),
      onclick: () => newEventAt(cursor),
    });
    return h('div', { class: 'cal-head' }, [
      h('div', { class: 'cal-title' }, title),
      h('div', { class: 'cal-nav' }, [prev, today, next]),
      viewSeg,
      isDisplayMode() ? null : addBtn,
    ]);
  }

  function updateNowLine(lines) {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const top = ((minutes - startHour * 60) / 60) * HOUR_HEIGHT;
    for (const line of lines) {
      const isTodayCol = line.dataset.today === '1';
      line.style.display = isTodayCol && minutes >= startHour * 60 && minutes <= endHour * 60 ? '' : 'none';
      line.style.top = `${top}px`;
    }
  }

  function buildAllDayRow(days, instances) {
    const gutter = h('div', { class: 'allday-gutter' }, t('view.allDay'));
    const cells = h('div', { class: 'allday-cells' });
    for (const day of days) {
      const cell = h('div', { class: 'allday-cell' });
      if (!isDisplayMode()) {
        cell.addEventListener('click', (e) => {
          if (e.target !== cell) return;
          const key = dateKey(day);
          openEventEditor({
            initial: {
              start: `${key}T00:00:00`,
              end: `${key}T00:00:00`,
              allDay: true,
            },
          });
        });
      }
      for (const inst of collectAllDay(instances, day)) {
        const color = categoryColor(inst.categoryId);
        const chip = h('div', {
          class: `allday-chip ${inst.done ? 'done' : ''}`,
          style: { '--ev-color': color },
          title: inst.title,
        }, `${inst.isRepeat ? '↻ ' : ''}${inst.title || t('event.untitled')}`);
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          editInstance(inst);
        });
        cell.append(chip);
      }
      cells.append(cell);
    }
    return h('div', { class: 'allday-row' }, [gutter, cells]);
  }

  function buildWeekHead(days) {
    return h('div', { class: 'week-head' }, days.map((day) =>
      h('div', { class: `week-head-cell ${sameDay(day, new Date()) ? 'today' : ''}` }, [
        h('span', { class: 'wd' }, formatWeekday(day)),
        h('span', { class: 'dn' }, String(day.getDate())),
      ]),
    ));
  }

  function bindEventDrag(el, inst, originCol, colsEl) {
    if (isDisplayMode()) return;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.ev-check')) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      let mode = 'move';
      if (rect.height > 16 && offsetY <= 6) mode = 'top';
      else if (rect.height > 16 && rect.height - offsetY <= 6) mode = 'bottom';
      el.style.cursor = mode === 'move' ? 'grabbing' : 'ns-resize';

      const colEls = Array.from(colsEl.children).filter((c) => c.classList.contains('day-col'));
      const colRects = colEls.map((c) => {
        const r = c.getBoundingClientRect();
        return { left: r.left, right: r.right };
      });
      const sx = e.clientX;
      const sy = e.clientY;
      const origStart = inst.occurrenceStart;
      const origEnd = inst.occurrenceEnd;
      const origTop = parseFloat(el.style.top) || 0;
      const origHeight = parseFloat(el.style.height) || 20;
      const originLeft = colRects[originCol]?.left || 0;
      let moved = false;
      let deltaMin = 0;
      let deltaDays = 0;

      const colAt = (x) => {
        let idx = originCol;
        let best = Infinity;
        colRects.forEach((r, i) => {
          if (x >= r.left && x <= r.right) {
            idx = i;
            best = 0;
          } else {
            const dist = Math.min(Math.abs(x - r.left), Math.abs(x - r.right));
            if (dist < best) {
              best = dist;
              idx = i;
            }
          }
        });
        return idx;
      };

      const onMove = (ev) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        el.classList.add('dragging');
        if (mode === 'move') {
          deltaDays = colAt(ev.clientX) - originCol;
          deltaMin = snapMinutes((dy / HOUR_HEIGHT) * 60);
          const shiftX = (colRects[originCol + deltaDays]?.left || originLeft) - originLeft;
          el.style.transform = `translate(${shiftX}px, ${(deltaMin / 60) * HOUR_HEIGHT}px)`;
        } else if (mode === 'top') {
          const maxDelta = Math.floor(((origEnd - origStart) / 60000 - 15) / 15) * 15;
          deltaMin = Math.min(maxDelta, snapMinutes((dy / HOUR_HEIGHT) * 60));
          el.style.top = `${origTop + (deltaMin / 60) * HOUR_HEIGHT}px`;
          el.style.height = `${Math.max(18, origHeight - (deltaMin / 60) * HOUR_HEIGHT)}px`;
        } else {
          const minDelta = Math.ceil((15 - (origEnd - origStart) / 60000) / 15) * 15;
          deltaMin = Math.max(minDelta, snapMinutes((dy / HOUR_HEIGHT) * 60));
          el.style.height = `${Math.max(18, origHeight + (deltaMin / 60) * HOUR_HEIGHT)}px`;
        }
      };

      const finish = async () => {
        window.removeEventListener('pointermove', onMove);
        if (!moved) {
          editInstance(inst);
          return;
        }
        const shift = deltaDays * 86_400_000 + deltaMin * 60_000;
        let newStart;
        let newEnd;
        if (mode === 'move') {
          newStart = new Date(origStart.getTime() + shift);
          newEnd = new Date(origEnd.getTime() + shift);
        } else if (mode === 'top') {
          newStart = new Date(origStart.getTime() + deltaMin * 60_000);
          newEnd = origEnd;
        } else {
          newStart = origStart;
          newEnd = new Date(origEnd.getTime() + deltaMin * 60_000);
        }
        await commitDrag(inst, newStart, newEnd, mode);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish, { once: true });
      window.addEventListener('pointercancel', finish, { once: true });
    });
  }

  async function commitDrag(inst, newStart, newEnd, mode) {
    const source = sourceOf(inst);
    if (!source) {
      render();
      return;
    }
    const newStartStr = toDateTimeString(newStart);
    const newEndStr = toDateTimeString(newEnd);
    if (!source.repeat) {
      store.update(() => {
        source.start = newStartStr;
        source.end = newEndStr;
        source.updatedAt = new Date().toISOString();
      }, { reason: 'events' });
      return;
    }
    const kind = mode === 'move' ? 'move' : 'resize';
    const scope = await askScope(kind);
    if (!scope) {
      render();
      return;
    }
    store.update(() => {
      if (scope === 'all') {
        const deltaStart = newStart - inst.occurrenceStart;
        const deltaEnd = newEnd - inst.occurrenceEnd;
        source.start = toDateTimeString(new Date(new Date(source.start).getTime() + deltaStart));
        source.end = toDateTimeString(new Date(new Date(source.end).getTime() + deltaEnd));
      } else {
        const idx = source.overrides.findIndex((o) => o.date === inst.instanceDate);
        const record = { ...(idx >= 0 ? source.overrides[idx] : {}), date: inst.instanceDate, start: newStartStr, end: newEndStr };
        delete record.deleted;
        if (idx >= 0) source.overrides[idx] = record;
        else source.overrides.push(record);
      }
      source.updatedAt = new Date().toISOString();
    }, { reason: 'events' });
  }

  function bindCreateOnColumn(col, day) {
    if (isDisplayMode()) return;
    col.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.ev')) return;
      e.preventDefault();
      const rect = col.getBoundingClientRect();
      const startY = e.clientY - rect.top;
      const baseMinutes = startHour * 60;
      const toMinutes = (y) => Math.max(baseMinutes, Math.min(endHour * 60, baseMinutes + snapMinutes((y / HOUR_HEIGHT) * 60)));
      let moveY = startY;
      let moved = false;
      const ghost = h('div', { class: 'create-ghost' });
      col.append(ghost);
      const paint = () => {
        const a = Math.min(startY, moveY);
        const b = Math.max(startY, moveY);
        const startMin = toMinutes(a);
        const endMin = Math.max(startMin + 15, toMinutes(b));
        const top = ((startMin - baseMinutes) / 60) * HOUR_HEIGHT;
        ghost.style.top = `${top}px`;
        ghost.style.height = `${((endMin - startMin) / 60) * HOUR_HEIGHT}px`;
        const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        ghost.textContent = `${fmt(startMin)} – ${fmt(endMin)}`;
        return { startMin, endMin };
      };
      let range = paint();
      const onMove = (ev) => {
        moveY = ev.clientY - rect.top;
        if (Math.abs(moveY - startY) > 3) moved = true;
        range = paint();
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        ghost.remove();
        if (!moved) {
          const start = new Date(day);
          start.setHours(Math.floor(range.startMin / 60), range.startMin % 60, 0, 0);
          openEventEditor({
            initial: {
              start: toDateTimeString(start),
              end: toDateTimeString(new Date(start.getTime() + 3600_000)),
            },
          });
          return;
        }
        if (range.endMin - range.startMin < 15) return;
        const start = new Date(day);
        start.setHours(Math.floor(range.startMin / 60), range.startMin % 60, 0, 0);
        const end = new Date(day);
        end.setHours(Math.floor(range.endMin / 60), range.endMin % 60, 0, 0);
        openEventEditor({
          initial: { start: toDateTimeString(start), end: toDateTimeString(end) },
        });
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
      window.addEventListener('pointercancel', onUp, { once: true });
    });
  }

  function buildTimeline(days, instances) {
    const top = h('div', { class: 'cal-top' });
    if (view === 'week') top.append(buildWeekHead(days));
    top.append(buildAllDayRow(days, instances));
    const totalHeight = (endHour - startHour) * HOUR_HEIGHT;
    const gutter = h('div', { class: 'time-gutter' });
    for (let hh = startHour; hh <= endHour; hh++) {
      gutter.append(h('div', { class: 'hour-label', style: { top: `${(hh - startHour) * HOUR_HEIGHT}px` } }, this_formatHour(hh)));
    }
    const cols = h('div', { class: 'day-cols' });
    const nowLines = [];
    days.forEach((day, dayIndex) => {
      const col = h('div', {
        class: `day-col ${sameDay(day, new Date()) ? 'today' : ''} ${[0, 6].includes(day.getDay()) ? 'weekend' : ''}`,
        style: { height: `${totalHeight}px` },
        dataset: { day: dateKey(day) },
      });
      bindCreateOnColumn(col, day);
      const dayStart = startOfDay(day);
      const dayEnd = addDays(dayStart, 1);
      const segments = [];
      for (const inst of instances) {
        if (inst.allDay) continue;
        const segStart = new Date(Math.max(inst.occurrenceStart.getTime(), dayStart.getTime()));
        const segEnd = new Date(Math.min(inst.occurrenceEnd.getTime(), dayEnd.getTime()));
        if (segEnd <= segStart) continue;
        const viewStart = new Date(dayStart);
        viewStart.setHours(startHour, 0, 0, 0);
        const viewEnd = new Date(dayStart);
        viewEnd.setHours(endHour, 0, 0, 0);
        const visibleStart = new Date(Math.max(segStart.getTime(), viewStart.getTime()));
        const visibleEnd = new Date(Math.min(segEnd.getTime(), viewEnd.getTime()));
        if (visibleEnd <= visibleStart) continue;
        segments.push({ inst, start: segStart.getTime(), end: segEnd.getTime(), visibleStart, visibleEnd });
      }
      layoutSegments(segments);
      const colorFor = (inst) => categoryColor(inst.categoryId);
      for (const seg of segments) {
        const top = ((seg.visibleStart - (() => { const d = new Date(day); d.setHours(startHour, 0, 0, 0); return d; })()) / 3_600_000) * HOUR_HEIGHT;
        const height = Math.max(18, ((seg.visibleEnd - seg.visibleStart) / 3_600_000) * HOUR_HEIGHT - 1);
        const el = eventElement(seg.inst, { compact: height < 34 });
        el.style.top = `${Math.max(0, top)}px`;
        el.style.height = `${height}px`;
        el.style.left = `calc(${(seg.col / seg.cols) * 100}% + 1px)`;
        el.style.width = `calc(${100 / seg.cols}% - 3px)`;
        el.style.setProperty('--ev-color', colorFor(seg.inst));
        bindEventDrag(el, seg.inst, dayIndex, cols);
        col.append(el);
      }
      if (sameDay(day, new Date())) {
        const line = h('div', { class: 'now-line', dataset: { today: '1' } });
        col.append(line);
        nowLines.push(line);
      }
      cols.append(col);
    });
    const grid = h('div', { class: 'time-grid', style: { '--hour-height': `${HOUR_HEIGHT}px` } }, [gutter, cols]);
    const body = h('div', { class: 'cal-body' }, grid);
    updateNowLine(nowLines);
    const timer = setInterval(() => updateNowLine(nowLines), 30_000);
    cleanups.push(() => clearInterval(timer));
    requestAnimationFrame(() => {
      if (nowLines.length) {
        const line = nowLines[0];
        body.scrollTop = Math.max(0, (parseFloat(line.style.top) || 0) - 80);
      }
    });
    return h('div', { class: 'cal-time' }, [top, body]);
  }

  function this_formatHour(hh) {
    return new Intl.DateTimeFormat(getLocale(), {
      hour: '2-digit',
      minute: '2-digit',
      hour12: store.settings().timeFormat === '12h',
    }).format(new Date(2000, 0, 1, hh, 0));
  }

  function buildMonth(instances) {
    const gridDays = monthGrid(cursor, firstDay);
    const gridStart = gridDays[0];
    const gridEnd = addDays(gridDays[41], 1);
    const monthInstances = expandEvents(store.data.events, gridStart, gridEnd);
    const head = h('div', { class: 'month-head' }, Array.from({ length: 7 }, (_, i) =>
      h('span', {}, formatWeekday(addDays(startOfWeek(new Date(), firstDay), i))),
    ));
    const grid = h('div', { class: 'month-grid' });
    for (const day of gridDays) {
      const cell = h('div', {
        class: `month-cell ${day.getMonth() !== cursor.getMonth() ? 'outside' : ''} ${sameDay(day, new Date()) ? 'today' : ''}`,
      });
      cell.append(h('span', { class: 'month-date' }, String(day.getDate())));
      const items = instancesOnDay(monthInstances, day);
      const shown = items.slice(0, 3);
      for (const inst of shown) {
        const chip = monthChip(inst);
        // 重复图标已在文本前缀中处理
        cell.append(chip);
      }
      if (items.length > 3) {
        cell.append(h('div', { class: 'month-more' }, t('view.more', { n: items.length - 3 })));
      }
      cell.addEventListener('click', () => {
        if (isDisplayMode()) return;
        dayDetail(day);
      });
      grid.append(cell);
    }
    return h('div', { class: 'cal-body', style: { overflow: 'hidden', display: 'flex', flexDirection: 'column' } }, [
      h('div', { class: 'month' }, [head, grid]),
    ]);
  }

  function buildMobileWeek(days, instances) {
    const wrap = h('div', { class: 'mobile-week' });
    for (const day of days) {
      const items = instancesOnDay(instances, day);
      const isToday = sameDay(day, new Date());
      const expanded = isToday;
      const body = h('div', { class: 'mobile-day-body' });
      body.hidden = !expanded;
      if (!items.length) {
        body.append(h('div', { class: 'mobile-day-empty' }, t('view.noEvents')));
      }
      for (const inst of items) {
        const color = categoryColor(inst.categoryId);
        const row = h('button', {
          class: `mobile-ev ${inst.done ? 'done' : ''}`,
          type: 'button',
          style: { '--ev-color': color },
          onclick: () => editInstance(inst),
        }, [
          h('span', { class: 't' }, inst.allDay ? t('view.allDay') : formatRange(inst.occurrenceStart, inst.occurrenceEnd, store.settings().timeFormat === '12h').split(' – ')[0]),
          h('span', { class: 'ellipsis', style: { flex: '1' } }, `${inst.isRepeat ? '↻ ' : ''}${inst.title || t('event.untitled')}`),
          h('span', {
            class: `ev-check ${inst.done ? 'checked' : ''}`,
            style: { position: 'static', width: '18px', height: '18px', opacity: '1' },
            html: iconSvg('check', 10),
            onclick: (e) => toggleDone(inst, e, row),
          }),
        ]);
        body.append(row);
      }
      const head = h('div', { class: `mobile-day-head ${isToday ? 'today' : ''}` }, [
        h('span', {}, `${formatWeekday(day, true)}`),
        h('span', { class: 'dim' }, formatDate(day)),
        h('span', { class: 'count' }, t('view.eventCount', { n: items.length })),
      ]);
      head.addEventListener('click', () => {
        body.hidden = !body.hidden;
      });
      wrap.append(h('div', { class: 'mobile-day' }, [head, body]));
    }
    return h('div', { class: 'cal-body' }, wrap);
  }

  function buildBody() {
    if (view === 'month') return buildMonth();
    const days = view === 'day'
      ? [startOfDay(cursor)]
      : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor, firstDay), i));
    const instances = expandEvents(store.data.events, days[0], days[days.length - 1]);
    if (view === 'week' && window.matchMedia('(max-width: 767px)').matches) {
      return buildMobileWeek(days, instances);
    }
    return buildTimeline(days, instances);
  }

  function render() {
    cleanup();
    root.replaceChildren(buildHeader(), buildBody());
  }

  render();
  return cleanup;
}
