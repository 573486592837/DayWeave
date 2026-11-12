import { api } from './api.js';
import { debounce } from './dom.js';

const listeners = new Set();

export const store = {
  rev: 0,
  data: null,
  ready: false,
  saving: false,
  dirty: false,
  lastServer: null,

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  emit(event) {
    for (const fn of listeners) fn(event);
  },

  async init() {
    const { rev, data } = await api.getState();
    this.rev = rev;
    this.data = data;
    this.lastServer = structuredClone(data);
    this.ready = true;
    this.emit({ type: 'load' });
  },

  async refresh() {
    const { rev, data } = await api.getState();
    this.rev = rev;
    this.data = data;
    this.lastServer = structuredClone(data);
    this.emit({ type: 'remote', rev });
  },

  settings() {
    return this.data?.settings;
  },

  activeProfile() {
    if (!this.data) return null;
    return this.data.profiles.find((p) => p.id === this.data.activeProfileId) || this.data.profiles[0];
  },

  category(id) {
    return this.data?.categories.find((c) => c.id === id) || null;
  },

  asset(id) {
    return this.data?.assets.find((a) => a.id === id) || null;
  },

  // 本地乐观更新；reason 用于让界面决定刷新范围（例如便签输入不重建 DOM）
  update(mutator, { save = true, reason = 'data' } = {}) {
    if (!this.data) return;
    mutator(this.data);
    this.dirty = true;
    this.emit({ type: 'change', reason });
    if (save) this.scheduleSave();
  },

  scheduleSave: debounce(function schedule() {
    store.flushSave();
  }, 250),

  async flushSave() {
    if (!this.ready || !this.data) return;
    if (this.saving) {
      this.dirty = true;
      return;
    }
    if (!this.dirty) return;
    this.saving = true;
    this.dirty = false;
    const rev = this.rev;
    const snapshot = structuredClone(this.data);
    try {
      const res = await api.putState(rev, snapshot);
      this.rev = res.rev;
      this.lastServer = snapshot;
      this.saving = false;
      this.emit({ type: 'saved', rev: res.rev });
      if (this.dirty) this.flushSave();
    } catch (err) {
      this.saving = false;
      if (err.status === 409) {
        const latest = err.body || {};
        if (latest.data) {
          this.rev = latest.rev;
          this.data = latest.data;
          this.lastServer = structuredClone(latest.data);
          this.dirty = false;
          this.emit({ type: 'conflict', rev: latest.rev });
        }
      } else {
        if (this.lastServer) this.data = structuredClone(this.lastServer);
        this.dirty = false;
        this.emit({ type: 'saveerror', error: err });
      }
    }
  },

  applyRemote(rev, data) {
    this.rev = rev;
    this.data = data;
    this.lastServer = structuredClone(data);
    this.emit({ type: 'remote', rev });
  },

  // 上传图片等会导致服务端 rev 前进，需要整体刷新
  async afterExternalChange() {
    await this.refresh();
  },
};

window.addEventListener('pagehide', () => {
  if (!store.dirty || !store.data) return;
  try {
    fetch('/api/state', {
      method: 'PUT',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rev: store.rev, data: store.data }),
    });
  } catch {
    /* 页面关闭时尽力而为 */
  }
});
