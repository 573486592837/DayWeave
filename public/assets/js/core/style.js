const FONT_SIZES = { sm: '13px', md: '15px', lg: '17px' };

export function hexToRgba(hex, alpha = 1) {
  if (!hex || typeof hex !== 'string') return `rgba(0,0,0,${alpha})`;
  let value = hex.trim();
  if (!value.startsWith('#')) return value;
  value = value.slice(1);
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  const int = parseInt(value, 16);
  if (Number.isNaN(int)) return value;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${Number(alpha)})`;
}

export function applyWidgetStyle(el, style = {}, performanceMode = false) {
  if (style.bg) {
    el.style.setProperty('--w-bg', hexToRgba(style.bg, style.bgOpacity ?? 1));
  } else {
    el.style.removeProperty('--w-bg');
  }
  el.style.setProperty('--w-blur', `${performanceMode ? 0 : Number(style.blur) || 0}px`);
  el.style.setProperty('--w-radius', `${Number(style.radius) || 0}px`);
  el.style.setProperty('--w-padding', `${Number(style.padding) || 0}px`);
  el.style.setProperty('--w-font-size', FONT_SIZES[style.fontSize] || FONT_SIZES.md);
  if (style.color) el.style.setProperty('--w-color', style.color);
  else el.style.removeProperty('--w-color');
}
