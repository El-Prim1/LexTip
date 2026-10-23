/**
 * LinguaLens - Background Service Worker (Manifest v3)
 * Orchestrates 3 translation layers:
 * Layer 1: Local Dictionary + NLP Lemmatization
 * Layer 2: chrome.storage.local cache (15-day TTL, 100 entries)
 * Layer 3: Backend API (google-translate-api)
 */

// Import required background scripts
importScripts('nlp-runtime.js', 'dictionary-service.js', 'config.js', 'translation-cache.js');

// Ephemeral deduplication map for in-flight translation requests
const inFlightRequests = new Map();

// Installation Lifecycle Listener
chrome.runtime.onInstalled.addListener(() => {
  console.log('[LinguaLens] Extension installed / updated.');
  // Pre-load dictionary into memory
  loadDictionary();
  // Cleanup expired entries from Layer 2 cache
  if (typeof cleanupExpiredEntries === 'function') {
    cleanupExpiredEntries();
  }
});

/**
 * Sequential translation pipeline executing Layer 1 -> Layer 2 -> Layer 3.
 */
async function handleTranslation(text) {
  const startTime = performance.now();
  const trimmed = text.trim();

  // Layer 1: Local Dictionary with lemmatization
  try {
    const dictResult = await lookupWord(trimmed);
    if (dictResult && dictResult.found) {
      const latencyMs = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));
      return {
        translation: dictResult.translation,
        lemma: dictResult.lemma,
        selectedWord: dictResult.selectedWord,
        partOfSpeech: dictResult.partOfSpeech,
        analysis: dictResult.analysis,
        layer: 1,
        latencyMs,
      };
    }
  } catch (err) {
    console.warn('[LinguaLens] Layer 1 lookup error:', err);
  }

  // Layer 2: Browser Storage Cache (chrome.storage.local)
  try {
    const cached = await getCachedTranslation(trimmed);
    if (cached && cached.translatedText) {
      const latencyMs = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));
      return {
        translation: cached.translatedText,
        lemma: trimmed,
        selectedWord: trimmed,
        partOfSpeech: null,
        analysis: null,
        layer: 2,
        latencyMs,
      };
    }
  } catch (err) {
    console.warn('[LinguaLens] Layer 2 cache lookup error:', err);
  }

  // Layer 3: Backend API Request
  try {
    const backendUrl = (typeof CONFIG !== 'undefined' && CONFIG.BACKEND_URL) || 'http://localhost:3000';
    const timeoutMs = (typeof CONFIG !== 'undefined' && CONFIG.LAYER3_TIMEOUT_MS) || 10000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${backendUrl}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const json = await response.json();
      if (json && json.translatedText) {
        const latencyMs = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));

        // Save successfully translated text into Layer 2 cache
        await setCachedTranslation(trimmed, {
          translatedText: json.translatedText,
          layer: 3,
        });

        return {
          translation: json.translatedText,
          lemma: trimmed,
          selectedWord: trimmed,
          partOfSpeech: null,
          analysis: null,
          layer: 3,
          latencyMs,
        };
      }
    }
  } catch (err) {
    console.warn('[LinguaLens] Layer 3 backend translation error:', err);
  }

  // Fallback when all layers fail to find a translation
  const fallbackLatency = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));
  return {
    translation: 'Translation not found',
    lemma: trimmed,
    selectedWord: trimmed,
    partOfSpeech: null,
    analysis: null,
    layer: 0,
    latencyMs: fallbackLatency,
  };
}

// Runtime Message Router (Content Script -> Service Worker)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE_REQUEST') {
    const { text } = message.payload || {};

    if (!text || typeof text !== 'string') {
      sendResponse({
        success: true,
        data: {
          translation: 'Translation not found',
          lemma: '',
          selectedWord: '',
          partOfSpeech: null,
          analysis: null,
          layer: 1,
          latencyMs: 0,
        },
      });
      return false;
    }

    const requestKey = text.trim().toLowerCase();

    // Check for in-flight pending request
    if (inFlightRequests.has(requestKey)) {
      inFlightRequests.get(requestKey).then((data) => {
        sendResponse({ success: true, data });
      }).catch((err) => {
        sendResponse({
          success: false,
          error: err.message,
          data: {
            translation: 'Translation not found',
            lemma: text,
            selectedWord: text,
            partOfSpeech: null,
            analysis: null,
            layer: 0,
            latencyMs: 0,
          },
        });
      });
      return true;
    }

    const translationPromise = handleTranslation(text);
    inFlightRequests.set(requestKey, translationPromise);

    translationPromise
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        console.error('[LinguaLens] Translation pipeline failed:', error);
        sendResponse({
          success: true,
          data: {
            translation: 'Translation not found',
            lemma: text,
            selectedWord: text,
            partOfSpeech: null,
            analysis: null,
            layer: 0,
            latencyMs: 0,
          },
        });
      })
      .finally(() => {
        inFlightRequests.delete(requestKey);
      });

    return true; // Keep message channel open for async response
  }

  if (message.type === 'AI_EXPLAIN_REQUEST') {
    sendResponse({
      success: true,
      data: {
        explanation: 'Deep linguistic analysis will be handled via AI API.',
      },
    });
    return true;
  }

  return false;
});
