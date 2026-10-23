/**
 * Backend Server Entry Point
 * Express server for the translation proxy API
 */

import express from 'express';
import config from './config/index.js';
import corsMiddleware from './middleware/cors.js';
import rateLimitMiddleware from './middleware/rate-limit.js';
import validateTranslationRequest from './middleware/validation.js';
import translateRoutes from './routes/translate.js';

const app = express();

// Security middleware
app.disable('x-powered-by');

// Body parsing
app.use(express.json({ limit: '1kb' })); // Limit body size to prevent abuse

// CORS middleware
app.use(corsMiddleware);

// Rate limiting middleware
app.use(rateLimitMiddleware);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    nodeEnv: config.nodeEnv,
  });
});

// Translation routes
app.use('/api', validateTranslationRequest, translateRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
  });
});

// Start server
const server = app.listen(config.port, () => {
  console.log(`[Server] Translation proxy server running on port ${config.port}`);
  console.log(`[Server] Environment: ${config.nodeEnv}`);
  console.log(`[Server] Rate limit: ${config.rateLimitPerIp} requests/minute per IP`);
  console.log(`[Server] Global daily ceiling: ${config.globalDailyCeiling} requests/day`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

export default app;
