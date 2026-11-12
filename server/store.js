import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, DB_FILE, BAK_FILE, UPLOAD_DIR } from './config.js';
import { log } from './logger.js';

const THEME_IDS = ['midnight', 'obsidian', 'forest', 'paper', 'mist', 'sand'];
const WIDGET_TYPES = ['clock', 'calendar', 'eventList', 'todo', 'note', 'countdown', 'progress', 'image'];
const VIEWS = ['day', 'week', 'month'];

const nowIso = () => new Date().toISOString();
const clone = (v) => structuredClone(v);

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function defaultWidgetStyle() {
  return { bg: '', blur: 0, radius: 16, padding: 16, color: '', fontSize: 'md' };
}

function defaultBackground() {
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

function defaultSettings() {
  return {
    locale: 'auto',
    firstDayOfWeek: 1,
    timeFormat: '24h',
    dayStartHour: 7,
    dayEndHour: 23,
    defaultView: 'day',
    fontScale: 'md',
    theme: 'midnight',
    reminder: { enabled: true, minutesBefore: 10, sound: true },
    displayModeDefault: false,
    performanceMode: false,
  };
}

function taskWidgets() {
  return [
    {
      id: 'w_clock',
      type: 'clock',
      x: 0, y: 0, w: 3, h: 3, z: 1,
      locked: false,
      style: defaultWidgetStyle(),
      config: { mode: 'digital', showSeconds: false, showDate: true },
    },
    {
      id: 'w_todo',
      type: 'todo',
      x: 0, y: 3, w: 3, h: 3, z: 2,
      locked: false,
      style: defaultWidgetStyle(),
      config: { showDone: true },
    },
    {
      id: 'w_calendar',
      type: 'calendar',
      x: 3, y: 0, w: 9, h: 7, z: 3,
      locked: false,
      style: defaultWidgetStyle(),
      config: { view: 'day' },
    },
    {
      id: 'w_progress',
      type: 'progress',
      x: 0, y: 7, w: 6, h: 2, z: 4,
      locked: false,
      style: defaultWidgetStyle(),
      config: { mode: 'year' },
    },
    {
      id: 'w_note',
      type: 'note',
      x: 6, y: 7, w: 6, h: 2, z: 5,
      locked: false,
      style: defaultWidgetStyle(),
      config: { noteId: 'n_1' },
    },
  ];
}

function weekendWidgets() {
  return [
    {
      id: 'w_clock_w',
      type: 'clock',
      x: 0, y: 0, w: 4, h: 4, z: 1,
      locked: false,
      style: defaultWidgetStyle(),
      config: { mode: 'digital', showSeconds: true, showDate: true },
    },
    {
      id: 'w_calendar_w',
      type: 'calendar',
      x: 4, y: 0, w: 8, h: 7, z: 2,
      locked: false,
      style: defaultWidgetStyle(),
      config: { view: 'week' },
    },
    {
      id: 'w_list_w',
      type: 'eventList',
      x: 0, y: 4, w: 4, h: 4, z: 3,
      locked: false,
      style: defaultWidgetStyle(),
      config: { range: '7d', showDone: false },
    },
  ];
}

export function createDefaultData() {
  return {
    version: 1,
    settings: defaultSettings(),
    profiles: [
      {
        id: 'p_workday',
        name: '工作日',
        builtinNameKey: 'preset.profile.workday',
        cols: 12,
        rowHeight: 40,
        background: defaultBackground(),
        widgets: taskWidgets(),
      },
      {
        id: 'p_weekend',
        name: '周末',
        builtinNameKey: 'preset.profile.weekend',
        cols: 12,
        rowHeight: 40,
        background: defaultBackground(),
        widgets: weekendWidgets(),
      },
    ],
    activeProfileId: 'p_workday',
    categories: [
      { id: 'c_work', name: '工作', builtinNameKey: 'preset.category.work', color: '#38bdf8' },
      { id: 'c_life', name: '生活', builtinNameKey: 'preset.category.life', color: '#4ade80' },
      { id: 'c_rest', name: '休息', builtinNameKey: 'preset.category.rest', color: '#f472b6' },
    ],
    events: [],
    todos: [],
    notes: [{ id: 'n_1', content: '' }],
    countdowns: [],
    assets: [],
  };
}

function normalizeBackground(bg) {
  const base = defaultBackground();
  const raw = bg && typeof bg === 'object' ? bg : {};
  const out = {
    ...base,
    type: ['color', 'gradient', 'image', 'slideshow'].includes(raw.type) ? raw.type : 'color',
    color: typeof raw.color === 'string' ? raw.color : base.color,
    gradient: { ...base.gradient, ...(raw.gradient || {}) },
    image: {
      assetId: raw.image?.assetId || null,
      fit: ['cover', 'contain', 'repeat', 'center'].includes(raw.image?.fit) ? raw.image.fit : 'cover',
    },
    slideshow: {
      assetIds: Array.isArray(raw.slideshow?.assetIds) ? raw.slideshow.assetIds.filter((x) => typeof x === 'string') : [],
      intervalSec: clampInt(raw.slideshow?.intervalSec, 15, 3600, 60),
      order: raw.slideshow?.order === 'random' ? 'random' : 'sequential',
      transition: raw.slideshow?.transition === 'none' ? 'none' : 'fade',
    },
    overlay: {
      color: typeof raw.overlay?.color === 'string' ? raw.overlay.color : base.overlay.color,
      opacity: Math.min(1, Math.max(0, Number(raw.overlay?.opacity ?? base.overlay.opacity))),
    },
    blur: clampInt(raw.blur, 0, 20, 0),
  };
  return out;
}

function normalizeWidget(w, index) {
  const type = WIDGET_TYPES.includes(w?.type) ? w.type : 'clock';
  const w2 = clampInt(w?.w, 2, 12, 3);
  const h2 = clampInt(w?.h, 2, 24, 3);
  return {
    id: typeof w?.id === 'string' && w.id ? w.id : `w_${index}_${crypto.randomBytes(3).toString('hex')}`,
    type,
    x: clampInt(w?.x, 0, 11, 0),
    y: clampInt(w?.y, 0, 96, 0),
    w: w2,
    h: h2,
    z: clampInt(w?.z, 0, 999, index + 1),
    locked: Boolean(w?.locked),
    style: { ...defaultWidgetStyle(), ...(w?.style || {}) },
    config: w?.config && typeof w.config === 'object' ? clone(w.config) : {},
  };
}

function normalizeProfile(p, index) {
  const widgets = Array.isArray(p?.widgets) ? p.widgets.map(normalizeWidget) : [];
  return {
    id: typeof p?.id === 'string' && p.id ? p.id : `p_${index}_${crypto.randomBytes(3).toString('hex')}`,
    name: typeof p?.name === 'string' ? p.name : 'Layout',
    builtinNameKey: typeof p?.builtinNameKey === 'string' ? p.builtinNameKey : null,
    cols: 12,
    rowHeight: 40,
    background: normalizeBackground(p?.background),
    widgets,
  };
}

function normalizeSettings(raw) {
  const base = defaultSettings();
  const s = raw && typeof raw === 'object' ? raw : {};
  const out = { ...base, ...s };
  out.locale = ['auto', 'zh-CN', 'en-US'].includes(s.locale) ? s.locale : 'auto';
  out.firstDayOfWeek = [0, 1].includes(Number(s.firstDayOfWeek)) ? Number(s.firstDayOfWeek) : 1;
  out.timeFormat = s.timeFormat === '12h' ? '12h' : '24h';
  out.dayStartHour = clampInt(s.dayStartHour, 0, 22, 7);
  out.dayEndHour = clampInt(s.dayEndHour, out.dayStartHour + 1, 24, 23);
  out.defaultView = VIEWS.includes(s.defaultView) ? s.defaultView : 'day';
  out.fontScale = ['sm', 'md', 'lg'].includes(s.fontScale) ? s.fontScale : 'md';
  out.theme = THEME_IDS.includes(s.theme) ? s.theme : 'midnight';
  out.reminder = {
    enabled: s.reminder?.enabled !== false,
    minutesBefore: clampInt(s.reminder?.minutesBefore, 0, 180, 10),
    sound: s.reminder?.sound !== false,
  };
  out.displayModeDefault = Boolean(s.displayModeDefault);
  out.performanceMode = Boolean(s.performanceMode);
  return out;
}

function normalizeEvent(e, index) {
  if (!e || typeof e !== 'object') return null;
  if (typeof e.title !== 'string' || typeof e.start !== 'string' || typeof e.end !== 'string') return null;
  const repeat = e.repeat && ['weekly', 'workdays'].includes(e.repeat.type)
    ? {
        type: e.repeat.type,
        weekdays: Array.isArray(e.repeat.weekdays)
          ? e.repeat.weekdays.map(Number).filter((d) => d >= 1 && d <= 7)
          : [],
        until: typeof e.repeat.until === 'string' && e.repeat.until ? e.repeat.until : null,
      }
    : null;
  return {
    id: typeof e.id === 'string' && e.id ? e.id : `e_${index}_${crypto.randomBytes(3).toString('hex')}`,
    title: e.title.slice(0, 500),
    start: e.start,
    end: e.end,
    allDay: Boolean(e.allDay),
    categoryId: typeof e.categoryId === 'string' ? e.categoryId : null,
    note: typeof e.note === 'string' ? e.note.slice(0, 20000) : '',
    done: Boolean(e.done),
    repeat,
    overrides: Array.isArray(e.overrides)
      ? e.overrides.filter((o) => o && typeof o.date === 'string').map((o) => ({ ...o }))
      : [],
    reminderMinutes: e.reminderMinutes == null ? null : clampInt(e.reminderMinutes, 0, 180, 10),
    createdAt: typeof e.createdAt === 'string' ? e.createdAt : nowIso(),
    updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : nowIso(),
  };
}

function normalizeData(raw, rev) {
  const def = createDefaultData();
  const d = raw && typeof raw === 'object' ? raw : {};
  const categories = (Array.isArray(d.categories) ? d.categories : def.categories)
    .filter((c) => c && typeof c === 'object')
    .map((c, i) => ({
      id: typeof c.id === 'string' && c.id ? c.id : `c_${i}_${crypto.randomBytes(3).toString('hex')}`,
      name: typeof c.name === 'string' ? c.name.slice(0, 100) : 'Category',
      builtinNameKey: typeof c.builtinNameKey === 'string' ? c.builtinNameKey : null,
      color: typeof c.color === 'string' ? c.color : '#38bdf8',
    }));

  const profiles = (Array.isArray(d.profiles) ? d.profiles : def.profiles)
    .filter((p) => p && typeof p === 'object')
    .map(normalizeProfile);
  if (!profiles.length) profiles.push(...def.profiles);

  const activeProfileId = profiles.some((p) => p.id === d.activeProfileId)
    ? d.activeProfileId
    : profiles[0].id;

  return {
    version: 1,
    rev: Number.isInteger(rev) ? rev : 0,
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : nowIso(),
    settings: normalizeSettings(d.settings),
    profiles,
    activeProfileId,
    categories,
    events: (Array.isArray(d.events) ? d.events : []).map(normalizeEvent).filter(Boolean),
    todos: (Array.isArray(d.todos) ? d.todos : [])
      .filter((t) => t && typeof t === 'object')
      .map((t, i) => ({
        id: typeof t.id === 'string' && t.id ? t.id : `t_${i}_${crypto.randomBytes(3).toString('hex')}`,
        text: typeof t.text === 'string' ? t.text.slice(0, 500) : '',
        done: Boolean(t.done),
        order: Number.isFinite(Number(t.order)) ? Number(t.order) : i,
      })),
    notes: (Array.isArray(d.notes) && d.notes.length ? d.notes : def.notes)
      .filter((n) => n && typeof n === 'object')
      .map((n, i) => ({
        id: typeof n.id === 'string' && n.id ? n.id : `n_${i}_${crypto.randomBytes(3).toString('hex')}`,
        content: typeof n.content === 'string' ? n.content.slice(0, 200000) : '',
      })),
    countdowns: (Array.isArray(d.countdowns) ? d.countdowns : [])
      .filter((c) => c && typeof c === 'object')
      .map((c, i) => ({
        id: typeof c.id === 'string' && c.id ? c.id : `cd_${i}_${crypto.randomBytes(3).toString('hex')}`,
        title: typeof c.title === 'string' ? c.title.slice(0, 100) : '',
        targetDate: typeof c.targetDate === 'string' ? c.targetDate : '',
      })),
    assets: (Array.isArray(d.assets) ? d.assets : [])
      .filter((a) => a && typeof a.filename === 'string' && /^[a-f0-9]{16}\.(jpg|png|webp|gif)$/.test(a.filename))
      .map((a, i) => ({
        id: typeof a.id === 'string' && a.id ? a.id : `a_${i}_${crypto.randomBytes(3).toString('hex')}`,
        filename: a.filename,
        mime: typeof a.mime === 'string' ? a.mime : 'image/jpeg',
        size: Number(a.size) || 0,
        createdAt: typeof a.createdAt === 'string' ? a.createdAt : nowIso(),
      })),
  };
}

let current = null;
let writeQueue = Promise.resolve();

function enqueue(task) {
  const run = writeQueue.then(task);
  writeQueue = run.catch(() => {});
  return run;
}

async function writeAtomic(db) {
  const tmp = path.join(DATA_DIR, `.db.json.${process.pid}.${Date.now()}.tmp`);
  const text = JSON.stringify(db, null, 2);
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, DB_FILE);
}

export function statePayload(db = current) {
  if (!db) return null;
  const { rev, updatedAt, ...data } = db;
  data.updatedAt = updatedAt;
  return data;
}

export function getState() {
  return { rev: current.rev, data: statePayload(current) };
}

export async function initStore() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    // 启动时先备份上一份数据，再加载
    await fsp.copyFile(DB_FILE, BAK_FILE);
    const raw = await fsp.readFile(DB_FILE, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      log.error('db.json 解析失败，请用 db.json.bak 手工恢复', err);
      throw new Error('db.json 已损坏，服务拒绝启动（避免覆盖真实数据）');
    }
    current = normalizeData({ ...parsed, updatedAt: parsed.updatedAt }, parsed.rev ?? 0);
    log.info(`已加载数据：rev=${current.rev}，events=${current.events.length}`);
  } else {
    current = normalizeData({ ...createDefaultData(), updatedAt: nowIso() }, 0);
    await writeAtomic(current);
    // 首次启动也生成一份 bak，满足验收要求
    await fsp.copyFile(DB_FILE, BAK_FILE);
    log.info('已初始化空数据 data/db.json');
  }
  return current;
}

export async function replaceState(data, expectedRev) {
  if (!Number.isInteger(expectedRev) || expectedRev !== current.rev) {
    return { conflict: true, ...getState() };
  }
  const nextRev = current.rev + 1;
  const next = normalizeData({ ...data, updatedAt: nowIso() }, nextRev);
  await enqueue(() => writeAtomic(next));
  current = next;
  return { conflict: false, ...getState() };
}

export async function resetState() {
  const nextRev = current.rev + 1;
  const next = normalizeData({ ...createDefaultData(), updatedAt: nowIso() }, nextRev);
  await enqueue(() => writeAtomic(next));
  current = next;
  // 清空上传文件（仅本应用 uploads 目录）
  try {
    const files = await fsp.readdir(UPLOAD_DIR);
    await Promise.all(files.map((f) => fsp.rm(path.join(UPLOAD_DIR, f), { force: true })));
  } catch (err) {
    log.warn(`清理上传目录失败：${err.message}`);
  }
  return getState();
}

export async function addAsset(meta) {
  const nextRev = current.rev + 1;
  const next = { ...current, rev: nextRev, updatedAt: nowIso(), assets: [...current.assets, meta] };
  await enqueue(() => writeAtomic(next));
  current = next;
  return getState();
}

export async function removeAsset(id) {
  const nextRev = current.rev + 1;
  const next = {
    ...current,
    rev: nextRev,
    updatedAt: nowIso(),
    assets: current.assets.filter((a) => a.id !== id),
  };
  await enqueue(() => writeAtomic(next));
  current = next;
  return getState();
}
