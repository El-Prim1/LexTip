import express from 'express';
import { rateLimiter } from './middleware/rate-limit';
import { translateRouter } from './routes/translate';

const app = express();
const PORT = process.env.PORT || 3000;

// Basic CORS middleware
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (_req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: '10kb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Translation API routes protected by rate limiter
app.use('/api', rateLimiter, translateRouter);

const server = app.listen(PORT, () => {
  console.log(`[TranslationServer] Server listening on port ${PORT}`);
});

export { app, server };
