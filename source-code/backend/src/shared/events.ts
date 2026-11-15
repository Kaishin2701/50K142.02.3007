import type { RequestHandler } from 'express';
import type { Database } from './database.js';
import type { authService } from '../modules/auth/auth.service.js';
import { notificationList } from './notifications.js';
import { AppError } from './errors.js';

/** Best-effort refresh events. Business data is always fetched through authorized APIs. */
export type EventStreamHandler = RequestHandler & { closeAll(): Promise<void> };

export function eventStream(db: Database, auth: ReturnType<typeof authService>): EventStreamHandler {
  const clients = new Set<() => void>();
  const activeTicks = new Set<Promise<void>>();
  let shuttingDown = false;

  const handler: RequestHandler = (req, res) => {
    if (shuttingDown) {
      res.status(503).end();
      return;
    }

    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : req.cookies?.me_session;
    const seen = new Set<string>();
    let busy = false;
    let closed = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const markClosed = () => {
      if (closed) return;
      closed = true;
      if (interval) clearInterval(interval);
      clients.delete(close);
    };
    const close = () => {
      if (closed) return;
      markClosed();
      res.end();
    };
    clients.add(close);
    res.on('close', markClosed);
    res.write('event: ready\ndata: {}\n\n');

    const tick = async () => {
      if (busy || closed) return;
      busy = true;
      const operation = (async () => {
        try {
          await auth.authenticate(token);
          const notifications = await notificationList(db, req.actor!.id, 100, 0);
          const fresh = notifications.filter(notification => !seen.has(notification.ma_thong_bao));
          for (const notification of notifications) seen.add(notification.ma_thong_bao);
          if (seen.size > 1000) {
            seen.clear();
            for (const notification of notifications) seen.add(notification.ma_thong_bao);
          }
          if (!closed && fresh.length) {
            res.write(`event: refresh\ndata: ${JSON.stringify({ types: [...new Set(fresh.map(notification => notification.loai))] })}\n\n`);
          } else if (!closed) {
            res.write(': heartbeat\n\n');
          }
        } catch (error) {
          if (closed) return;
          if (!(error instanceof AppError) || error.status !== 401) throw error;
          const reason = error.code === 'ACCOUNT_LOCKED' ? 'locked' : 'expired';
          res.write('event: session-ended\ndata: ' + JSON.stringify({ reason }) + '\n\n');
          close();
        }
      })();
      activeTicks.add(operation);
      try {
        await operation;
      } finally {
        busy = false;
        activeTicks.delete(operation);
      }
    };

    interval = setInterval(() => {
      void tick().catch(error => console.error('SSE refresh failed:', error));
    }, 2000);
    interval.unref();
    void tick().catch(error => console.error('SSE refresh failed:', error));
  };

  return Object.assign(handler, {
    async closeAll() {
      shuttingDown = true;
      for (const close of [...clients]) close();
      await Promise.allSettled([...activeTicks]);
    },
  });
}
