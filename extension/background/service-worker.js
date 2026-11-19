/**
 * LexTip - Background Service Worker (Manifest v3)
 * Integrates English-Russian dictionary with lemmatization pipeline
 */

// Deployment configuration first, then the dictionary/NLP runtime.
importScripts('../config/libretranslate.config.js', 'nlp-runtime.js', 'dictionary-service.js');

const LEXTIP_CONFIG = (typeof globalThis !== 'undefined' && globalThis.LEXTIP_CONFIG) || {};
const LIBRETRANSLATE_BASE_URL = String(
  LEXTIP_CONFIG.libretranslateBaseUrl || 'http://localhost:5000',
).replace(/\/+$/, '');
const LIBRETRANSLATE_API_KEY = String(LEXTIP_CONFIG.libretranslateApiKey || '');
const LIBRETRANSLATE_LANGUAGES_TTL_MS = 60 * 60 * 1000;

let libreTranslateLanguagesCache = null;
let libreTranslateLanguagesCachedAt = 0;

// Installation Lifecycle Listener
chrome.runtime.onInstalled.addListener(() => {
  console.log('[LexTip] Extension installed / updated.');
  // Pre-load dictionary on installation
  loadDictionary();
});

// Runtime Message Router (Content Script -> Service Worker)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE_REQUEST') {
    const { text, sourceLang = 'en', targetLang = 'ru' } = message.payload || {};

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

    // Local dictionary only supports English -> Russian
    const isPairSupported = (!sourceLang || sourceLang === 'en' || sourceLang === 'auto')
      && (!targetLang || targetLang === 'ru');

    const lookupAction = isPairSupported
      ? lookupWord(text)
      : Promise.resolve({
          found: false,
          reason: 'unsupported-language-pair',
          translation: null,
          lemma: text,
          selectedWord: text,
          originalText: text,
          displayHeadword: text,
          partOfSpeech: null,
          analysis: null,
        });

    lookupAction.then((result) => {
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

  if (message.type === 'LIBRETRANSLATE_REQUEST') {
    const { text, sourceLang = 'auto', targetLang = 'ru' } = message.payload || {};

    if (!text || typeof text !== 'string') {
      sendResponse({ success: false, error: 'Invalid or missing text parameter.' });
      return false;
    }

    fetchLibreTranslate(text, sourceLang, targetLang)
      .then((data) => sendResponse({ success: true, data }))
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return true;
  }

  if (message.type === 'LIBRETRANSLATE_LANGUAGES_REQUEST') {
    fetchLibreTranslateLanguages()
      .then((languages) => sendResponse({ success: true, data: languages }))
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
 * Translates text through the configured LibreTranslate server.
 * @param {string} text Text to translate
 * @param {string} sourceLang Source language ('auto' by default)
 * @param {string} targetLang Target language ('ru' by default)
 * @param {number} timeoutMs Request timeout in milliseconds
 * @returns {Promise<{ translation: string, detectedSourceLang: string }>}
 */
async function fetchLibreTranslate(text, sourceLang = 'auto', targetLang = 'ru', timeoutMs = 10000) {
  if (sourceLang && targetLang && sourceLang !== 'auto' && sourceLang === targetLang) {
    return { translation: text, detectedSourceLang: sourceLang };
  }

  const body = {
    q: text,
    source: sourceLang || 'auto',
    target: targetLang,
    format: 'text',
  };
  if (LIBRETRANSLATE_API_KEY) body.api_key = LIBRETRANSLATE_API_KEY;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${LIBRETRANSLATE_BASE_URL}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = '';
      try {
        const errorBody = await response.json();
        if (errorBody && typeof errorBody.error === 'string') detail = `: ${errorBody.error}`;
      } catch (parseError) {
        // The error body is not JSON; keep the status-only message.
      }
      throw new Error(`LibreTranslate responded with status ${response.status}${detail}`);
    }

    const data = await response.json();
    const translation = data && typeof data.translatedText === 'string' ? data.translatedText : '';

    if (!translation) {
      throw new Error('Empty translation received from LibreTranslate.');
    }

    let detectedSourceLang = sourceLang;
    if (sourceLang === 'auto' && data.detectedLanguage) {
      detectedSourceLang = typeof data.detectedLanguage === 'string'
        ? data.detectedLanguage
        : (data.detectedLanguage.language || sourceLang);
    }

    return { translation, detectedSourceLang };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Discovers the languages the configured LibreTranslate server can serve.
 * Results are cached briefly to avoid a request per selection.
 * @returns {Promise<Array<{ code: string, name: string, targets: string[] }>>}
 */
async function fetchLibreTranslateLanguages(timeoutMs = 8000) {
  const now = Date.now();
  if (libreTranslateLanguagesCache
    && now - libreTranslateLanguagesCachedAt < LIBRETRANSLATE_LANGUAGES_TTL_MS) {
    return libreTranslateLanguagesCache;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${LIBRETRANSLATE_BASE_URL}/languages`, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`LibreTranslate languages request failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Unexpected LibreTranslate languages response.');
    }

    const languages = data
      .filter((item) => item && typeof item.code === 'string' && item.code.trim())
      .map((item) => ({
        code: item.code.trim(),
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : item.code.trim(),
        targets: Array.isArray(item.targets)
          ? item.targets.filter((target) => typeof target === 'string' && target.trim())
          : [],
      }));

    if (languages.length === 0) {
      throw new Error('LibreTranslate returned no supported languages.');
    }

    libreTranslateLanguagesCache = languages;
    libreTranslateLanguagesCachedAt = now;
    return languages;
  } finally {
    clearTimeout(timer);
  }
}
