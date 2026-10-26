/**
 * LexTip - Extension Configuration
 */

const CONFIG = {
  // Backend URL for translation API
  BACKEND_URL: 'https://lextip.onrender.com',

  // Request timeout in milliseconds
  LAYER3_TIMEOUT_MS: 10000,

  // Maximum retry attempts for transient network failures
  LAYER3_MAX_RETRIES: 2,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
if (typeof globalThis !== 'undefined') {
  globalThis.CONFIG = CONFIG;
}
