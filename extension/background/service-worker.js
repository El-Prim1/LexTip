/**
 * LexTip - Background Service Worker (Manifest v3)
 * Integrates English-Russian dictionary with lemmatization pipeline
 */

// Import dictionary service
importScripts('nlp-runtime.js', 'dictionary-service.js', 'local-translation-prototype.js');

// Installation Lifecycle Listener
chrome.runtime.onInstalled.addListener(() => {
  console.log('[LexTip] Extension installed / updated.');
  // Pre-load dictionary on installation
  loadDictionary();
});

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

    const startTime = performance.now();

    lookupWord(text).then((result) => {
      const latencyMs = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));

      if (result.found) {
        // Dictionary hit with lemma and selected word; the popup headword is
        // formatted by the dictionary service so lookup semantics stay in one
        // place (lemma plus original selection when lemmatization changed it).
        sendResponse({
          success: true,
          data: {
            translation: result.translation,
            lemma: result.lemma,
            selectedWord: result.selectedWord,
            originalText: result.originalText,
            displayHeadword: result.displayHeadword,
            displayLine: formatLookupDisplay(result),
            partOfSpeech: result.partOfSpeech,
            analysis: result.analysis,
            layer: 1,
            latencyMs: latencyMs,
          },
        });
      } else {
        // Dictionary miss - use fallback format
        sendResponse({
          success: true,
          data: {
            translation: 'Translation not found',
            lemma: result.lemma,
            selectedWord: result.selectedWord,
            originalText: result.originalText,
            displayHeadword: result.displayHeadword || result.selectedWord,
            displayLine: formatLookupDisplay(result),
            partOfSpeech: result.partOfSpeech,
            analysis: result.analysis,
            layer: 1,
            latencyMs: latencyMs,
          },
        });
      }
    }).catch((error) => {
      console.error('[LexTip] Dictionary lookup error:', error);
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

  if (message.type === 'GOOGLE_TRANSLATE_REQUEST') {
    const { text, sourceLang = 'auto', targetLang = 'ru' } = message.payload || {};

    if (!text || typeof text !== 'string') {
      sendResponse({ success: false, error: 'Invalid or missing text parameter.' });
      return false;
    }

    fetchGoogleTranslation(text, sourceLang, targetLang)
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  }

  return false;
});

/**
 * Fetches translation from the undocumented Google Translate endpoint.
 * @param {string} text Text to translate
 * @param {string} sourceLang Source language ('auto' by default)
 * @param {string} targetLang Target language ('ru' by default)
 * @param {number} timeoutMs Request timeout in milliseconds
 * @returns {Promise<{ translation: string, detectedSourceLang: string }>}
 */
async function fetchGoogleTranslation(text, sourceLang = 'auto', targetLang = 'ru', timeoutMs = 5000) {
  const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&q=${encodeURIComponent(text)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Google endpoint responded with status ${response.status}`);
    }

    const data = await response.json();
    let translation = '';
    let detectedSourceLang = sourceLang;

    if (Array.isArray(data)) {
      if (Array.isArray(data[0])) {
        translation = data.map((item) => (Array.isArray(item) ? item[0] : item)).filter(Boolean).join('');
        if (data[0][1]) detectedSourceLang = data[0][1];
      } else if (typeof data[0] === 'string') {
        translation = data[0];
      }
    } else if (typeof data === 'string') {
      translation = data;
    }

    if (!translation) {
      throw new Error('Empty translation received from Google endpoint.');
    }

    return { translation, detectedSourceLang };
  } finally {
    clearTimeout(timer);
  }
}
