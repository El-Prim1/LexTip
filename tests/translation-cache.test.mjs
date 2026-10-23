import assert from 'assert';

await import('../extension/background/translation-cache.js');

const {
  normalizeCacheKey,
  isCacheEntryExpired,
  getCachedTranslation,
  setCachedTranslation,
  cleanupExpiredEntries,
  CACHE_MAX_ENTRIES,
  CACHE_STORAGE_KEY,
} = globalThis.TranslationCache;

console.log('[Test Cache] Starting Layer 2 cache unit tests...');

// 1. Key normalization
assert.strictEqual(normalizeCacheKey('  Hello   World  '), 'hello world');
assert.strictEqual(normalizeCacheKey(''), '');
assert.strictEqual(normalizeCacheKey(null), '');

// Mock chrome.storage.local in-memory store
const mockStorage = {};
global.chrome = {
  storage: {
    local: {
      async get(key) {
        return { [key]: mockStorage[key] ? JSON.parse(JSON.stringify(mockStorage[key])) : {} };
      },
      async set(items) {
        Object.assign(mockStorage, JSON.parse(JSON.stringify(items)));
      },
    },
  },
};

async function testStorage() {
  // 2. Set and Get
  await setCachedTranslation('good morning', { translatedText: 'доброе утро' });
  const entry = await getCachedTranslation('  Good   Morning  ');
  assert.ok(entry, 'Cache entry should be retrieved');
  assert.strictEqual(entry.translatedText, 'доброе утро');

  // 3. TTL Expiration
  const oldEntry = {
    translatedText: 'старый',
    timestamp: Date.now() - (16 * 24 * 60 * 60 * 1000), // 16 days ago
  };
  mockStorage[CACHE_STORAGE_KEY]['old key'] = oldEntry;
  const expiredResult = await getCachedTranslation('old key');
  assert.strictEqual(expiredResult, null, 'Expired entry should return null');

  // 4. Max Entries (100) Eviction
  // Fill up to 100 entries
  for (let i = 0; i < CACHE_MAX_ENTRIES; i++) {
    await setCachedTranslation(`word_${i}`, {
      translatedText: `слово_${i}`,
      timestamp: Date.now() + i,
    });
  }
  const countBefore = Object.keys(mockStorage[CACHE_STORAGE_KEY]).length;
  assert.strictEqual(countBefore, CACHE_MAX_ENTRIES, 'Should have exactly 100 items');

  // Add 101st entry -> should evict the oldest
  await setCachedTranslation('word_new', { translatedText: 'новое слово' });
  const countAfter = Object.keys(mockStorage[CACHE_STORAGE_KEY]).length;
  assert.strictEqual(countAfter, CACHE_MAX_ENTRIES, 'Should still have 100 items after eviction');
  assert.strictEqual(mockStorage[CACHE_STORAGE_KEY]['word_0'], undefined, 'Oldest entry should be evicted');
  assert.ok(mockStorage[CACHE_STORAGE_KEY]['word_new'], 'Newest entry should exist');

  // 5. Error tolerance when chrome.storage.local throws
  global.chrome.storage.local.get = async () => { throw new Error('Simulated storage failure'); };
  const safeResult = await getCachedTranslation('good morning');
  assert.strictEqual(safeResult, null, 'Should return null without throwing on storage failure');

  console.log('[Test Cache] All Layer 2 cache unit tests passed successfully.');
}

testStorage().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('[Test Cache] Test failed:', err);
  process.exit(1);
});
