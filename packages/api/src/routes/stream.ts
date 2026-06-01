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

    const send = (event: LookspanEvent) => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    const unsubscribe = subscribe(send);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
      res.end();
    });
  });

  return router;
}
