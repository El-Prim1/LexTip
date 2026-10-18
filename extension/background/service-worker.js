/**
 * LinguaLens - Background Service Worker (Manifest v3)
 * Phase 2: Layer 1 Local Dictionary & IndexedDB Engine
 * Features:
 * - IndexedDB initialization ('LinguaLensDB', store: 'dictionary')
 * - Multi-entry indexing on 'forms' and compound index on ['sourceLang', 'lemma']
 * - Auto-seeding on chrome.runtime.onInstalled from 'dictionaries/custom-seed.json'
 * - Sub-millisecond indexed lookup with performance.now() latency tracking
 */

const DB_CONFIG = {
  NAME: 'LinguaLensDB',
  VERSION: 1,
  STORE: 'dictionary',
};

let dbInstance = null;

/**
 * Open and initialize IndexedDB database
 */
function openDatabase() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DB_CONFIG.STORE)) {
        const store = db.createObjectStore(DB_CONFIG.STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });

        // Exact lemma index
        store.createIndex('by_lemma', 'lemma', { unique: false });

        // Compound index for language-scoped lookups
        store.createIndex('by_source_lemma', ['sourceLang', 'lemma'], { unique: false });

        // Multi-entry index: indexes every string inside entry.forms array individually
        store.createIndex('by_forms', 'forms', { multiEntry: true, unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[LinguaLens] IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Seed IndexedDB from custom-seed.json on extension installation
 */
async function seedDatabaseFromCustomSeed() {
  try {
    const url = chrome.runtime.getURL('dictionaries/custom-seed.json');
    const response = await fetch(url);
    const seedData = await response.json();

    const db = await openDatabase();
    const tx = db.transaction(DB_CONFIG.STORE, 'readwrite');
    const store = tx.objectStore(DB_CONFIG.STORE);

    // Check existing count to avoid duplicate re-population
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      if (countRequest.result === 0) {
        for (const item of seedData) {
          store.put(item);
        }
        console.log(`[LinguaLens] IndexedDB successfully seeded with ${seedData.length} lemma entries.`);
      } else {
        console.log(`[LinguaLens] IndexedDB already initialized with ${countRequest.result} entries.`);
      }
    };

    tx.onerror = (err) => {
      console.error('[LinguaLens] Seeding transaction error:', err);
    };
  } catch (err) {
    console.error('[LinguaLens] Failed to load custom-seed.json:', err);
  }
}

/**
 * Normalizes input text by stripping leading/trailing punctuation and whitespace
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/^[\s"'`“‘«„\[\(\{<>\.,;:!?\-_—–#*~]+/, '')
    .replace(/[\s"'`”’»“\]\)\}<>\.,;:!?\-_—–#*~]+$/, '');
}

/**
 * Generates morphological lemma candidates for English words
 * Handles regular suffixes: -s, -es, -ies, -ed, -ied, -ing
 */
function generateLemmaCandidates(word) {
  const candidates = [];
  if (!word || word.length < 3) return candidates;

  // 1. Plurals & 3rd-person singular (-ies, -es, -s)
  if (word.endsWith('ies') && word.length > 4) {
    candidates.push(word.slice(0, -3) + 'y'); // categories -> category
  } else if (word.endsWith('es') && word.length > 4) {
    candidates.push(word.slice(0, -2)); // boxes -> box
    candidates.push(word.slice(0, -1)); // houses -> house (silent e restoration)
  } else if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
    candidates.push(word.slice(0, -1)); // ensures -> ensure, handles -> handle
  }

  // 2. Past tense & past participle (-ied, -ed)
  if (word.endsWith('ied') && word.length > 4) {
    candidates.push(word.slice(0, -3) + 'y'); // modified -> modify
  } else if (word.endsWith('ed') && word.length > 4) {
    candidates.push(word.slice(0, -2)); // debounced -> debounce
    candidates.push(word.slice(0, -1)); // isolated -> isolate, handled -> handle (silent e restoration)
    if (word.length > 5 && word[word.length - 3] === word[word.length - 4] && word[word.length - 3] !== 'l') {
      candidates.push(word.slice(0, -3)); // stopped -> stop
    }
  }

  // 3. Present participle & gerund (-ing)
  if (word.endsWith('ing') && word.length > 4) {
    candidates.push(word.slice(0, -3)); // viewing -> view
    candidates.push(word.slice(0, -3) + 'e'); // debouncing -> debounce, managing -> manage (silent e restoration)
    if (word.length > 5 && word[word.length - 4] === word[word.length - 5] && word[word.length - 4] !== 'l') {
      candidates.push(word.slice(0, -4)); // running -> run, flipping -> flip
    }
  }

  return Array.from(new Set(candidates.filter((c) => c && c !== word)));
}

/**
 * Perform high-performance indexed lookup (<2ms)
 * Checks primary lemma, multiEntry forms index, and suffix lemmatizer candidates
 */
async function lookupLocalWord(queryWord, sourceLang = 'en') {
  const cleanWord = normalizeText(queryWord);
  if (!cleanWord) {
    return { match: null, latencyMs: 0, normalizedWord: '' };
  }

  const startTime = performance.now();

  try {
    const db = await openDatabase();
    const tx = db.transaction(DB_CONFIG.STORE, 'readonly');
    const store = tx.objectStore(DB_CONFIG.STORE);
    const lemmaIndex = store.index('by_lemma');
    const formsIndex = store.index('by_forms');

    // 1. Direct Lemma lookup
    let match = await new Promise((resolve) => {
      const req = lemmaIndex.get(cleanWord);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    // 2. Inflected Forms lookup via multiEntry index
    if (!match) {
      match = await new Promise((resolve) => {
        const req = formsIndex.get(cleanWord);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    }

    if (match) {
      const latencyMs = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));
      return { match, latencyMs, normalizedWord: cleanWord, resolvedLemma: match.lemma };
    }

    // 3. Algorithmic Suffix Lemmatizer fallback
    const candidates = generateLemmaCandidates(cleanWord);
    for (const candidate of candidates) {
      const candidateMatch = await new Promise((resolve) => {
        const req = lemmaIndex.get(candidate);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });

      if (candidateMatch) {
        const latencyMs = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));
        return { match: candidateMatch, latencyMs, normalizedWord: cleanWord, resolvedLemma: candidateMatch.lemma };
      }
    }

    const latencyMs = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));
    return { match: null, latencyMs, normalizedWord: cleanWord, resolvedLemma: candidates[0] || cleanWord };
  } catch (err) {
    console.warn('[LinguaLens] IndexedDB lookup failure:', err);
    return { match: null, latencyMs: 0, normalizedWord: cleanWord, resolvedLemma: cleanWord };
  }
}

// Installation Lifecycle Listener
chrome.runtime.onInstalled.addListener(() => {
  console.log('[LinguaLens] Extension installed / updated.');
  seedDatabaseFromCustomSeed();
});

// Runtime Message Router (Content Script -> Service Worker)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE_REQUEST') {
    const { text, targetLang } = message.payload;

    lookupLocalWord(text, 'en').then(({ match, latencyMs, resolvedLemma }) => {
      if (match) {
        // Layer 1 Instant Local Hit with base form (lemma) and selected word
        sendResponse({
          success: true,
          data: {
            translation: match.definitions.join(', '),
            lemma: match.lemma || resolvedLemma || text,
            selectedWord: text,
            pos: match.pos,
            layer: 1,
            latencyMs: latencyMs,
          },
        });
      } else {
        // Layer 1 Miss: Exact match not found
        sendResponse({
          success: true,
          data: {
            translation: 'Translation not found',
            lemma: resolvedLemma || text,
            selectedWord: text,
            pos: 'unknown',
            layer: 1,
            latencyMs: latencyMs,
          },
        });
      }
    });

    // Keep message port open for async response
    return true;
  }

  if (message.type === 'AI_EXPLAIN_REQUEST') {
    sendResponse({
      success: true,
      data: {
        explanation: 'Deep linguistic analysis (Layer 3) will be handled via Gemini 2.5 Flash API.',
      },
    });
    return true;
  }

  return false;
});
