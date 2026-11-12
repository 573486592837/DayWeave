import {
  addDays,
  dateKey,
  dayDiff,
  parseDT,
  startOfDay,
  toDateTimeString,
} from '../i18n/format.js';

// 1=周一 … 7=周日
export function weekdayNumber(date) {
  return ((date.getDay() + 6) % 7) + 1;
}

export function repeatMatches(repeat, date) {
  if (!repeat) return false;
  if (repeat.until && dateKey(date) > repeat.until.slice(0, 10)) return false;
  const wd = weekdayNumber(date);
  if (repeat.type === 'workdays') return wd >= 1 && wd <= 5;
  if (repeat.type === 'weekly') return Array.isArray(repeat.weekdays) && repeat.weekdays.includes(wd);
  return false;
}

export function findOverride(event, dayKey) {
  return (event.overrides || []).find((o) => o.date === dayKey) || null;
}

function applyOverride(instance, override) {
  if (!override) return instance;
  const patch = {};
  for (const key of ['title', 'start', 'end', 'note', 'categoryId', 'done', 'allDay']) {
    if (Object.prototype.hasOwnProperty.call(override, key)) patch[key] = override[key];
  }
  return { ...instance, ...patch };
}

function overlaps(start, end, allDay, rangeStart, rangeEnd) {
  if (allDay) {
    const startDay = startOfDay(start);
    const endDay = startOfDay(end);
    return startDay <= startOfDay(rangeEnd) && endDay >= startOfDay(rangeStart);
  }
  return start < rangeEnd && end > rangeStart;
}

function makeSingle(event) {
  const start = parseDT(event.start);
  const end = parseDT(event.end);
  if (!start || !end) return null;
  return {
    ...event,
    id: event.id,
    sourceId: null,
    instanceDate: dateKey(start),
    isRepeat: false,
    occurrenceStart: start,
    occurrenceEnd: end,
  };
}

function makeOccurrence(event, day, override) {
  const srcStart = parseDT(event.start);
  const srcEnd = parseDT(event.end);
  if (!srcStart || !srcEnd) return null;
  let occStart;
  let occEnd;
  if (event.allDay) {
    const span = Math.max(0, dayDiff(srcEnd, srcStart));
    occStart = startOfDay(day);
    occEnd = addDays(occStart, span);
  } else {
    occStart = startOfDay(day);
    occStart.setHours(srcStart.getHours(), srcStart.getMinutes(), 0, 0);
    occEnd = new Date(occStart.getTime() + (srcEnd - srcStart));
  }
  const dayKey = dateKey(occStart);
  let instance = {
    ...event,
    id: `${event.id}__${dayKey}`,
    sourceId: event.id,
    instanceDate: dayKey,
    isRepeat: true,
    start: toDateTimeString(occStart),
    end: toDateTimeString(occEnd),
    occurrenceStart: occStart,
    occurrenceEnd: occEnd,
  };
  instance = applyOverride(instance, override);
  // 覆盖可能改了起止时间，重新解析用于渲染与提醒
  instance.occurrenceStart = parseDT(instance.start) || occStart;
  instance.occurrenceEnd = parseDT(instance.end) || occEnd;
  return instance;
}

/**
 * 将日程（含重复规则）展开为指定日期范围内的实例。
 * rangeStart / rangeEnd 为日期对象，包含两端。
 */
export function expandEvents(events, rangeStart, rangeEnd) {
  const from = startOfDay(rangeStart);
  const to = new Date(rangeEnd);
  to.setHours(23, 59, 59, 999);
  const out = [];

  for (const event of events || []) {
    const srcStart = parseDT(event.start);
    const srcEnd = parseDT(event.end);
    if (!srcStart || !srcEnd) continue;

    if (!event.repeat) {
      if (overlaps(srcStart, srcEnd, event.allDay, from, to)) {
        const inst = makeSingle(event);
        if (inst) out.push(inst);
      }
      continue;
    }

    const until = event.repeat.until ? parseDT(`${event.repeat.until.slice(0, 10)}T23:59:59`) : null;
    let cursor = startOfDay(
      srcStart > from ? srcStart : from,
    );
    const last = new Date(to);
    if (until && until < last) last.setTime(until.getTime());
    while (cursor <= last) {
      if (repeatMatches(event.repeat, cursor)) {
        const dayKey = dateKey(cursor);
        const override = findOverride(event, dayKey);
        if (!override?.deleted) {
          const inst = makeOccurrence(event, cursor, override);
          if (inst && overlaps(inst.occurrenceStart, inst.occurrenceEnd, inst.allDay, from, to)) {
            out.push(inst);
          }
        }
      }
      cursor = addDays(cursor, 1);
    }
  }

  out.sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.occurrenceStart - b.occurrenceStart;
  });
  return out;
}

export function instanceKey(instance) {
  return `${instance.sourceId || instance.id}@${instance.instanceDate || dateKey(instance.occurrenceStart)}`;
}

export function instanceDuration(instance) {
  if (instance.allDay) {
    return (dayDiff(instance.occurrenceEnd, instance.occurrenceStart) + 1) * 24 * 60;
  }
  return Math.max(0, Math.round((instance.occurrenceEnd - instance.occurrenceStart) / 60_000));
}

// 计算某条重复日程在指定日期上是否存在（用于“仅此一次”覆盖）
export function occursOn(event, date) {
  if (!event.repeat) return dateKey(parseDT(event.start)) === dateKey(date);
  const srcStart = startOfDay(parseDT(event.start));
  if (startOfDay(date) < srcStart) return false;
  return repeatMatches(event.repeat, date);
}
