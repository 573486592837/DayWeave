import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import fsp from 'node:fs/promises';
import express from 'express';
import cookieParser from 'cookie-parser';
import {
  HOST,
  PORT,
  PUBLIC_DIR,
  UPLOAD_DIR,
  MAX_STATE_BYTES,
  SSL_KEY,
  SSL_CERT,
} from './config.js';
import { log, accessLogger } from './logger.js';
import { initStore, getState } from './store.js';
import { authRouter, initAuth, isAuthed, requireAuth } from './auth.js';
import { stateRouter } from './routes-state.js';
import { assetsRouter, assetsErrorHandler } from './routes-assets.js';
import { sseHandler, sseClientCount } from './sse.js';

const app = express();
app.disable('x-powered-by');
app.use(accessLogger);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
app.use(express.json({ limit: MAX_STATE_BYTES }));
app.use(cookieParser());

app.get('/healthz', (req, res) => res.type('text').send('ok'));

app.use('/api/auth', authRouter);
app.use('/api/state', stateRouter);
app.use('/api/assets', assetsRouter, assetsErrorHandler);
app.get('/api/stream', requireAuth, sseHandler);
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

// 上传图片受会话保护，且只允许访问服务器生成的文件名
app.get('/uploads/:filename', requireAuth, (req, res) => {
  const name = req.params.filename;
  if (!/^[a-f0-9]{16}\.(jpg|png|webp|gif)$/.test(name)) {
    return res.status(400).type('text').send('invalid filename');
  }
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(path.join(UPLOAD_DIR, name), (err) => {
    if (err && !res.headersSent) res.status(404).type('text').send('not found');
  });
});

// 主应用页需要登录；其余静态资源（登录页、CSS/JS/词条）公开
app.get(['/', '/index.html'], (req, res, next) => {
  if (!isAuthed(req)) return res.redirect('/login.html');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'), (err) => {
    if (err) next(err);
  });
});

app.use(
  express.static(PUBLIC_DIR, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      if (filePath.endsWith('.json')) res.setHeader('Cache-Control', 'no-cache');
    },
  }),
);

// 未登录访问任意未知地址 → 登录页；已登录 → 404
app.use((req, res) => {
  if (req.method === 'GET' && req.accepts('html') && !isAuthed(req)) {
    return res.redirect('/login.html');
  }
  if (req.method === 'GET' && req.accepts('html')) {
    return res.status(404).type('text').send('Not found');
  }
  res.status(404).json({ error: 'not_found' });
});

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'payload_too_large' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'invalid_json' });
  }
  log.error(`${req.method} ${req.originalUrl} 未处理错误`, err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'internal_error' });
});

const VIRTUAL_IFACE = /(vmware|virtualbox|vbox|hyper-v|vethernet|wsl|docker|loopback|bluetooth|tap|tun|teredo|isatap|tailscale|zerotier)/i;

function lanAddresses() {
  const physical = [];
  const virtual = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      if (net.address.startsWith('169.254.')) continue;
      const entry = { name, address: net.address };
      (VIRTUAL_IFACE.test(name) ? virtual : physical).push(entry);
    }
  }
  return { physical, virtual };
}

async function main() {
  await initStore();
  await initAuth();
  const useHttps = Boolean(SSL_KEY && SSL_CERT);
  const scheme = useHttps ? 'https' : 'http';
  let server;
  if (useHttps) {
    const [key, cert] = await Promise.all([fsp.readFile(SSL_KEY), fsp.readFile(SSL_CERT)]);
    server = https.createServer({ key, cert }, app);
  } else {
    server = http.createServer(app);
  }
  server.listen(PORT, HOST, () => {
    const state = getState();
    log.info(`DayWeave 已启动（${scheme}），rev=${state.rev}，SSE 客户端=${sseClientCount()}`);
    console.log('');
    console.log(`  本机访问:   ${scheme}://localhost:${PORT}`);
    const { physical, virtual } = lanAddresses();
    if (physical.length) {
      console.log('  内网访问（手机/平板需与电脑处于同一网络）:');
      for (const { name, address } of physical) {
        console.log(`    ${scheme}://${address}:${PORT}  [${name}]`);
      }
    } else {
      console.log('  未检测到可用的内网 IPv4 地址，请确认已连接 Wi-Fi 或网线');
    }
    if (virtual.length) {
      console.log('  虚拟网卡（仅本机可达，手机请勿使用）:');
      for (const { name, address } of virtual) {
        console.log(`    ${scheme}://${address}:${PORT}  [${name}]`);
      }
    }
    console.log('');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log.error(`端口 ${PORT} 已被占用，请设置 PORT 环境变量换一个端口`);
    } else {
      log.error('服务器启动失败', err);
    }
    process.exit(1);
  });
  const shutdown = (signal) => {
    log.info(`收到 ${signal}，正在关闭…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (err) => log.error('未处理的 Promise 拒绝', err));
process.on('uncaughtException', (err) => log.error('未捕获异常', err));

main().catch((err) => {
  log.error('启动失败', err);
  process.exit(1);
});
