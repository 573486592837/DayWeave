import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '..');
export const PORT = Number(process.env.PORT || 8080);
export const HOST = process.env.HOST || '0.0.0.0';
export const DATA_DIR = process.env.DAYWEAVE_DATA
  ? path.resolve(process.env.DAYWEAVE_DATA)
  : path.join(ROOT, 'data');
export const DB_FILE = path.join(DATA_DIR, 'db.json');
export const BAK_FILE = path.join(DATA_DIR, 'db.json.bak');
export const AUTH_FILE = path.join(DATA_DIR, 'auth.json');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const LOG_FILE = process.env.DAYWEAVE_LOG
  ? path.resolve(process.env.DAYWEAVE_LOG)
  : path.join(ROOT, 'dayweave.log');

export const COOKIE_NAME = 'dw_sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_STATE_BYTES = 8 * 1024 * 1024;
export const IS_PROD = process.env.NODE_ENV === 'production';
// 可选：同时提供证书与私钥即以 HTTPS 启动
export const SSL_KEY = process.env.SSL_KEY ? path.resolve(process.env.SSL_KEY) : null;
export const SSL_CERT = process.env.SSL_CERT ? path.resolve(process.env.SSL_CERT) : null;
