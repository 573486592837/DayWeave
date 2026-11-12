import { store } from '../core/store.js';
import { h } from '../core/dom.js';
import { createEvent } from '../core/schema.js';
import { getLocale, t } from '../i18n/i18n.js';
import {
  addDays,
  dateKey,
  dayDiff,
  formatWeekday,
  parseDT,
  startOfWeek,
  toDateTimeString,
} from '../i18n/format.js';
import { btn, iconButton, select } from '../ui/controls.js';
import { confirmDialog, openModal } from '../ui/modal.js';
import { openCategoryManager } from '../ui/categories.js';
import { toast } from '../ui/toast.js';

// 仅此一次 / 所有重复 询问
export function askScope(kind) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      entry.close();
      resolve(value);
    };
    const entry = openModal({
      title: t(`event.scope.${kind}Title`),
      body: h('p', { class: 'modal-text' }, t(`event.scope.${kind}Text`)),
      size: 'narrow',
      footer: [
        btn({ label: t('common.cancel'), variant: 'ghost', onClick: () => finish(null) }),
        btn({ label: t('event.scope.thisOne'), variant: 'ghost', onClick: () => finish('one') }),
        btn({ label: t('event.scope.all'), variant: 'primary', onClick: () => finish('all') }),
      ],
      onClose: () => finish(null),
    });
  });
}

function baseOccurrence(source, dayKey) {
  const srcStart = parseDT(source.start);
  const srcEnd = parseDT(source.end);
  let start;
  let end;
  if (source.allDay) {
    start = new Date(`${dayKey}T00:00:00`);
    end = addDays(start, Math.max(0, dayDiff(srcEnd, srcStart)));
  } else {
    start = new Date(`${dayKey}T00:00:00`);
    start.setHours(srcStart.getHours(), srcStart.getMinutes(), 0, 0);
    end = new Date(start.getTime() + (srcEnd - srcStart));
  }
  return {
    title: source.title,
    note: source.note || '',
    categoryId: source.categoryId || null,
    done: Boolean(source.done),
    allDay: Boolean(source.allDay),
    start: toDateTimeString(start),
    end: toDateTimeString(end),
  };
}

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function openEventEditor({ event = null, instance = null, initial = null } = {}) {
  const source = event;
  const isRepeatInstance = Boolean(source?.repeat && instance);
  const startDate = parseDT(instance?.start || source?.start || initial?.start || new Date());
  const endDate = parseDT(instance?.end || source?.end || initial?.end || new Date(startDate.getTime() + 3600_000));
  const allDay = Boolean(instance?.allDay ?? source?.allDay ?? initial?.allDay ?? false);

  const titleInput = h('input', {
    type: 'text',
    value: source?.title || '',
    placeholder: t('event.titlePlaceholder'),
    maxlength: 500,
  });
  const startDateInput = h('input', { type: 'date', value: dateKey(startDate) });
  const startTimeInput = h('input', { type: 'time', value: hhmm(startDate) });
  const endDateInput = h('input', { type: 'date', value: dateKey(endDate) });
  const endTimeInput = h('input', { type: 'time', value: hhmm(endDate) });
  const allDayInput = h('input', {
    type: 'checkbox',
    checked: allDay,
    onchange: () => updateAllDayVisibility(),
  });

  const categorySelect = h('select');
  const renderCategories = () => {
    categorySelect.replaceChildren(
      h('option', { value: '' }, t('event.noCategory')),
      ...store.data.categories.map((c) =>
        h('option', { value: c.id }, c.builtinNameKey ? t(c.builtinNameKey) : c.name),
      ),
    );
    categorySelect.value = source?.categoryId || '';
  };
  renderCategories();

  const noteInput = h('textarea', { placeholder: t('event.notePlaceholder'), rows: 3 });
  noteInput.value = source?.note || '';
  const doneInput = h('input', { type: 'checkbox', checked: Boolean(source?.done) });

  const reminderValues = ['', '5', '10', '15', '30', '60'];
  const currentReminder = source?.reminderMinutes == null ? '' : String(source.reminderMinutes);
  const reminderOptions = [{ value: '', label: t('event.remindDefault') }];
  for (const v of reminderValues.slice(1)) {
    reminderOptions.push({ value: v, label: t('event.remindMinutes', { n: v }) });
  }
  if (currentReminder && !reminderValues.includes(currentReminder)) {
    reminderOptions.push({ value: currentReminder, label: t('event.remindMinutes', { n: currentReminder }) });
  }
  const reminderSelect = select(reminderOptions, currentReminder, () => {});

  // 重复规则
  const repeatType = source?.repeat?.type || 'off';
  const weekdaySet = new Set(source?.repeat?.weekdays || []);
  if (repeatType === 'weekly' && !weekdaySet.size) weekdaySet.add(((startDate.getDay() + 6) % 7) + 1);

  const repeatSelect = h('select', {
    onchange: () => refreshRepeatUi(),
  }, [
    h('option', { value: 'off' }, t('repeat.off')),
    h('option', { value: 'weekly' }, t('repeat.weekly')),
    h('option', { value: 'workdays' }, t('repeat.workdays')),
  ]);
  repeatSelect.value = repeatType;

  const monday = startOfWeek(new Date(), 1);
  const weekdayButtons = [];
  const weekdayWrap = h('div', { class: 'weekday-picker' });
  for (let i = 0; i < 7; i++) {
    const num = i + 1;
    const label = new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(addDays(monday, i));
    const b = h('button', {
      type: 'button',
      class: weekdaySet.has(num) ? 'active' : '',
      title: formatWeekday(addDays(monday, i), true),
      onclick: () => {
        if (weekdaySet.has(num)) weekdaySet.delete(num);
        else weekdaySet.add(num);
        b.classList.toggle('active', weekdaySet.has(num));
      },
    }, label);
    weekdayButtons.push(b);
    weekdayWrap.append(b);
  }
  const untilInput = h('input', { type: 'date', value: source?.repeat?.until?.slice(0, 10) || '' });
  const untilRow = h('div', { class: 'field' }, [
    h('label', {}, t('repeat.until')),
    untilInput,
    h('div', { class: 'help' }, t('repeat.untilHint')),
  ]);
  const weekdayRow = h('div', { class: 'field' }, [
    h('label', {}, t('repeat.weekdaysHint')),
    weekdayWrap,
  ]);

  function refreshRepeatUi() {
    const type = repeatSelect.value;
    weekdayRow.hidden = type !== 'weekly';
    untilRow.hidden = type === 'off';
  }
  refreshRepeatUi();

  const timeRowStart = h('div', { class: 'field-row' }, [startDateInput, startTimeInput]);
  const timeRowEnd = h('div', { class: 'field-row' }, [endDateInput, endTimeInput]);

  function updateAllDayVisibility() {
    const on = allDayInput.checked;
    startTimeInput.parentElement.style.display = on ? 'none' : '';
    endTimeInput.parentElement.style.display = on ? 'none' : '';
    timeRowStart.style.gridTemplateColumns = on ? '1fr' : '1fr 1fr';
    timeRowEnd.style.gridTemplateColumns = on ? '1fr' : '1fr 1fr';
  }
  updateAllDayVisibility();

  const errorEl = h('p', { class: 'error-text' });

  const body = [
    isRepeatInstance ? h('p', { class: 'help', style: { marginTop: 0 } }, t('event.seriesHint')) : null,
    h('div', { class: 'field' }, [h('label', {}, t('event.title')), titleInput]),
    h('div', { class: 'field' }, [
      h('label', {}, t('event.start')),
      timeRowStart,
      h('label', {}, t('event.end')),
      timeRowEnd,
      h('label', { class: 'check-row' }, [allDayInput, h('span', {}, t('event.allDay'))]),
      allDay ? h('div', { class: 'help' }, t('event.allDayHint')) : null,
    ]),
    h('div', { class: 'field' }, [
      h('label', {}, t('event.category')),
      h('div', { style: { display: 'flex', gap: '8px' } }, [
        categorySelect,
        btn({
          label: t('event.categoryManage'),
          variant: 'ghost',
          size: 'small',
          onClick: () => openCategoryManager({ onChange: renderCategories }),
        }),
      ]),
    ]),
    h('div', { class: 'field' }, [h('label', {}, t('event.note')), noteInput]),
    h('div', { class: 'field-row' }, [
      h('div', { class: 'field' }, [
        h('label', {}, t('event.remind')),
        reminderSelect,
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, t('event.done')),
        h('label', { class: 'check-row' }, [doneInput, h('span', {}, t('event.done'))]),
      ]),
    ]),
    h('div', { class: 'repeat-box' }, [
      h('div', { class: 'field' }, [h('label', {}, t('repeat.label')), repeatSelect]),
      weekdayRow,
      untilRow,
    ]),
    errorEl,
  ];

  const footer = [];
  if (source) {
    footer.push(
      h('div', { class: 'left', style: { display: 'flex', gap: '6px' } }, [
        btn({ icon: 'trash', label: t('event.delete'), variant: 'danger', size: 'small', onClick: () => handleDelete() }),
        btn({ icon: 'copy', label: t('event.duplicate'), variant: 'ghost', size: 'small', onClick: () => handleDuplicate() }),
      ]),
    );
  }
  footer.push(
    btn({ label: t('common.cancel'), variant: 'ghost', onClick: () => entry.close() }),
    btn({ label: t('event.save'), variant: 'primary', onClick: () => handleSave() }),
  );

  const entry = openModal({
    title: source ? t('event.editTitle') : t('event.emptyTitle'),
    body,
    footer,
    size: 'wide',
    initialFocus: titleInput,
  });

  function readValues() {
    errorEl.textContent = '';
    const title = titleInput.value.trim();
    if (!title) {
      errorEl.textContent = t('event.titleRequired');
      titleInput.focus();
      return null;
    }
    if (!startDateInput.value || !endDateInput.value) {
      errorEl.textContent = t('event.timeInvalid');
      return null;
    }
    const on = allDayInput.checked;
    let startStr;
    let endStr;
    let start;
    let end;
    if (on) {
      start = new Date(`${startDateInput.value}T00:00:00`);
      end = new Date(`${endDateInput.value}T00:00:00`);
      if (end < start) {
        errorEl.textContent = t('event.timeInvalid');
        return null;
      }
      startStr = toDateTimeString(start);
      endStr = toDateTimeString(end);
    } else {
      start = new Date(`${startDateInput.value}T${startTimeInput.value || '00:00'}:00`);
      end = new Date(`${endDateInput.value}T${endTimeInput.value || '00:00'}:00`);
      if (!(end > start)) {
        errorEl.textContent = t('event.timeInvalid');
        return null;
      }
      startStr = toDateTimeString(start);
      endStr = toDateTimeString(end);
    }

    let repeat = null;
    const type = repeatSelect.value;
    if (type !== 'off') {
      const weekdays = type === 'weekly' ? Array.from(weekdaySet).sort() : [];
      if (type === 'weekly' && !weekdays.length) {
        errorEl.textContent = t('repeat.pickWeekday');
        return null;
      }
      repeat = { type, weekdays, until: untilInput.value || null };
    }

    return {
      title,
      start: startStr,
      end: endStr,
      allDay: on,
      categoryId: categorySelect.value || null,
      note: noteInput.value,
      done: doneInput.checked,
      repeat,
      reminderMinutes: reminderSelect.value === '' ? null : Number(reminderSelect.value),
    };
  }

  function updateEvents(mutator) {
    store.update(mutator, { reason: 'events' });
  }

  async function handleSave() {
    const values = readValues();
    if (!values) return;

    if (!source) {
      const ev = createEvent(values);
      updateEvents((data) => data.events.push(ev));
      toast(t('event.created'), { type: 'success', icon: 'calendar' });
      entry.close();
      return;
    }

    if (!source.repeat) {
      updateEvents(() => {
        Object.assign(source, values, { updatedAt: new Date().toISOString() });
      });
      toast(t('event.updated'));
      entry.close();
      return;
    }

    const scope = await askScope('edit');
    if (!scope) return;

    if (scope === 'all') {
      updateEvents(() => {
        applyToSource(source, values);
        source.updatedAt = new Date().toISOString();
      });
    } else {
      updateEvents(() => {
        const base = baseOccurrence(source, instance.instanceDate);
        const diff = {};
        for (const key of ['title', 'note', 'categoryId', 'done', 'allDay', 'start', 'end']) {
          if (values[key] !== base[key]) diff[key] = values[key];
        }
        const idx = source.overrides.findIndex((o) => o.date === instance.instanceDate);
        if (!Object.keys(diff).length) {
          if (idx >= 0) source.overrides.splice(idx, 1);
        } else if (idx >= 0) {
          source.overrides[idx] = { date: instance.instanceDate, ...diff };
        } else {
          source.overrides.push({ date: instance.instanceDate, ...diff });
        }
        source.updatedAt = new Date().toISOString();
      });
    }
    toast(t('event.updated'));
    entry.close();
  }

  function applyToSource(target, values) {
    target.title = values.title;
    target.note = values.note;
    target.categoryId = values.categoryId;
    target.done = values.done;
    target.reminderMinutes = values.reminderMinutes;
    if (values.repeat) {
      target.repeat = {
        type: values.repeat.type,
        weekdays: values.repeat.weekdays,
        until: values.repeat.until,
      };
    } else {
      target.repeat = null;
    }
    const sourceDate = dateKey(parseDT(target.start));
    if (values.allDay) {
      target.allDay = true;
      const start = new Date(`${sourceDate}T00:00:00`);
      const span = Math.max(0, dayDiff(new Date(`${values.end.slice(0, 10)}T00:00:00`), new Date(`${values.start.slice(0, 10)}T00:00:00`)));
      target.start = toDateTimeString(start);
      target.end = toDateTimeString(addDays(start, span));
    } else {
      target.allDay = false;
      const startTime = values.start.slice(11, 16);
      const duration = Math.max(60_000, parseDT(values.end) - parseDT(values.start));
      const start = new Date(`${sourceDate}T${startTime}:00`);
      target.start = toDateTimeString(start);
      target.end = toDateTimeString(new Date(start.getTime() + duration));
    }
  }

  async function handleDelete() {
    if (!source) {
      entry.close();
      return;
    }
    if (source.repeat) {
      const scope = await askScope('delete');
      if (!scope) return;
      updateEvents((data) => {
        if (scope === 'all') {
          data.events = data.events.filter((e) => e.id !== source.id);
        } else {
          const idx = source.overrides.findIndex((o) => o.date === instance.instanceDate);
          const record = { date: instance.instanceDate, deleted: true };
          if (idx >= 0) source.overrides[idx] = record;
          else source.overrides.push(record);
        }
      });
    } else {
      const ok = await confirmDialog({
        title: t('event.deleteTitle'),
        message: t('event.deleteConfirm', { title: source.title }),
        confirmText: t('common.delete'),
        danger: true,
      });
      if (!ok) return;
      updateEvents((data) => {
        data.events = data.events.filter((e) => e.id !== source.id);
      });
    }
    toast(t('event.deleted'));
    entry.close();
  }

  function handleDuplicate() {
    const values = readValues();
    if (!values) return;
    const copy = createEvent({ ...values, title: values.title, repeat: null });
    updateEvents((data) => data.events.push(copy));
    toast(t('toast.eventCopied'), { type: 'success', icon: 'copy' });
    entry.close();
  }

  return entry;
}
