import { store } from '../core/store.js';
import { h, uid, clamp, isMobileLayout } from '../core/dom.js';
import {
  createDefaultWidgets,
  createWidget,
  defaultWidgetStyle,
  findFreeSpot,
  rectsOverlap,
  WIDGET_DEFAULTS,
  WIDGET_TYPES,
} from '../core/schema.js';
import { applyWidgetStyle } from '../core/style.js';
import { History } from '../core/undo.js';
import { displayName, t } from '../i18n/i18n.js';
import { btn, iconButton } from '../ui/controls.js';
import { iconSvg } from '../ui/icons.js';
import { confirmDialog, openModalCount } from '../ui/modal.js';
import { closePopover, menuItem, menuSeparator, menuTitle, openPopover } from '../ui/popover.js';
import { buildInspector } from '../ui/inspector.js';
import { toast } from '../ui/toast.js';
import { pickAndUpload } from '../ui/image-upload.js';
import { createNewProfile, deleteProfile, duplicateProfile, renameProfile, switchProfile } from '../ui/profiles.js';
import { renderWidget } from '../widgets/registry.js';
import { openCountdownEditor } from '../widgets/countdown.js';

const GAP = 12;
const ROW_HEIGHT = 40;

let active = false;
let draft = null;
let selectedId = null;
let dirty = false;
let history = new History(60);
let frames = new Map();
let widgetCleanups = [];
let surface = null;
let stage = null;
let colWidth = 60;
let onExitCallback = null;

export function isLayoutEditing() {
  return active;
}

function editorApp() {
  return document.getElementById('app');
}

function inspectorEl() {
  return document.getElementById('inspector');
}

function markDirty(pushHistory = true) {
  dirty = true;
  if (pushHistory) history.push(draft);
  renderEditorToolbar();
}

function rebuildFromStore() {
  draft = structuredClone(store.activeProfile());
  selectedId = null;
  dirty = false;
  history.reset(draft);
  closeInspector();
  renderEditorToolbar();
  renderStage();
}

async function confirmDiscard() {
  if (!dirty) return true;
  return confirmDialog({
    title: t('editor.exit'),
    message: t('editor.switchProfileConfirm'),
    confirmText: t('common.confirm'),
    danger: true,
  });
}

function openEditorProfileMenu(anchor) {
  const content = [menuTitle(t('editor.profiles'))];
  for (const profile of store.data.profiles) {
    content.push(
      menuItem({
        label: displayName(profile),
        active: profile.id === draft.id,
        onClick: async () => {
          if (profile.id === draft.id) return;
          if (!(await confirmDiscard())) return;
          switchProfile(profile.id);
          draft = structuredClone(store.activeProfile());
          selectedId = null;
          dirty = false;
          history.reset(draft);
          closeInspector();
          renderEditorToolbar();
          renderStage();
        },
      }),
    );
  }
  content.push(menuSeparator());
  content.push(menuItem({
    icon: 'plus',
    label: t('profile.new'),
    onClick: async () => {
      if (!(await confirmDiscard())) return;
      const created = await createNewProfile();
      if (created) rebuildFromStore();
    },
  }));
  content.push(menuItem({
    icon: 'edit',
    label: t('profile.rename'),
    onClick: async () => {
      await renameProfile(store.activeProfile());
      if (draft) draft.name = store.activeProfile().name;
      renderEditorToolbar();
    },
  }));
  content.push(menuItem({
    icon: 'copy',
    label: t('profile.duplicate'),
    onClick: async () => {
      if (!(await confirmDiscard())) return;
      duplicateProfile(store.activeProfile());
      rebuildFromStore();
    },
  }));
  content.push(menuItem({
    icon: 'trash',
    label: t('profile.delete'),
    disabled: store.data.profiles.length <= 1,
    onClick: async () => {
      if (!(await confirmDiscard())) return;
      const deleted = await deleteProfile(store.activeProfile());
      if (deleted) rebuildFromStore();
    },
  }));
  openPopover(anchor, content, { align: 'start', width: 220 });
}

function openWidgetPicker(anchor) {
  const grid = h('div', { class: 'widget-picker' });
  for (const type of WIDGET_TYPES) {
    grid.append(
      h('button', {
        type: 'button',
        onclick: () => {
          closePopover();
          addWidget(type);
        },
      }, [
        h('span', { class: 'wp-ico', html: iconSvg(
          type === 'eventList' ? 'list'
            : type === 'todo' ? 'todo'
              : type === 'note' ? 'note'
                : type === 'countdown' ? 'countdown'
                  : type === 'progress' ? 'progress'
                    : type === 'image' ? 'image'
                      : type,
          18,
        ) }),
        h('span', {}, t(`widget.${type}.name`)),
      ]),
    );
  }
  openPopover(anchor, [h('div', { class: 'popover-title' }, t('editor.addWidgetTitle')), grid], { align: 'start', width: 260 });
}

function renderEditorToolbar() {
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;
  toolbar.className = 'toolbar editor-toolbar';
  const addBtn = btn({
    icon: 'plus',
    label: t('editor.addWidget'),
    variant: 'primary',
    onClick: () => openWidgetPicker(addBtn),
  });
  const profileBtn = h('button', { class: 'btn ghost profile-btn', type: 'button' }, [
    h('span', { html: iconSvg('layout', 16) }),
    h('span', { class: 'ellipsis', style: { maxWidth: '120px' } }, displayName(draft)),
    h('span', { html: iconSvg('chevronDown', 14) }),
  ]);
  profileBtn.addEventListener('click', () => openEditorProfileMenu(profileBtn));

  const undoBtn = iconButton('undo', t('editor.undo'), () => undo(), { disabled: !history.canUndo() });
  const redoBtn = iconButton('redo', t('editor.redo'), () => redo(), { disabled: !history.canRedo() });

  const saveBtn = btn({ icon: 'save', label: t('editor.save'), variant: 'primary', onClick: saveDraft });
  const restoreBtn = btn({ icon: 'refresh', label: t('editor.restoreDefault'), variant: 'ghost', onClick: restoreDefault });
  const exitBtn = btn({ icon: 'x', label: t('editor.exit'), variant: 'ghost', onClick: requestExit });

  toolbar.replaceChildren(
    h('div', { class: 'brand editor-brand' }, [
      h('img', { src: '/assets/img/logo.svg', alt: '' }),
      h('span', {}, t('editor.title')),
      dirty ? h('span', { class: 'dirty-dot', title: t('toolbar.unsaved') }) : null,
    ]),
    addBtn,
    profileBtn,
    h('div', { class: 'toolbar-spacer' }),
    undoBtn,
    redoBtn,
    h('div', { class: 'toolbar-spacer' }),
    saveBtn,
    restoreBtn,
    exitBtn,
  );
}

function computeLayout() {
  if (!stage) return;
  const available = Math.max(360, surface.clientWidth - 48);
  colWidth = (available - GAP * 11) / 12;
  stage.style.width = `${available}px`;
  stage.style.setProperty('--cell-w', `${colWidth + GAP}px`);
  stage.style.setProperty('--cell-h', `${ROW_HEIGHT + GAP}px`);
  let maxRows = 8;
  for (const widget of draft.widgets) maxRows = Math.max(maxRows, widget.y + widget.h);
  stage.style.height = `${maxRows * ROW_HEIGHT + (maxRows - 1) * GAP + 24}px`;

  for (const [id, el] of frames) {
    const widget = draft.widgets.find((w) => w.id === id);
    if (!widget) continue;
    el.style.left = `${widget.x * (colWidth + GAP)}px`;
    el.style.top = `${widget.y * (ROW_HEIGHT + GAP)}px`;
    el.style.width = `${widget.w * colWidth + (widget.w - 1) * GAP}px`;
    el.style.height = `${widget.h * ROW_HEIGHT + (widget.h - 1) * GAP}px`;
  }
}

function toolButton(icon, title, onClick, opts = {}) {
  const b = iconButton(icon, title, (e) => {
    e.stopPropagation();
    onClick();
  }, opts);
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  return b;
}

function renderStage() {
  for (const fn of widgetCleanups) fn();
  widgetCleanups = [];
  frames.clear();
  stage.replaceChildren();
  if (!draft) return;

  if (selectedId && !draft.widgets.some((w) => w.id === selectedId)) selectedId = null;

  const sorted = [...draft.widgets].sort((a, b) => a.z - b.z || a.y - b.y);
  for (const widget of sorted) {
    const frame = h('div', {
      class: `edit-widget ${selectedId === widget.id ? 'selected' : ''} ${widget.locked ? 'locked' : ''}`,
      dataset: { id: widget.id },
      style: { zIndex: String(widget.z || 1) },
    });
    applyWidgetStyle(frame, widget.style, store.settings().performanceMode);
    const content = h('div', { class: 'edit-widget-content' });
    const cleanup = renderWidget(content, widget);
    if (typeof cleanup === 'function') widgetCleanups.push(cleanup);
    const tools = h('div', { class: 'edit-widget-tools' }, [
      toolButton('sliders', t('editor.properties'), () => selectWidget(widget.id)),
      toolButton(widget.locked ? 'unlock' : 'lock', widget.locked ? t('editor.unlock') : t('editor.lock'), () => {
        widget.locked = !widget.locked;
        markDirty(true);
        renderStage();
        if (selectedId === widget.id) openInspector(widget);
      }),
      toolButton('arrowUp', t('editor.layerUp'), () => reorder(widget, 1)),
      toolButton('arrowDown', t('editor.layerDown'), () => reorder(widget, -1)),
      toolButton('copy', t('editor.duplicate'), () => duplicateWidget(widget)),
      toolButton('trash', t('editor.delete'), () => deleteWidget(widget), { danger: true }),
    ]);
    const resizeHandle = h('div', { class: 'edit-resize', title: t('editor.size', { w: widget.w, h: widget.h }) });
    if (widget.locked) resizeHandle.style.display = 'none';
    frame.append(content, tools, resizeHandle);
    bindFrame(frame, widget);
    resizeHandle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      beginDrag(e, widget, frame, 'resize');
    });
    stage.append(frame);
    frames.set(widget.id, frame);
  }

  if (!draft.widgets.length) {
    stage.append(
      h('div', { class: 'editor-empty' }, [
        h('span', { html: iconSvg('layout', 30) }),
        h('strong', {}, t('editor.empty')),
      ]),
    );
  }
  computeLayout();
}

function bindFrame(frame, widget) {
  frame.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.edit-widget-tools') || e.target.closest('.edit-resize')) return;
    e.preventDefault();
    selectWidget(widget.id);
    if (!widget.locked) beginDrag(e, widget, frame, 'move');
  });
}

function beginDrag(e, widget, frame, mode) {
  const startX = e.clientX;
  const startY = e.clientY;
  const orig = { x: widget.x, y: widget.y, w: widget.w, h: widget.h };
  let next = { ...orig };
  let invalid = false;
  let changed = false;
  const colStep = colWidth + GAP;
  const rowStep = ROW_HEIGHT + GAP;
  frame.classList.add('dragging');

  const onMove = (ev) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!changed && Math.hypot(dx, dy) < 3) return;
    changed = true;
    if (mode === 'move') {
      next.x = clamp(orig.x + Math.round(dx / colStep), 0, 12 - orig.w);
      next.y = Math.max(0, orig.y + Math.round(dy / rowStep));
    } else {
      next.w = clamp(orig.w + Math.round(dx / colStep), 2, 12 - orig.x);
      next.h = Math.max(2, orig.h + Math.round(dy / rowStep));
    }
    const rect = { x: next.x, y: next.y, w: next.w, h: next.h };
    invalid = draft.widgets.some((w) => w.id !== widget.id && rectsOverlap(rect, w));
    frame.classList.toggle('invalid', invalid);
    frame.style.left = `${next.x * colStep}px`;
    frame.style.top = `${next.y * rowStep}px`;
    frame.style.width = `${next.w * colWidth + (next.w - 1) * GAP}px`;
    frame.style.height = `${next.h * ROW_HEIGHT + (next.h - 1) * GAP}px`;
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    frame.classList.remove('dragging');
    if (!changed) return;
    if (invalid) {
      frame.classList.remove('invalid');
      computeLayout();
      return;
    }
    Object.assign(widget, next);
    markDirty(true);
    computeLayout();
    if (selectedId === widget.id) openInspector(widget);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp, { once: true });
  window.addEventListener('pointercancel', onUp, { once: true });
}

function selectWidget(id) {
  selectedId = id;
  for (const [key, el] of frames) el.classList.toggle('selected', key === id);
  const widget = draft.widgets.find((w) => w.id === id);
  if (widget) openInspector(widget);
}

function openInspector(widget) {
  const aside = inspectorEl();
  if (!aside) return;
  const callbacks = {
    updateStyle(patch, commit) {
      Object.assign(widget.style, patch);
      const frame = frames.get(widget.id);
      if (frame) applyWidgetStyle(frame, widget.style, store.settings().performanceMode);
      if (commit) markDirty(true);
    },
    updateConfig(patch, commit, rerender) {
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete widget.config[key];
        else widget.config[key] = value;
      }
      if (rerender) renderStage();
      if (commit) markDirty(true);
    },
    resetStyle() {
      widget.style = defaultWidgetStyle();
      const frame = frames.get(widget.id);
      if (frame) applyWidgetStyle(frame, widget.style, store.settings().performanceMode);
      markDirty(true);
      openInspector(widget);
    },
    action(name) {
      handleInspectorAction(name, widget);
    },
    close() {
      closeInspector();
    },
  };
  aside.replaceChildren(buildInspector(widget, callbacks));
  aside.classList.add('open');
  aside.setAttribute('aria-hidden', 'false');
}

function closeInspector() {
  selectedId = null;
  for (const el of frames.values()) el.classList.remove('selected');
  const aside = inspectorEl();
  aside?.classList.remove('open');
  aside?.setAttribute('aria-hidden', 'true');
  aside?.replaceChildren();
}

async function handleInspectorAction(name, widget) {
  if (name === 'countdown') {
    const cd = store.data.countdowns.find((c) => c.id === widget.config?.countdownId);
    openCountdownEditor(widget, cd, () => {
      markDirty(true);
      renderStage();
      openInspector(widget);
    });
  } else if (name === 'image-change') {
    const results = await pickAndUpload();
    if (results.length) {
      widget.config.assetId = results[0].id;
      markDirty(true);
      renderStage();
      openInspector(widget);
    }
  } else if (name === 'image-remove') {
    widget.config.assetId = null;
    markDirty(true);
    renderStage();
    openInspector(widget);
  }
}

function addWidget(type) {
  const def = WIDGET_DEFAULTS[type];
  const widget = createWidget(type, 0, 0, { z: Math.max(0, ...draft.widgets.map((w) => w.z || 0)) + 1 });
  if (type === 'calendar') widget.config.view = store.settings().defaultView;
  const spot = findFreeSpot(draft.widgets, widget.w, widget.h);
  widget.x = spot.x;
  widget.y = spot.y;
  draft.widgets.push(widget);
  selectedId = widget.id;
  markDirty(true);
  renderStage();
  openInspector(widget);
}

async function deleteWidget(widget) {
  const ok = await confirmDialog({
    title: t('editor.delete'),
    message: t('editor.deleteConfirm'),
    confirmText: t('common.delete'),
    danger: true,
  });
  if (!ok) return;
  draft.widgets = draft.widgets.filter((w) => w.id !== widget.id);
  if (selectedId === widget.id) closeInspector();
  markDirty(true);
  renderStage();
  toast(t('editor.widgetDeleted'));
}

function duplicateWidget(widget) {
  const copy = structuredClone(widget);
  copy.id = uid('w');
  const spot = findFreeSpot(draft.widgets, widget.w, widget.h);
  copy.x = spot.x;
  copy.y = spot.y;
  copy.z = Math.max(0, ...draft.widgets.map((w) => w.z || 0)) + 1;
  draft.widgets.push(copy);
  selectedId = copy.id;
  markDirty(true);
  renderStage();
  openInspector(copy);
  toast(t('editor.widgetCopied'));
}

function reorder(widget, direction) {
  const sorted = [...draft.widgets].sort((a, b) => (a.z || 0) - (b.z || 0));
  const index = sorted.findIndex((w) => w.id === widget.id);
  const target = index + direction;
  if (target < 0 || target >= sorted.length) return;
  sorted.splice(target, 0, sorted.splice(index, 1)[0]);
  sorted.forEach((w, i) => {
    w.z = i + 1;
  });
  markDirty(true);
  renderStage();
  openInspector(widget);
}

function undo() {
  const snapshot = history.undo(draft);
  if (!snapshot) return;
  draft = snapshot;
  dirty = true;
  if (selectedId && !draft.widgets.some((w) => w.id === selectedId)) closeInspector();
  renderEditorToolbar();
  renderStage();
  const selected = draft.widgets.find((w) => w.id === selectedId);
  if (selected) openInspector(selected);
}

function redo() {
  const snapshot = history.redo(draft);
  if (!snapshot) return;
  draft = snapshot;
  dirty = true;
  if (selectedId && !draft.widgets.some((w) => w.id === selectedId)) closeInspector();
  renderEditorToolbar();
  renderStage();
  const selected = draft.widgets.find((w) => w.id === selectedId);
  if (selected) openInspector(selected);
}

function restoreDefault() {
  confirmDialog({
    title: t('editor.restoreDefault'),
    message: t('editor.resetConfirm'),
    confirmText: t('common.reset'),
    danger: true,
  }).then((ok) => {
    if (!ok) return;
    draft.widgets = createDefaultWidgets(store.settings().defaultView);
    selectedId = null;
    closeInspector();
    markDirty(true);
    renderStage();
    toast(t('toast.resetDone'));
  });
}

function saveDraft() {
  store.update((data) => {
    const target = data.profiles.find((p) => p.id === draft.id);
    if (target) target.widgets = structuredClone(draft.widgets);
  }, { reason: 'layout' });
  dirty = false;
  renderEditorToolbar();
  toast(t('editor.saved'), { type: 'success', icon: 'save' });
}

async function requestExit() {
  if (dirty) {
    const ok = await confirmDialog({
      title: t('editor.exit'),
      message: t('editor.exitConfirm'),
      confirmText: t('editor.exit'),
      danger: true,
    });
    if (!ok) return;
  }
  destroyEditor();
}

function onKeydown(e) {
  if (!active || openModalCount() > 0) return;
  const meta = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') {
    if (selectedId) {
      e.preventDefault();
      closeInspector();
    }
    return;
  }
  if (meta && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
    return;
  }
  if (meta && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveDraft();
    return;
  }
  if (e.key === 'Delete' && selectedId) {
    e.preventDefault();
    const widget = draft.widgets.find((w) => w.id === selectedId);
    if (widget) deleteWidget(widget);
  }
}

function onResize() {
  computeLayout();
}

function destroyEditor() {
  if (!active) return;
  active = false;
  for (const fn of widgetCleanups) fn();
  widgetCleanups = [];
  frames.clear();
  surface?.remove();
  surface = null;
  stage = null;
  draft = null;
  selectedId = null;
  dirty = false;
  const canvas = document.getElementById('canvas');
  if (canvas) canvas.style.display = '';
  document.body.classList.remove('layout-editing');
  closeInspector();
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', onResize);
  const toolbar = document.getElementById('toolbar');
  if (toolbar) toolbar.className = 'toolbar';
  onExitCallback?.();
  onExitCallback = null;
}

export function openLayoutEditor({ onExit } = {}) {
  if (active) return;
  if (document.body.classList.contains('display-mode')) return;
  if (isMobileLayout()) {
    toast(t('settings.mobileEditHint'), { type: 'error', icon: 'warning' });
    return;
  }
  active = true;
  onExitCallback = onExit || null;
  draft = structuredClone(store.activeProfile());
  selectedId = null;
  dirty = false;
  history.reset(draft);
  document.body.classList.add('layout-editing');
  const canvas = document.getElementById('canvas');
  if (canvas) canvas.style.display = 'none';

  surface = h('div', { class: 'editor-canvas' });
  stage = h('div', { class: 'editor-stage' });
  surface.append(stage);
  surface.addEventListener('pointerdown', (e) => {
    if (e.target === surface || e.target === stage) closeInspector();
  });
  editorApp().append(surface);

  renderEditorToolbar();
  renderStage();
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', onResize);
}
