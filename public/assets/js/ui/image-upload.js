import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { t } from '../i18n/i18n.js';
import { toast } from './toast.js';

const MAX_UPLOAD = 5 * 1024 * 1024;

function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => loadImage(file));
  }
  return loadImage(file);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode_failed'));
    };
    img.src = url;
  });
}

async function canvasToBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

// 前端压缩：长边 ≤ 2560，JPEG 质量 0.85；GIF 保留原文件以保住动画
export async function compressImage(file) {
  if (file.type === 'image/gif') return file;
  if (!file.type.startsWith('image/')) throw new Error('unsupported_type');
  if (file.size > 30 * 1024 * 1024) throw new Error('too_large');

  const source = await loadBitmap(file);
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  const longSide = Math.max(width, height);
  const ratio = longSide > 2560 ? 2560 / longSide : 1;
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  source.close?.();
  const blob = await canvasToBlob(canvas, 0.85);
  if (!blob) return file;
  return new File([blob], 'dayweave-image.jpg', { type: 'image/jpeg' });
}

export async function uploadImage(file, { silent = false } = {}) {
  if (!file) return null;
  try {
    if (!silent) toast(t('background.compressing'), { duration: 1600 });
    const compressed = await compressImage(file);
    if (compressed.size > MAX_UPLOAD) {
      toast(t('image.sizeLimit'), { type: 'error' });
      return null;
    }
    const result = await api.uploadAsset(compressed);
    await store.refresh();
    if (!silent) toast(t('toast.uploaded'), { type: 'success', icon: 'image' });
    return result;
  } catch (err) {
    if (err.status === 413) toast(t('image.sizeLimit'), { type: 'error' });
    else toast(t('image.uploadFailed'), { type: 'error' });
    console.error(err);
    return null;
  }
}

export function pickFiles({ multiple = false, accept = 'image/jpeg,image/png,image/webp,image/gif' } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    document.body.append(input);
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      input.remove();
      resolve(files);
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve([]);
    });
    input.click();
  });
}

export async function pickAndUpload({ multiple = false } = {}) {
  const files = await pickFiles({ multiple });
  const results = [];
  for (const file of files) {
    const res = await uploadImage(file);
    if (res) results.push(res);
  }
  return results;
}
