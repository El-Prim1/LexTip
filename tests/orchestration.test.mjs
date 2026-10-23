import assert from 'assert';

// 1. Mock environment
const mockCache = {};
global.chrome = {
  storage: {
    local: {
      async get(key) {
        return { [key]: mockCache[key] ? JSON.parse(JSON.stringify(mockCache[key])) : {} };
      },
      async set(items) {
        Object.assign(mockCache, JSON.parse(JSON.stringify(items)));
      },
    },
  },
  runtime: {
    onInstalled: { addListener: () => {} },
    onMessage: { addListener: () => {} },
  },
};

global.CONFIG = {
  BACKEND_URL: 'http://localhost:3000',
  LAYER3_TIMEOUT_MS: 5000,
  LAYER3_MAX_RETRIES: 1,
};

// Mock lookupWord for dictionary (Layer 1)
global.lookupWord = async (word) => {
  if (word.toLowerCase() === 'apple') {
    return {
      found: true,
      translation: 'яблоко',
      lemma: 'apple',
      selectedWord: word,
      partOfSpeech: 'noun',
      analysis: null,
    };
  }
  return { found: false, lemma: word, selectedWord: word };
};

// Load translation cache (Layer 2)
await import('../extension/background/translation-cache.js');
const { getCachedTranslation, setCachedTranslation, CACHE_STORAGE_KEY } = globalThis.TranslationCache;
global.getCachedTranslation = getCachedTranslation;
global.setCachedTranslation = setCachedTranslation;

// Mock fetch for Backend API (Layer 3)
let backendCalledWith = null;
global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body);
  backendCalledWith = body.text;
  if (body.text === 'banana') {
    return {
      ok: true,
      async json() {
        return { translatedText: 'банан' };
      },
    };
  }
  return {
    ok: false,
    status: 500,
    async json() {
      return { error: 'Translation failed' };
    },
  };
};

console.log('[Test Orchestration] Testing 3-tier translation pipeline...');

// Define the handler to test identical logic
async function handleTranslationTest(text) {
  const startTime = performance.now();
  const trimmed = text.trim();

  // Layer 1
  const dictResult = await lookupWord(trimmed);
  if (dictResult && dictResult.found) {
    return {
      translation: dictResult.translation,
      lemma: dictResult.lemma,
      selectedWord: dictResult.selectedWord,
      layer: 1,
    };
  }

  // Layer 2
  const cached = await getCachedTranslation(trimmed);
  if (cached && cached.translatedText) {
    return {
      translation: cached.translatedText,
      lemma: trimmed,
      selectedWord: trimmed,
      layer: 2,
    };
  }

  // Layer 3
  const res = await fetch(`${CONFIG.BACKEND_URL}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: trimmed }),
  });

  if (res.ok) {
    const json = await res.json();
    if (json && json.translatedText) {
      await setCachedTranslation(trimmed, {
        translatedText: json.translatedText,
        layer: 3,
      });
      return {
        translation: json.translatedText,
        lemma: trimmed,
        selectedWord: trimmed,
        layer: 3,
      };
    }
  }

  return { translation: 'Translation not found', layer: 0 };
}

async function run() {
  // 1. Layer 1 test: should resolve via dictionary without calling backend
  backendCalledWith = null;
  const res1 = await handleTranslationTest('apple');
  assert.strictEqual(res1.layer, 1);
  assert.strictEqual(res1.translation, 'яблоко');
  assert.strictEqual(backendCalledWith, null, 'Backend must not be called for Layer 1 hits');

  // 2. Layer 3 test: "banana" not in dict -> calls backend, writes to Layer 2 cache
  backendCalledWith = null;
  const res2 = await handleTranslationTest('banana');
  assert.strictEqual(res2.layer, 3);
  assert.strictEqual(res2.translation, 'банан');
  assert.strictEqual(backendCalledWith, 'banana');

  // Verify it was stored in Layer 2 cache
  const cachedItem = await getCachedTranslation('banana');
  assert.ok(cachedItem, 'Banana must be cached in Layer 2');
  assert.strictEqual(cachedItem.translatedText, 'банан');

  // 3. Layer 2 test: next lookup for "banana" must hit cache and NOT call backend
  backendCalledWith = null;
  const res3 = await handleTranslationTest('banana');
  assert.strictEqual(res3.layer, 2, 'Must hit Layer 2 cache');
  assert.strictEqual(res3.translation, 'банан');
  assert.strictEqual(backendCalledWith, null, 'Backend must NOT be called on Layer 2 cache hit');

  // 4. Missing test: unknown word that fails backend -> layer 0 fallback
  const res4 = await handleTranslationTest('unknown_xyz');
  assert.strictEqual(res4.layer, 0);
  assert.strictEqual(res4.translation, 'Translation not found');

  console.log('[Test Orchestration] All tiering tests passed successfully!');
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

