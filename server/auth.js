import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import { AUTH_FILE, COOKIE_NAME, SESSION_TTL_MS } from './config.js';
import { log } from './logger.js';

const scryptAsync = promisify(crypto.scrypt);
const MIN_PASSWORD = 4;

let auth = { passwordHash: null, sessions: [] };
let writeQueue = Promise.resolve();
const failuresByIp = new Map();

function enqueue(task) {
  const run = writeQueue.then(task);
  writeQueue = run.catch(() => {});
  return run;
}

async function persist() {
  const text = JSON.stringify(auth, null, 2);
  await enqueue(async () => {
    const tmp = `${AUTH_FILE}.tmp`;
    await fsp.writeFile(tmp, text, 'utf8');
    await fsp.rename(tmp, AUTH_FILE);
    try {
      await fsp.chmod(AUTH_FILE, 0o600);
    } catch {
      /* Windows 不支持 POSIX 权限，忽略 */
    }
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password) {
  if (!auth.passwordHash || typeof password !== 'string') return false;
  const parts = auth.passwordHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    const actual = await scryptAsync(password, salt, expected.length);
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function pruneSessions() {
  const now = Date.now();
  const before = auth.sessions.length;
  auth.sessions = auth.sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
  return auth.sessions.length !== before;
}

function pruneFailures(ip) {
  const now = Date.now();
  const list = (failuresByIp.get(ip) || []).filter((t) => now - t < 60_000);
  if (list.length) failuresByIp.set(ip, list);
  else failuresByIp.delete(ip);
  return list;
}

export async function initAuth() {
  await fsp.mkdir(AUTH_FILE.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
  if (fs.existsSync(AUTH_FILE)) {
    try {
      const parsed = JSON.parse(await fsp.readFile(AUTH_FILE, 'utf8'));
      auth = {
        passwordHash: typeof parsed.passwordHash === 'string' ? parsed.passwordHash : null,
        sessions: Array.isArray(parsed.sessions)
          ? parsed.sessions.filter((s) => s && typeof s.token === 'string')
          : [],
      };
    } catch (err) {
      log.error('auth.json 读取失败，将按未设置密码处理', err);
      auth = { passwordHash: null, sessions: [] };
    }
  } else {
    await persist();
    log.info('已初始化 data/auth.json');
  }
  if (pruneSessions()) await persist();
}

export function hasPassword() {
  return Boolean(auth.passwordHash);
}

function tokenOf(req) {
  const raw = req.cookies?.[COOKIE_NAME];
  if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw)) return null;
  return raw;
}

export function getSession(req) {
  const token = tokenOf(req);
  if (!token) return null;
  const session = auth.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    auth.sessions = auth.sessions.filter((s) => s.token !== token);
    persist();
    return null;
  }
  // lastSeenAt 最多每小时落盘一次，避免每个请求都写文件
  const lastSeen = new Date(session.lastSeenAt || 0).getTime();
  session.lastSeenAt = new Date().toISOString();
  if (Date.now() - lastSeen > 60 * 60 * 1000) persist();
  return session;
}

export function isAuthed(req) {
  return Boolean(getSession(req));
}

export function requireAuth(req, res, next) {
  if (!getSession(req)) {
    return res.status(401).json({ ok: false, needSetup: !hasPassword() });
  }
  next();
}

function cookieOptions(req) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(req?.secure || req?.headers?.['x-forwarded-proto'] === 'https'),
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

async function issueSession(req, res) {
  pruneSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  auth.sessions.push({
    token,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    lastSeenAt: now.toISOString(),
  });
  await persist();
  res.cookie(COOKIE_NAME, token, cookieOptions(req));
}

function clearSession(req, res) {
  const token = tokenOf(req);
  if (token) {
    auth.sessions = auth.sessions.filter((s) => s.token !== token);
    persist();
  }
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(req), maxAge: undefined });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const authRouter = express.Router();

authRouter.get('/me', (req, res) => {
  const ok = isAuthed(req);
  res.json({ ok, needSetup: !hasPassword() });
});

authRouter.post('/setup', async (req, res) => {
  if (hasPassword()) return res.status(409).json({ error: 'already_setup' });
  const { password } = req.body || {};
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: 'weak_password' });
  }
  if (password.length > 200) return res.status(400).json({ error: 'weak_password' });
  auth.passwordHash = await hashPassword(password);
  await persist();
  await issueSession(req, res);
  log.info('已设置访问密码');
  res.status(204).end();
});

authRouter.post('/login', async (req, res) => {
  const ip = req.ip || 'unknown';
  const recent = pruneFailures(ip);
  if (recent.length >= 5) {
    await wait(1200);
    return res.status(429).json({ error: 'too_many_attempts' });
  }
  if (!hasPassword()) return res.status(409).json({ error: 'setup_required' });
  const { password } = req.body || {};
  const ok = await verifyPassword(password);
  if (!ok) {
    recent.push(Date.now());
    failuresByIp.set(ip, recent);
    await wait(400);
    return res.status(401).json({ error: 'bad_password' });
  }
  failuresByIp.delete(ip);
  await issueSession(req, res);
  res.status(204).end();
});

authRouter.post('/logout', (req, res) => {
  clearSession(req, res);
  res.status(204).end();
});

authRouter.post('/password', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  const ok = await verifyPassword(oldPassword);
  if (!ok) {
    await wait(300);
    return res.status(401).json({ error: 'bad_password' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD) {
    return res.status(400).json({ error: 'weak_password' });
  }
  auth.passwordHash = await hashPassword(newPassword);
  // 修改密码后让所有旧会话失效，并为当前设备签发新会话
  auth.sessions = [];
  clearSessionCookieOnly(req, res);
  await persist();
  await issueSession(req, res);
  log.info('访问密码已修改，所有旧会话失效');
  res.status(204).end();
});

function clearSessionCookieOnly(req, res) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(req), maxAge: undefined });
}

export async function verifyUserPassword(password) {
  return verifyPassword(password);
}
