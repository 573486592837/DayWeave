// 语言解析：auto 时按浏览器语言前缀匹配，zh → 中文，其余 → 英文
export const SUPPORTED = ['zh-CN', 'en-US'];

export function resolveLocale(pref) {
  if (SUPPORTED.includes(pref)) return pref;
  const list = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language || 'zh-CN'];
  return list.some((lang) => String(lang).toLowerCase().startsWith('zh')) ? 'zh-CN' : 'en-US';
}

export function localeLabel(locale) {
  return locale === 'zh-CN' ? '中文' : 'English';
}
