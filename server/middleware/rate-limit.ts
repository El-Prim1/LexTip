/**
 * Rate Limiting Middleware
 * Implements per-IP rate limiting and global daily request ceiling
 * Note: In-memory counters reset on server restart (documented limitation)
 */

import { Request, Response, NextFunction } from 'express';
import config from '../config/index.js';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface GlobalCounter {
  count: number;
  resetDate: string; // YYYY-MM-DD
}

// In-memory storage (documented limitation: resets on restart)
const ipRateLimits = new Map<string, RateLimitEntry>();
let globalCounter: GlobalCounter = {
  count: 0,
  resetDate: getCurrentDate(),
};

function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

function resetGlobalCounterIfNeeded(): void {
  const today = getCurrentDate();
  if (globalCounter.resetDate !== today) {
    globalCounter = {
      count: 0,
      resetDate: today,
    };
    console.log('[RateLimit] Global daily counter reset');
  }
}

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || (req.headers['x-real-ip'] as string)
    || req.socket.remoteAddress
    || 'unknown';
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const now = Date.now();

  // Reset global counter if day has changed
  resetGlobalCounterIfNeeded();

  // Check global daily ceiling
  if (globalCounter.count >= config.globalDailyCeiling) {
    console.warn(`[RateLimit] Global daily ceiling exceeded: ${globalCounter.count}/${config.globalDailyCeiling}`);
    res.status(429).json({
      error: 'Global daily request limit exceeded',
      retryAfter: 86400, // 24 hours in seconds
    });
    return;
  }

  // Check per-IP rate limit
  const entry = ipRateLimits.get(ip);

  if (!entry || now > entry.resetTime) {
    // Create new entry or reset expired entry
    ipRateLimits.set(ip, {
      count: 1,
      resetTime: now + config.rateLimitWindowMs,
    });
  } else {
    // Increment counter
    entry.count++;

    if (entry.count > config.rateLimitPerIp) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      console.warn(`[RateLimit] IP ${ip} exceeded rate limit: ${entry.count}/${config.rateLimitPerIp}`);
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter,
      });
      return;
    }
  }

  // Increment global counter
  globalCounter.count++;

  // Add rate limit headers
  res.header('X-RateLimit-Limit', config.rateLimitPerIp.toString());
  res.header('X-RateLimit-Remaining', Math.max(0, config.rateLimitPerIp - (entry?.count || 0)).toString());
  res.header('X-RateLimit-Reset', Math.ceil((entry?.resetTime || now) / 1000).toString());
  res.header('X-Global-Daily-Limit', config.globalDailyCeiling.toString());
  res.header('X-Global-Daily-Remaining', (config.globalDailyCeiling - globalCounter.count).toString());

  next();
}

// Cleanup function to remove old entries (call periodically)
export function cleanupRateLimits(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [ip, entry] of ipRateLimits.entries()) {
    if (now > entry.resetTime) {
      ipRateLimits.delete(ip);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[RateLimit] Cleaned up ${cleaned} expired IP entries`);
  }
}

// Start cleanup interval (every 5 minutes)
if (config.nodeEnv !== 'test') {
  setInterval(cleanupRateLimits, 5 * 60 * 1000);
}
