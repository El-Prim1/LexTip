/**
 * LinguaLens - Dictionary Service Module
 * Loads and indexes the English-Russian dictionary for O(1) lookups
 * Integrates with the lemmatization pipeline
 */

let dictionaryMap = null;
let dictionaryLoaded = false;
const nlpRuntime = typeof globalThis !== 'undefined' ? globalThis.LinguaLensNLP : null;

/**
 * Normalizes input text by stripping leading/trailing punctuation and whitespace
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .trim()
    .toLowerCase()
    .replace(/^[\s"'`"'«"\[\(\{<>\.,;:!?\-_—–#*~]+/, '')
    .replace(/[\s"'`""»"\]\)\}<>\.,;:!?\-_—–#*~]+$/, '');
}

/* Exact normalized-word lookup only. */
function lookupNormalizedWord(word) {
  const cleaned = normalizeText(word);
  return cleaned;
}

/**
 * Generate lemma candidates for dictionary lookup
 */
/**
 * Load dictionary from JSON file and build index
 */
async function loadDictionary() {
  if (dictionaryLoaded && dictionaryMap) {
    return dictionaryMap;
  }

  try {
    const url = chrome.runtime.getURL('dictionaries/english-russian-dictionary.json');
    const response = await fetch(url);
    const dictionaryData = await response.json();

    // Build Map for O(1) lookup keyed by word (lowercase)
    dictionaryMap = new Map();
    for (const entry of dictionaryData) {
      if (entry.word) {
        const key = entry.word.toLowerCase().trim();
        dictionaryMap.set(key, {
          word: entry.word,
          translation: entry.translation,
        });
      }
    }

    dictionaryLoaded = true;
    console.log(`[DictionaryService] Loaded ${dictionaryMap.size} dictionary entries`);
    return dictionaryMap;
  } catch (error) {
    console.error('[DictionaryService] Failed to load dictionary:', error);
    dictionaryMap = new Map();
    dictionaryLoaded = false;
    return dictionaryMap;
  }
}

/**
 * Lookup word in dictionary with lemmatization fallback
 * Returns: { found: boolean, translation: string, lemma: string }
 */
async function lookupWord(word) {
  await loadDictionary();

  const selectedWord = lookupNormalizedWord(word);
  const analysis = nlpRuntime && typeof nlpRuntime.analyzeWord === 'function'
    ? nlpRuntime.analyzeWord(word)
    : null;
  const lemma = analysis && analysis.lemma ? analysis.lemma : selectedWord;
  const entry = dictionaryMap.get(lemma) || dictionaryMap.get(selectedWord);
  if (entry) {
    return {
      found: true,
      translation: entry.translation,
      selectedWord,
      lemma,
      partOfSpeech: analysis ? analysis.partOfSpeech : null,
      analysis,
    };
  }

  // Not found
  return {
    found: false,
    translation: null,
    selectedWord,
    lemma,
    partOfSpeech: analysis ? analysis.partOfSpeech : null,
    analysis,
  };
}

/**
 * Format display result according to UI specification
 */
function formatDisplayResult(selectedWord, translation) {
  const cleanSelected = normalizeText(selectedWord);
  const targetTranslation =
    !translation || translation.trim().toLowerCase() === 'translation not found'
      ? 'Translation not found'
      : translation;

  return `${cleanSelected} — ${targetTranslation}`;
}

// Export functions for use in service worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadDictionary,
    lookupWord,
    formatDisplayResult,
  };
}
