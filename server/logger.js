import fs from 'node:fs';
import { LOG_FILE } from './config.js';

// 日志同时写控制台与 dayweave.log；写失败不影响主流程
function line(level, message) {
  const text = `${new Date().toISOString()} [${level}] ${message}`;
  if (level === 'ERROR') console.error(text);
  else console.log(text);
  try {
    fs.appendFileSync(LOG_FILE, text + '\n');
  } catch {
    /* 忽略日志写入失败 */
  }
}

export const log = {
  info: (msg) => line('INFO', msg),
  warn: (msg) => line('WARN', msg),
  error: (msg, err) => line('ERROR', err ? `${msg} :: ${err.stack || err}` : msg),
};

// 访问日志：方法 / 路径 / 状态 / 耗时
export function accessLogger(req, res, next) {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const path = req.originalUrl.split('?')[0];
    log.info(`${req.method} ${path} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
}
