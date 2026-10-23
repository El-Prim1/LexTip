/**
 * CORS Middleware
 * Configures Cross-Origin Resource Sharing for the translation API
 * Note: MVP uses wildcard origin; production should implement proper authentication
 */

import { Request, Response, NextFunction } from 'express';
import config from '../config/index.js';

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  // For MVP: allow wildcard origin (documented security limitation)
  // In production, this should be replaced with proper authentication
  if (config.allowedOrigins.includes('*')) {
    res.header('Access-Control-Allow-Origin', '*');
  } else if (origin && config.allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (origin) {
    // Origin not in allowlist - but we still allow for MVP with rate limiting
    // Production should reject or require authentication
    res.header('Access-Control-Allow-Origin', '*');
  }

  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
}
