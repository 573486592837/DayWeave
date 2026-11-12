import { store } from './store.js';

const FONT_SCALES = { sm: '14px', md: '16px', lg: '18px' };

let slideshowTimer = null;
let slideIndex = 0;
let slideUrls = [];

function assetUrl(id) {
  const asset = store.asset(id);
  return asset ? `/uploads/${asset.filename}` : null;
}

function fitStyles(fit) {
  switch (fit) {
    case 'contain':
      return { backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
    case 'repeat':
      return { backgroundSize: 'auto', backgroundRepeat: 'repeat', backgroundPosition: 'top left' };
    case 'center':
      return { backgroundSize: 'auto', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
    default:
      return { backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
  }
}

function setSlide(el, url, fit, visible) {
  el.style.backgroundImage = url ? `url("${url}")` : 'none';
  Object.assign(el.style, fitStyles(fit));
  el.style.opacity = visible ? '1' : '0';
}

export function applyTheme(settings = store.settings(), profile = store.activeProfile()) {
  if (!settings) return;
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  root.style.fontSize = FONT_SCALES[settings.fontScale] || FONT_SCALES.md;
  root.classList.toggle('performance-mode', Boolean(settings.performanceMode));
  if (profile) renderBackground(profile.background);
}

export function renderBackground(bg) {
  const layer = document.getElementById('bg-layer');
  const overlay = document.getElementById('bg-overlay');
  if (!layer || !overlay || !bg) return;
  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }
  layer.replaceChildren();
  layer.style.filter = '';
  layer.style.transform = '';
  layer.style.background = '';
  layer.style.backgroundColor = '';

  const blur = store.settings()?.performanceMode ? 0 : Number(bg.blur) || 0;
  if (blur > 0) {
    layer.style.filter = `blur(${blur}px)`;
    layer.style.transform = 'scale(1.08)';
  }

  if (bg.type === 'gradient') {
    layer.style.background = `linear-gradient(${bg.gradient.angle}deg, ${bg.gradient.from}, ${bg.gradient.to})`;
  } else if (bg.type === 'image') {
    const url = bg.image?.assetId ? assetUrl(bg.image.assetId) : null;
    if (url) {
      const fit = bg.image.fit || 'cover';
      layer.style.background = bg.color;
      layer.style.backgroundImage = `url("${url}")`;
      layer.style.backgroundSize = fit === 'contain' ? 'contain' : fit === 'repeat' || fit === 'center' ? 'auto' : 'cover';
      layer.style.backgroundRepeat = fit === 'repeat' ? 'repeat' : 'no-repeat';
      layer.style.backgroundPosition = 'center';
      layer.classList.remove('bg-empty');
    } else {
      layer.style.background = bg.color;
      layer.classList.add('bg-empty');
    }
  } else if (bg.type === 'slideshow') {
    const urls = (bg.slideshow?.assetIds || []).map(assetUrl).filter(Boolean);
    if (!urls.length) {
      layer.style.background = bg.color;
    } else {
      const a = document.createElement('div');
      const b = document.createElement('div');
      a.className = 'bg-slide';
      b.className = 'bg-slide';
      layer.append(a, b);
      slideUrls = urls;
      slideIndex = 0;
      const [first, second] = [a, b];
      setSlide(first, urls[0], bg.image?.fit || 'cover', true);
      setSlide(second, urls.length > 1 ? urls[1] : null, bg.image?.fit || 'cover', false);
      let showFirst = true;
      let nextIndex = 1;
      const fade = bg.slideshow.transition !== 'none';
      // 预加载，避免切换时闪白
      urls.forEach((u) => {
        const img = new Image();
        img.src = u;
      });
      const advance = () => {
        if (!slideUrls.length) return;
        const targetIndex = bg.slideshow.order === 'random'
          ? Math.floor(Math.random() * slideUrls.length)
          : nextIndex % slideUrls.length;
        nextIndex = targetIndex + 1;
        const incoming = showFirst ? second : first;
        const outgoing = showFirst ? first : second;
        const url = slideUrls[targetIndex];
        setSlide(incoming, url, bg.image?.fit || 'cover', true);
        outgoing.style.opacity = '0';
        incoming.style.opacity = fade ? '1' : '1';
        if (!fade) incoming.style.transition = 'none';
        showFirst = !showFirst;
      };
      slideshowTimer = setInterval(advance, Math.max(15, Number(bg.slideshow.intervalSec) || 60) * 1000);
    }
  } else {
    layer.style.background = bg.color;
  }

  overlay.style.background = bg.overlay?.color || '#000';
  overlay.style.opacity = String(bg.overlay?.opacity ?? 0);
}

export function stopBackgroundTimer() {
  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }
}
