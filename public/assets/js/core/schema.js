import { uid } from './dom.js';
import { addDays, startOfDay, toDateTimeString } from '../i18n/format.js';

export const WIDGET_TYPES = ['clock', 'calendar', 'eventList', 'todo', 'note', 'countdown', 'progress', 'image'];

export const WIDGET_DEFAULTS = {
  clock: { w: 3, h: 3, config: { mode: 'digital', showSeconds: false, showDate: true } },
  calendar: { w: 6, h: 6, config: { view: 'day' } },
  eventList: { w: 3, h: 4, config: { range: '3d', showDone: true } },
  todo: { w: 3, h: 3, config: { showDone: true } },
  note: { w: 4, h: 3, config: { noteId: null } },
  countdown: { w: 2, h: 2, config: { countdownId: null } },
  progress: { w: 6, h: 2, config: { mode: 'year' } },
  image: { w: 3, h: 3, config: { assetId: null, fit: 'cover' } },
};

export const THEMES = [
  { id: 'midnight', nameKey: 'theme.midnight', swatch: ['#0f172a', '#1e293b', '#38bdf8'] },
  { id: 'obsidian', nameKey: 'theme.obsidian', swatch: ['#0b0b0d', '#1c1c20', '#a78bfa'] },
  { id: 'forest', nameKey: 'theme.forest', swatch: ['#12211a', '#1c3026', '#4ade80'] },
  { id: 'paper', nameKey: 'theme.paper', swatch: ['#f7f7f5', '#ffffff', '#2563eb'] },
  { id: 'mist', nameKey: 'theme.mist', swatch: ['#eef1f4', '#ffffff', '#0ea5e9'] },
  { id: 'sand', nameKey: 'theme.sand', swatch: ['#f6f1e7', '#fffcf6', '#d97706'] },
];

export const THEME_BG = {
  midnight: '#0f172a',
  obsidian: '#0b0b0d',
  forest: '#12211a',
  paper: '#f7f7f5',
  mist: '#eef1f4',
  sand: '#f6f1e7',
};

export const CATEGORY_COLORS = [
  '#38bdf8', '#4ade80', '#f472b6', '#f59e0b', '#a78bfa', '#fb7185', '#2dd4bf', '#94a3b8',
];

export function defaultWidgetStyle() {
  return { bg: '', blur: 0, radius: 16, padding: 16, color: '', fontSize: 'md' };
}

export function createWidget(type, x = 0, y = 0, overrides = {}) {
  const def = WIDGET_DEFAULTS[type] || WIDGET_DEFAULTS.clock;
  return {
    id: uid('w'),
    type,
    x,
    y,
    w: def.w,
    h: def.h,
    z: 1,
    locked: false,
    style: defaultWidgetStyle(),
    config: structuredClone(def.config),
    ...overrides,
  };
}

export function createDefaultWidgets(view = 'day') {
  return [
    createWidget('clock', 0, 0, { id: 'w_clock', z: 1 }),
    createWidget('todo', 0, 3, { id: 'w_todo', z: 2 }),
    createWidget('calendar', 3, 0, {
      id: 'w_calendar',
      w: 9,
      h: 7,
      z: 3,
      config: { view },
    }),
    createWidget('progress', 0, 7, { id: 'w_progress', w: 6, h: 2, z: 4 }),
    createWidget('note', 6, 7, { id: 'w_note', w: 6, h: 2, z: 5 }),
  ];
}

export function createProfile(name, { view = 'day', withDefaults = true } = {}) {
  return {
    id: uid('p'),
    name,
    builtinNameKey: null,
    cols: 12,
    rowHeight: 40,
    background: defaultBackground(),
    widgets: withDefaults ? createDefaultWidgets(view) : [],
  };
}

export function defaultBackground() {
  return {
    type: 'color',
    color: '#0f172a',
    gradient: { from: '#1e293b', to: '#0f172a', angle: 135 },
    image: { assetId: null, fit: 'cover' },
    slideshow: { assetIds: [], intervalSec: 60, order: 'sequential', transition: 'fade' },
    overlay: { color: '#000000', opacity: 0 },
    blur: 0,
  };
}

export function createEvent(partial = {}) {
  const base = startOfDay(new Date());
  const start = partial.start ? new Date(partial.start) : new Date(base.getTime() + 60 * 60 * 1000);
  const end = partial.end ? new Date(partial.end) : new Date(start.getTime() + 60 * 60 * 1000);
  const now = new Date().toISOString();
  return {
    id: uid('e'),
    title: '',
    start: toDateTimeString(start),
    end: toDateTimeString(end),
    allDay: false,
    categoryId: null,
    note: '',
    done: false,
    repeat: null,
    overrides: [],
    reminderMinutes: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
    id: partial.id || uid('e'),
  };
}

export function createAllDayEvent(date, days = 1) {
  const start = startOfDay(date);
  const end = addDays(start, days);
  return createEvent({
    start: toDateTimeString(start),
    end: toDateTimeString(end),
    allDay: true,
  });
}

export function createCategory(name, color) {
  return {
    id: uid('c'),
    name,
    builtinNameKey: null,
    color: color || CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)],
  };
}

export function createTodo(text) {
  return { id: uid('t'), text, done: false, order: Date.now() };
}

export function createNote() {
  return { id: uid('n'), content: '' };
}

export function createCountdown() {
  return { id: uid('cd'), title: '', targetDate: '' };
}

export function findFreeSpot(widgets, w, h, cols = 12) {
  const occupied = widgets.map((x) => ({ x: x.x, y: x.y, w: x.w, h: x.h }));
  const collides = (x, y) =>
    occupied.some((o) => x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y);
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x <= cols - w; x++) {
      if (!collides(x, y)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
