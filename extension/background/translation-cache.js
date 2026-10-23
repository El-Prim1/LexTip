/**
 * LinguaLens - Layer 2 Browser Storage Cache
 * Caches translated text in chrome.storage.local with 15-day TTL and 100-entry ceiling.
 */

const CACHE_TTL_DAYS = 15;
const CACHE_MAX_ENTRIES = 100;
const CACHE_STORAGE_KEY = 'translation_cache';

/**
 * Normalizes input text for deterministic cache lookup.
 */
function normalizeCacheKey(text) {
  if (!text || typeof text !== 'string') return '';
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Checks whether a cache entry has exceeded the 15-day TTL.
 */
function isCacheEntryExpired(entry) {
  if (!entry || !entry.timestamp) return true;
  const ttlMs = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  return (Date.now() - entry.timestamp) > ttlMs;
}

/**
 * Retrieves a cached translation from chrome.storage.local.
 * Fails silently returning null on any storage error.
 */
async function getCachedTranslation(text) {
  try {
    const key = normalizeCacheKey(text);
    if (!key) return null;

    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return null;
    }

    const result = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    const cache = result[CACHE_STORAGE_KEY] || {};
    const entry = cache[key];

    if (!entry) return null;

    if (isCacheEntryExpired(entry)) {
      await removeCachedTranslation(text);
      return null;
    }

    return entry;
  } catch (error) {
    console.warn('[LinguaLens Cache] Error reading cache:', error);
    return null;
  }
}

/**
 * Stores a translation entry into chrome.storage.local.
 * Enforces maximum 100 entries by evicting the oldest entry.
 * Fails silently without blocking on storage error.
 */
async function setCachedTranslation(text, data) {
  try {
    const key = normalizeCacheKey(text);
    if (!key) return;

    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }

    const result = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    const cache = result[CACHE_STORAGE_KEY] || {};

    const entries = Object.entries(cache);
    if (entries.length >= CACHE_MAX_ENTRIES && !cache[key]) {
      let oldestKey = null;
      let oldestTimestamp = Infinity;

      for (const [k, item] of entries) {
        const ts = item && item.timestamp ? item.timestamp : 0;
        if (ts < oldestTimestamp) {
          oldestTimestamp = ts;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        delete cache[oldestKey];
      }
    }

    cache[key] = {
      ...data,
      timestamp: Date.now(),
    };

    await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: cache });
  } catch (error) {
    console.warn('[LinguaLens Cache] Error saving to cache:', error);
  }
}

/**
 * Removes a specific translation entry from cache.
 */
async function removeCachedTranslation(text) {
  try {
    const key = normalizeCacheKey(text);
    if (!key) return;

    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }

    const result = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    const cache = result[CACHE_STORAGE_KEY] || {};

    if (cache[key]) {
      delete cache[key];
      await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: cache });
    }
  } catch (error) {
    console.warn('[LinguaLens Cache] Error removing cache entry:', error);
  }
}

/**
 * Scans cache and removes all expired entries.
 */
async function cleanupExpiredEntries() {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }

    const result = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    const cache = result[CACHE_STORAGE_KEY] || {};

    let cleanedCount = 0;
    for (const [key, entry] of Object.entries(cache)) {
      if (isCacheEntryExpired(entry)) {
        delete cache[key];
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: cache });
      console.log(`[LinguaLens Cache] Pruned ${cleanedCount} expired entries.`);
    }
  } catch (error) {
    console.warn('[LinguaLens Cache] Cleanup error:', error);
  }
}

// Export for Node tests and global execution environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    normalizeCacheKey,
    isCacheEntryExpired,
    getCachedTranslation,
    setCachedTranslation,
    removeCachedTranslation,
    cleanupExpiredEntries,
    CACHE_TTL_DAYS,
    CACHE_MAX_ENTRIES,
    CACHE_STORAGE_KEY,
  };
}
if (typeof globalThis !== 'undefined') {
  globalThis.TranslationCache = {
    normalizeCacheKey,
    isCacheEntryExpired,
    getCachedTranslation,
    setCachedTranslation,
    removeCachedTranslation,
    cleanupExpiredEntries,
    CACHE_TTL_DAYS,
    CACHE_MAX_ENTRIES,
    CACHE_STORAGE_KEY,
  };
}
