import { log } from './logger.js';

const clients = new Set();

export function sseHandler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  clients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      /* 连接已断，close 事件会清理 */
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

export function broadcastState(rev) {
  const payload = `event: state\ndata: ${JSON.stringify({ type: 'state', rev })}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch (err) {
      log.warn(`SSE 推送失败：${err.message}`);
      clients.delete(res);
    }
  }
}

export function sseClientCount() {
  return clients.size;
}
