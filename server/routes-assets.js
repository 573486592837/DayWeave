import path from 'node:path';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { MAX_UPLOAD_BYTES, UPLOAD_DIR } from './config.js';
import { addAsset, getState, removeAsset } from './store.js';
import { broadcastState } from './sse.js';
import { requireAuth } from './auth.js';
import { log } from './logger.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

// 通过文件头（magic bytes）判定真实类型，避免仅伪造扩展名
function detectImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return { ext: 'gif', mime: 'image/gif' };
  }
  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

function assetReferences(data, assetId) {
  const refs = [];
  for (const p of data.profiles || []) {
    const bg = p.background || {};
    if (bg.image?.assetId === assetId) refs.push('background.image');
    if (Array.isArray(bg.slideshow?.assetIds) && bg.slideshow.assetIds.includes(assetId)) {
      refs.push('background.slideshow');
    }
    for (const w of p.widgets || []) {
      if (w.type === 'image' && w.config?.assetId === assetId) refs.push(`widget:${w.id}`);
    }
  }
  return refs;
}

export const assetsRouter = express.Router();

assetsRouter.use(requireAuth);

assetsRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file_required' });
  const detected = detectImage(req.file.buffer);
  if (!detected) return res.status(415).json({ error: 'unsupported_type' });

  const filename = `${crypto.randomBytes(8).toString('hex')}.${detected.ext}`;
  const full = path.join(UPLOAD_DIR, filename);
  try {
    await fsp.mkdir(UPLOAD_DIR, { recursive: true });
    await fsp.writeFile(full, req.file.buffer);
  } catch (err) {
    log.error('写入上传文件失败', err);
    return res.status(500).json({ error: 'write_failed' });
  }

  const meta = {
    id: `a_${crypto.randomBytes(6).toString('hex')}`,
    filename,
    mime: detected.mime,
    size: req.file.size,
    createdAt: new Date().toISOString(),
  };
  const state = await addAsset(meta);
  broadcastState(state.rev);
  res.status(201).json({ id: meta.id, url: `/uploads/${filename}`, rev: state.rev });
});

assetsRouter.delete('/:id', async (req, res) => {
  const { data } = getState();
  const asset = data.assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'not_found' });
  const refs = assetReferences(data, asset.id);
  if (refs.length) return res.status(409).json({ error: 'asset_in_use', references: refs });

  try {
    await fsp.rm(path.join(UPLOAD_DIR, asset.filename), { force: true });
  } catch (err) {
    log.warn(`删除上传文件失败：${err.message}`);
  }
  const state = await removeAsset(asset.id);
  broadcastState(state.rev);
  res.status(204).end();
});

// multer 错误统一转换为 JSON（文件过大等）
export function assetsErrorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const code = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(code).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'upload_failed' });
  }
  next(err);
}
