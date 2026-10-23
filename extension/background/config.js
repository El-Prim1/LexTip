/**
 * LinguaLens - Extension Configuration
 * Default local development configuration for unpacked extension
 */

const CONFIG = {
  // Backend URL for translation API
  BACKEND_URL: 'http://localhost:3000',

  // Cache configuration
  CACHE_TTL_DAYS: 15,
  CACHE_MAX_ENTRIES: 100,

  // Target language (fixed to Russian)
  TARGET_LANG: 'ru',

  // Layer 2 request timeout (ms)
  LAYER2_TIMEOUT_MS: 10000,

  // Layer 2 retry configuration
  LAYER2_MAX_RETRIES: 3,
  LAYER2_RETRY_BASE_DELAY_MS: 500,
};

