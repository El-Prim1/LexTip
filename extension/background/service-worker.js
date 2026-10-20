/**
 * LinguaLens - Background Service Worker (Manifest v3)
 * Integrates English-Russian dictionary with lemmatization pipeline
 */

// Import dictionary service
importScripts('dictionary-service.js');

// Installation Lifecycle Listener
chrome.runtime.onInstalled.addListener(() => {
  console.log('[LinguaLens] Extension installed / updated.');
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
        // Dictionary hit with lemma and selected word
        sendResponse({
          success: true,
          data: {
            translation: result.translation,
            lemma: result.lemma,
            selectedWord: result.selectedWord,
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
            layer: 1,
            latencyMs: latencyMs,
          },
        });
      }
    }).catch((error) => {
      console.error('[LinguaLens] Dictionary lookup error:', error);
      sendResponse({
        success: true,
        data: {
          translation: 'Translation not found',
          lemma: text,
          selectedWord: text,
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

  return false;
});
