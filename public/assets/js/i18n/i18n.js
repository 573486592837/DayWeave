import { resolveLocale } from './locales.js';

const dicts = {};
let locale = 'zh-CN';
let pref = 'auto';
const warned = new Set();

function lookup(dict, key) {
  let node = dict;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export async function initI18n(localePref = 'auto') {
  const [zh, en] = await Promise.all([
    fetch('/assets/i18n/zh-CN.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch('/assets/i18n/en-US.json', { cache: 'no-cache' }).then((r) => r.json()),
  ]);
  dicts['zh-CN'] = zh;
  dicts['en-US'] = en;
  pref = localePref;
  apply();
}

function apply() {
  locale = resolveLocale(pref);
  document.documentElement.lang = locale;
}

export function t(key, params) {
  let value = lookup(dicts[locale], key);
  if (value == null) value = lookup(dicts['zh-CN'], key);
  if (value == null) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] 缺少词条：${key}`);
    }
    return key;
  }
  if (params) {
    value = value.replace(/\{(\w+)\}/g, (m, name) => (params[name] != null ? String(params[name]) : m));
  }
  return value;
}

export function setLocalePref(nextPref, { silent = false } = {}) {
  pref = nextPref;
  apply();
  if (!silent) {
    window.dispatchEvent(new CustomEvent('dw:localechange', { detail: { locale } }));
  }
}

export function getLocale() {
  return locale;
}

export function getLocalePref() {
  return pref;
}

// 内置主题/分类/布局方案：未改名时按 i18n key 翻译，改名后显示原文
export function displayName(item, keyField = 'builtinNameKey') {
  if (!item) return '';
  const key = item[keyField];
  if (key) return t(key);
  return item.name ?? '';
}
