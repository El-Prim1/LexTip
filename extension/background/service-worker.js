/**
 * LinguaLens - Background Service Worker (Manifest v3)
 * Integrates English-Russian dictionary with lemmatization pipeline
 * Layer 2: Cloud Translation API with local caching
 */

// Import dictionary service
importScripts('nlp-runtime.js', 'dictionary-service.js', 'config.js', 'translation-cache.js');

// In-flight request deduplication (ephemeral - resets on service worker restart)
const pendingRequests = new Map();

// Installation Lifecycle Listener
chrome.runtime.onInstalled.addListener(() => {
  console.log('[LinguaLens] Extension installed / updated.');
  // Pre-load dictionary on installation
  loadDictionary();
  // Cleanup expired cache entries
  cleanupExpiredEntries();
});

/**
 * Layer 2: Fetch translation from backend API
 */
async function fetchLayer2Translation(text) {
  const url = `${CONFIG.BACKEND_URL}/api/translate`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.LAYER2_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        targetLang: CONFIG.TARGET_LANG,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error('Invalid response from backend');
    }

    return result.data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error('Translation request timed out');
    }

    throw error;
  }
}

/**
 * Retry logic with exponential backoff
 */
async function fetchWithRetry(text, attempt = 0) {
  try {
    return await fetchLayer2Translation(text);
  } catch (error) {
    const isTransient = isTransientError(error);
    const shouldRetry = isTransient && attempt < CONFIG.LAYER2_MAX_RETRIES;

    if (shouldRetry) {
      const delay = CONFIG.LAYER2_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[Layer2] Retry attempt ${attempt + 1}/${CONFIG.LAYER2_MAX_RETRIES} after ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchWithRetry(text, attempt + 1);
    }

    throw error;
  }
}

/**
 * Determine if error is transient (should retry)
 */
function isTransientError(error) {
  if (!error || typeof error.message !== 'string') return false;
  const message = error.message.toLowerCase();

  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('503') ||
    message.includes('service unavailable')
  );
}

/**
 * Main translation handler with tiering logic
 */
async function handleTranslationRequest(text) {
  const startTime = performance.now();

  // Check offline status
  const isOnline = navigator.onLine;

  // Step 1: Layer 1 - Dictionary lookup
  const dictionaryResult = await lookupWord(text);

  if (dictionaryResult.found) {
    const latencyMs = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));
    return {
      translation: dictionaryResult.translation,
      lemma: dictionaryResult.lemma,
      selectedWord: dictionaryResult.selectedWord,
      partOfSpeech: dictionaryResult.partOfSpeech,
      analysis: dictionaryResult.analysis,
      layer: 1,
      latencyMs: latencyMs,
    };
  }

  // Step 2: Cache lookup
  const cachedResult = await getCachedTranslation(text);
  if (cachedResult) {
    const latencyMs = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));
    console.log('[LinguaLens] Cache hit');
    return {
      translation: cachedResult.translation,
      lemma: cachedResult.lemma || text,
      selectedWord: cachedResult.selectedWord || text,
      partOfSpeech: cachedResult.partOfSpeech || null,
      analysis: cachedResult.analysis || null,
      sourceLang: cachedResult.sourceLang,
      layer: cachedResult.layer || 2,
      latencyMs: latencyMs,
    };
  }

  // Step 3: Layer 2 - Backend API (if online)
  if (!isOnline) {
    return {
      translation: 'Offline — only dictionary translations are available',
      lemma: dictionaryResult.lemma || text,
      selectedWord: dictionaryResult.selectedWord || text,
      partOfSpeech: dictionaryResult.partOfSpeech || null,
      analysis: dictionaryResult.analysis || null,
      layer: 1,
      latencyMs: 0,
    };
  }

  try {
    const layer2Result = await fetchWithRetry(text);
    const latencyMs = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));

    // Cache the result
    await setCachedTranslation(text, {
      translation: layer2Result.translation,
      sourceLang: layer2Result.sourceLang,
      layer: 2,
    });

    return {
      translation: layer2Result.translation,
      lemma: dictionaryResult.lemma || text,
      selectedWord: dictionaryResult.selectedWord || text,
      partOfSpeech: dictionaryResult.partOfSpeech || null,
      analysis: dictionaryResult.analysis || null,
      sourceLang: layer2Result.sourceLang,
      layer: 2,
      latencyMs: latencyMs,
    };
  } catch (error) {
    console.error('[LinguaLens] Layer 2 translation failed:', error);

    // Fallback to Layer 1 result
    return {
      translation: 'Translation not found',
      lemma: dictionaryResult.lemma || text,
      selectedWord: dictionaryResult.selectedWord || text,
      partOfSpeech: dictionaryResult.partOfSpeech || null,
      analysis: dictionaryResult.analysis || null,
      layer: 1,
      latencyMs: 0,
    };
  }
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

    // Request deduplication
    const requestKey = text.trim().toLowerCase();
    const pending = pendingRequests.get(requestKey);

    if (pending) {
      // Join existing pending request
      pending.then((data) => {
        sendResponse({ success: true, data });
      }).catch((error) => {
        console.error('[LinguaLens] Deduplication error:', error);
        sendResponse({
          success: true,
          data: {
            translation: 'Translation not found',
            lemma: text,
            selectedWord: text,
            partOfSpeech: null,
            analysis: null,
            layer: 1,
            latencyMs: 0,
          },
        });
      });
      return true;
    }

    // Create new request
    const requestPromise = handleTranslationRequest(text);
    pendingRequests.set(requestKey, requestPromise);

    requestPromise
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((error) => {
        console.error('[LinguaLens] Translation error:', error);
        sendResponse({
          success: true,
          data: {
            translation: 'Translation not found',
            lemma: text,
            selectedWord: text,
            partOfSpeech: null,
            analysis: null,
            layer: 1,
            latencyMs: 0,
          },
        });
      })
      .finally(() => {
        pendingRequests.delete(requestKey);
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
