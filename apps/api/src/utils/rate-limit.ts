import type { NextFunction, Request, Response } from 'express';

/** Small in-memory fixed-window limiter (per API instance). Enough to blunt password guessing and chat spam. */
export function rateLimit(opts: { windowMs: number; max: number; key?: (req: Request) => string; message?: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const timer = setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k); }, Math.max(30_000, opts.windowMs));
  timer.unref();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = (opts.key ? opts.key(req) : req.ip) || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) { hits.set(key, { count: 1, resetAt: now + opts.windowMs }); return next(); }
    entry.count++;
    if (entry.count > opts.max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: opts.message || 'Too many requests. Please wait a little and try again.' });
    }
    next();
  };
}
