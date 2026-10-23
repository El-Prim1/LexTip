/**
 * Backend Configuration
 * Environment-specific settings for the translation proxy server
 */

const config = {
  // Server configuration
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Google Cloud Translation API
  googleTranslateApiKey: process.env.GOOGLE_TRANSLATE_API_KEY || '',
  googleTranslateApiUrl: 'https://translation.googleapis.com/language/translate/v2',

  // Rate limiting
  rateLimitPerIp: parseInt(process.env.RATE_LIMIT_PER_IP || '60', 10), // requests per minute
  rateLimitWindowMs: 60 * 1000, // 1 minute window
  globalDailyCeiling: parseInt(process.env.GLOBAL_DAILY_CEILING || '10000', 10), // requests per day

  // Request validation
  maxInputLength: 500, // maximum characters per translation request
  requestTimeoutMs: 10000, // 10 seconds

  // CORS configuration
  allowedOrigins: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['*'], // wildcard for MVP (documented limitation)

  // Retry configuration
  maxRetries: 3,
  retryBaseDelayMs: 500,
};

// Validation
if (!config.googleTranslateApiKey) {
  console.warn('[Config] WARNING: GOOGLE_TRANSLATE_API_KEY not set. Translation requests will fail.');
}

if (config.nodeEnv === 'production' && !config.googleTranslateApiKey) {
  throw new Error('GOOGLE_TRANSLATE_API_KEY is required in production');
}

export default config;
