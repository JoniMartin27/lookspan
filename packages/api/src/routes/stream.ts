import { type LookspanEvent, subscribe } from '@lookspan/events';
import { Router } from 'express';

export function createStreamRouter(): Router {
  const router = Router();

  router.get('/', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    let closed = false;
    // Idempotent: an abrupt disconnect can fire several of close/error at once,
    // and a failed write triggers it too. Without this guard the listener and
    // heartbeat timer leak for every connection that doesn't end cleanly.
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    };

    // Writing to a half-closed socket throws; treat any write failure as a
    // disconnect and tear down rather than letting the error propagate.
    const write = (chunk: string) => {
      if (closed || res.writableEnded) return;
      try {
        res.write(chunk);
      } catch {
        cleanup();
      }
    };

    const send = (event: LookspanEvent) => {
      write(`event: ${event.type}\n`);
      write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const heartbeat = setInterval(() => write(': heartbeat\n\n'), 15000);
    const unsubscribe = subscribe(send);

    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  });

  return router;
}
