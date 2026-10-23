import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const windowMs = 60 * 1000; // 1 minute
const maxRequests = 60; // 60 requests per window
const ipHits = new Map<string, RateLimitRecord>();

// Cleanup expired entries periodically
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipHits.entries()) {
    if (now > record.resetTime) {
      ipHits.delete(ip);
    }
  }
}, windowMs);
cleanupTimer.unref?.();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  const record = ipHits.get(clientIp);

  if (!record || now > record.resetTime) {
    ipHits.set(clientIp, { count: 1, resetTime: now + windowMs });
    next();
    return;
  }

  if (record.count >= maxRequests) {
    res.status(429).json({ error: 'Too many requests, please try again later.' });
    return;
  }

  record.count += 1;
  next();
}
