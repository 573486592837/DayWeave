import { store } from './core/store.js';
import { h, isMobileLayout, debounce } from './core/dom.js';
import { applyTheme } from './core/theme.js';
import { applyWidgetStyle } from './core/style.js';
import { initI18n, t, setLocalePref } from './i18n/i18n.js';
import { addDays, formatTime, startOfDay } from './i18n/format.js';
import { renderToolbar } from './ui/toolbar.js';
import { toast, reminderToast } from './ui/toast.js';
import { openEventEditor } from './events/event-editor.js';
import { expandEvents, instanceKey } from './events/repeat.js';
import { openModalCount } from './ui/modal.js';
import { iconSvg } from './ui/icons.js';
import { renderWidget } from './widgets/registry.js';
import { isLayoutEditing, openLayoutEditor } from './editor/layout-editor.js';

import './widgets/clock.js';
import './widgets/calendar.js';
import './widgets/event-list.js';
import './widgets/todo.js';
import './widgets/note.js';
import './widgets/countdown.js';
import './widgets/progress.js';
import './widgets/image.js';

let lastLocalePref = null;
let widgetCleanups = [];
let displayMode = false;
let offline = false;
let fired = new Set();
let audioCtx = null;
let sse = null;

function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 400);
}

function showFatal(message) {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const inner = splash.querySelector('.splash-inner');
  if (!inner) return;
  inner.replaceChildren(
    h('div', { class: 'brand' }, 'DayWeave'),
    h('p', { class: 'help', style: { textAlign: 'center', maxWidth: '320px' } }, message),
    h('button', {
      class: 'btn primary',
      type: 'button',
      text: t('app.retry'),
      onclick: () => location.reload(),
    }),
  );
}

function syncLocale() {
  const pref = store.settings().locale;
  if (pref !== lastLocalePref) {
    lastLocalePref = pref;
    setLocalePref(pref);
  }
}

function renderCanvas() {
  if (isLayoutEditing()) return;
  for (const fn of widgetCleanups) fn();
  widgetCleanups = [];
  const canvas = document.getElementById('canvas');
  const profile = store.activeProfile();
  if (!canvas || !profile) return;
  const settings = store.settings();
  canvas.replaceChildren();
  canvas.style.setProperty('--row-height', `${profile.rowHeight || 40}px`);
  canvas.style.setProperty('--grid-gap', '12px');
  canvas.classList.remove('loading');

  const widgets = [...profile.widgets].sort((a, b) => (a.z || 0) - (b.z || 0) || a.y - b.y);
  for (const widget of widgets) {
    const el = h('section', {
      class: 'widget',
      dataset: { widgetId: widget.id, type: widget.type },
      style: {
        gridColumn: `${widget.x + 1} / span ${widget.w}`,
        gridRow: `${widget.y + 1} / span ${widget.h}`,
        zIndex: String(widget.z || 1),
        '--w-min-h': `${Math.max(130, widget.h * (profile.rowHeight || 40))}px`,
      },
    });
    applyWidgetStyle(el, widget.style, settings.performanceMode);
    const body = h('div', { class: 'widget-body' });
    el.append(body);
    canvas.append(el);
    const cleanup = renderWidget(body, widget);
    if (typeof cleanup === 'function') widgetCleanups.push(cleanup);
  }
  if (!widgets.length) {
    canvas.append(
      h('div', { class: 'empty', style: { gridColumn: '1 / -1', paddingTop: '60px' } }, [
        h('span', { html: iconSvg('layout', 28) }),
        h('span', {}, t('editor.empty')),
      ]),
    );
  }
}

function renderAll() {
  if (isLayoutEditing()) return;
  syncLocale();
  applyTheme();
  const exitLabel = document.getElementById('display-exit-label');
  if (exitLabel) exitLabel.textContent = t('app.displayExit');
  renderToolbar({
    onDisplay: () => enterDisplayMode({ fullscreen: true }),
    onEditorExit: () => renderAll(),
    onViewChange: setAllCalendarViews,
  });
  renderCanvas();
}

function setAllCalendarViews(view) {
  store.update((data) => {
    const profile = data.profiles.find((p) => p.id === data.activeProfileId);
    if (!profile) return;
    for (const widget of profile.widgets) {
      if (widget.type === 'calendar') widget.config.view = view;
    }
  }, { reason: 'silent' });
  renderCanvas();
}

function isDisplaying() {
  return displayMode;
}

function enterDisplayMode({ fullscreen = true } = {}) {
  if (displayMode) return;
  displayMode = true;
  document.body.classList.add('display-mode');
  renderCanvas();
  if (fullscreen) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }
}

function exitDisplayMode() {
  if (!displayMode) return;
  displayMode = false;
  document.body.classList.remove('display-mode');
  renderCanvas();
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

function connectSSE() {
  try {
    sse = new EventSource('/api/stream');
  } catch {
    return;
  }
  sse.addEventListener('state', (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.rev === store.rev) return;
      if (isLayoutEditing()) return;
      if (store.dirty || store.saving) return;
      store.refresh();
    } catch {
      /* 忽略非法事件 */
    }
  });
  sse.onerror = () => {
    if (offline) return;
    offline = true;
    toast(t('toast.offline'), { type: 'error', duration: 4000 });
  };
  sse.onopen = () => {
    if (!offline) return;
    offline = false;
    toast(t('toast.online'), { type: 'success' });
  };
}

function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx ||= new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    /* 忽略音频初始化失败 */
  }
}

function beep() {
  if (!audioCtx) return;
  try {
    const now = audioCtx.currentTime;
    for (const [freq, delay] of [[880, 0], [1174.66, 0.18]]) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.16, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.2);
    }
  } catch {
    /* 忽略播放失败 */
  }
}

function checkReminders() {
  if (!store.ready || !store.data) return;
  const settings = store.settings();
  if (!settings.reminder.enabled) return;
  const now = new Date();
  const today = startOfDay(now);
  const instances = expandEvents(store.data.events, today, addDays(today, 1));
  for (const inst of instances) {
    if (inst.allDay || inst.done) continue;
    const minutes = inst.reminderMinutes == null ? settings.reminder.minutesBefore : inst.reminderMinutes;
    if (minutes == null) continue;
    const start = inst.occurrenceStart;
    const triggerAt = start.getTime() - minutes * 60_000;
    const key = `${instanceKey(inst)}:${start.getTime()}`;
    if (fired.has(key)) continue;
    if (now.getTime() >= triggerAt && now.getTime() < start.getTime() + 60_000) {
      fired.add(key);
      const h12 = settings.timeFormat === '12h';
      reminderToast({
        title: t('reminder.title'),
        body: `${formatTime(start, h12)} · ${inst.title || t('event.untitled')}`,
        onClick: () => {
          if (displayMode) return;
          const source = store.data.events.find((e) => e.id === (inst.sourceId || inst.id));
          if (source) openEventEditor({ event: source, instance: inst.isRepeat ? inst : null });
        },
      });
      if (settings.reminder.sound) beep();
    }
  }
}

function handleStoreEvent(event) {
  switch (event.type) {
    case 'saved':
      break;
    case 'saveerror':
      toast(t('toast.saveFailed'), { type: 'error', icon: 'warning' });
      renderAll();
      break;
    case 'conflict':
      toast(t('toast.conflict'), { type: 'info', icon: 'warning' });
      if (!isLayoutEditing()) renderAll();
      break;
    case 'remote':
      if (isLayoutEditing()) return;
      renderAll();
      break;
    case 'change': {
      if (isLayoutEditing()) return;
      const reason = event.reason || 'data';
      if (reason === 'silent') return;
      if (reason === 'theme') {
        applyTheme();
        return;
      }
      if (reason === 'background') {
        applyTheme();
        return;
      }
      if (reason === 'settings') {
        syncLocale();
        applyTheme();
        renderToolbar({
          onDisplay: () => enterDisplayMode({ fullscreen: true }),
          onEditorExit: () => renderAll(),
          onViewChange: setAllCalendarViews,
        });
        renderCanvas();
        return;
      }
      if (reason === 'profile' || reason === 'layout') {
        applyTheme();
        renderToolbar({
          onDisplay: () => enterDisplayMode({ fullscreen: true }),
          onEditorExit: () => renderAll(),
          onViewChange: setAllCalendarViews,
        });
        renderCanvas();
        return;
      }
      renderCanvas();
      break;
    }
    default:
      break;
  }
}

function setupShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (openModalCount() > 0) return;
      if (displayMode) {
        e.preventDefault();
        exitDisplayMode();
      }
      return;
    }
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === 'e' && !e.shiftKey) {
      if (openModalCount() > 0 || displayMode) return;
      if (isMobileLayout()) {
        e.preventDefault();
        toast(t('settings.mobileEditHint'), { type: 'error', icon: 'warning' });
        return;
      }
      e.preventDefault();
      openLayoutEditor({ onExit: () => renderAll() });
      return;
    }
    if (meta && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (displayMode) exitDisplayMode();
      else enterDisplayMode({ fullscreen: true });
    }
  });
}

function setupObservers() {
  const desktop = window.matchMedia('(max-width: 1023px)');
  const phone = window.matchMedia('(max-width: 767px)');
  const rerender = debounce(() => renderCanvas(), 150);
  desktop.addEventListener('change', rerender);
  phone.addEventListener('change', rerender);
  document.getElementById('display-exit')?.addEventListener('click', () => exitDisplayMode());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkReminders();
  });
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
}

async function main() {
  try {
    await store.init();
    await initI18n(store.settings().locale);
    lastLocalePref = store.settings().locale;
    document.title = 'DayWeave';
    renderAll();
    store.subscribe(handleStoreEvent);
    connectSSE();
    setupShortcuts();
    setupObservers();
    setInterval(checkReminders, 20_000);
    setTimeout(checkReminders, 1500);
    hideSplash();
    if (store.settings().displayModeDefault) enterDisplayMode({ fullscreen: false });
  } catch (err) {
    console.error(err);
    showFatal(t('app.loadFailed'));
  }
}

window.addEventListener('beforeunload', () => sse?.close());
main();
