import { getLocale } from '../i18n/i18n.js';

const pad = (n) => String(n).padStart(2, '0');

export function parseDT(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === 'string' && value) return new Date(value);
  return null;
}

export function dateKey(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toDateTimeString(d) {
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(d, n) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function addMinutes(d, n) {
  return new Date(d.getTime() + n * 60_000);
}

export function addMonths(d, n) {
  const copy = new Date(d);
  copy.setMonth(copy.getMonth() + n);
  return copy;
}

export function startOfWeek(d, firstDay = 1) {
  const copy = startOfDay(d);
  const diff = (copy.getDay() - firstDay + 7) % 7;
  return addDays(copy, -diff);
}

export function endOfWeek(d, firstDay = 1) {
  return addDays(startOfWeek(d, firstDay), 6);
}

export function startOfMonth(d) {
  const copy = startOfDay(d);
  copy.setDate(1);
  return copy;
}

export function endOfMonth(d) {
  const copy = startOfMonth(d);
  copy.setMonth(copy.getMonth() + 1);
  return addDays(copy, -1);
}

export function monthGrid(d, firstDay = 1) {
  const start = startOfWeek(startOfMonth(d), firstDay);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function sameDay(a, b) {
  return a && b && dateKey(a) === dateKey(b);
}

export function isToday(d) {
  return sameDay(d, new Date());
}

export function dayDiff(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / 86_400_000);
}

export function timeParts(d) {
  return { hour: d.getHours(), minute: d.getMinutes() };
}

export function formatDate(d, options) {
  return new Intl.DateTimeFormat(getLocale(), options || { year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}

export function formatDateShort(d) {
  return new Intl.DateTimeFormat(getLocale(), { month: 'short', day: 'numeric' }).format(d);
}

export function formatMonthYear(d) {
  return new Intl.DateTimeFormat(getLocale(), { year: 'numeric', month: 'long' }).format(d);
}

export function formatMonthShort(d) {
  return new Intl.DateTimeFormat(getLocale(), { month: 'short' }).format(d);
}

export function formatWeekday(d, long = false) {
  return new Intl.DateTimeFormat(getLocale(), { weekday: long ? 'long' : 'short' }).format(d);
}

export function formatTime(d, h12 = false) {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: Boolean(h12),
  }).format(d);
}

export function formatClock(hour, minute, h12 = false) {
  const d = new Date(2000, 0, 1, hour, minute, 0, 0);
  return formatTime(d, h12);
}

export function formatRange(start, end, h12 = false) {
  return `${formatTime(start, h12)} – ${formatTime(end, h12)}`;
}

export function formatRelative(date, base = new Date()) {
  const diffSec = Math.round((date.getTime() - base.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 2_592_000) return rtf.format(Math.round(diffSec / 86_400), 'day');
  if (abs < 31_536_000) return rtf.format(Math.round(diffSec / 2_592_000), 'month');
  return rtf.format(Math.round(diffSec / 31_536_000), 'year');
}

export function formatNumber(n, options) {
  return new Intl.NumberFormat(getLocale(), options).format(n);
}

function unit(value, name) {
  try {
    return new Intl.NumberFormat(getLocale(), { style: 'unit', unit: name, unitDisplay: 'short' }).format(value);
  } catch {
    return `${value} ${name}`;
  }
}

export function formatDuration(totalMinutes) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes < 60) return unit(minutes, 'minute');
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${unit(h, 'hour')} ${unit(m, 'minute')}` : unit(h, 'hour');
}

export function formatDays(n) {
  return unit(n, 'day');
}

export function formatPercent(n) {
  return `${Math.round(n)}%`;
}

export function weekdayNumbersBetween(rangeStart, rangeEnd) {
  const set = new Set();
  for (let d = new Date(rangeStart); d <= rangeEnd; d = addDays(d, 1)) {
    set.add(((d.getDay() + 6) % 7) + 1);
  }
  return set;
}

// 生成日期范围的显示文案：同一天显示一个日期，否则显示起止日期
export function formatRangeLabel(start, end) {
  if (dateKey(start) === dateKey(end)) return formatDate(start);
  const sameYear = start.getFullYear() === end.getFullYear();
  const left = new Intl.DateTimeFormat(getLocale(), {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(start);
  return `${left} – ${formatDate(end)}`;
}
