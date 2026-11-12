import express from 'express';
import { requireAuth, verifyUserPassword } from './auth.js';
import { getState, replaceState, resetState } from './store.js';
import { broadcastState } from './sse.js';
import { log } from './logger.js';

export const stateRouter = express.Router();

stateRouter.use(requireAuth);

stateRouter.get('/', (req, res) => {
  res.json(getState());
});

stateRouter.put('/', async (req, res) => {
  const { rev, data } = req.body || {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'invalid_data' });
  }
  try {
    const result = await replaceState(data, Number(rev));
    if (result.conflict) {
      return res.status(409).json({ error: 'rev_conflict', rev: result.rev, data: result.data });
    }
    broadcastState(result.rev);
    res.json({ rev: result.rev });
  } catch (err) {
    log.error('保存状态失败', err);
    res.status(500).json({ error: 'save_failed' });
  }
});

// 清除全部数据：需要再次输入访问密码
stateRouter.post('/reset', async (req, res) => {
  const { password } = req.body || {};
  const ok = await verifyUserPassword(password);
  if (!ok) return res.status(401).json({ error: 'bad_password' });
  try {
    const state = await resetState();
    broadcastState(state.rev);
    res.json({ rev: state.rev });
  } catch (err) {
    log.error('清空数据失败', err);
    res.status(500).json({ error: 'reset_failed' });
  }
});
