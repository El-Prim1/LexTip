/**
 * LexTip - Extension Dictionary Service
 *
 * This is the extension-runtime equivalent of src/dictionary-service.ts.
 * It adapts the legacy JSON at load time and builds grouped indexes once.
 */

let dictionaryLoaded = false;
let dictionaryEntries = [];
let byLemma = new Map();
let byPhrase = new Map();
let skippedRecords = 0;
const nlpRuntime = typeof globalThis !== 'undefined' ? globalThis.LexTipNLP : null;

function normalizeText(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/^[\s\[\]{}()<>"“”‘’.,;:!?_—–#*~]+/, '')
    .replace(/[\s\[\]{}()<>"“”‘’.,;:!?_—–#*~]+$/, '');
}

function languagePairKey(sourceLanguage, targetLanguage) {
  return `${normalizeText(sourceLanguage)}:${normalizeText(targetLanguage)}`;
}

function indexKey(value, sourceLanguage, targetLanguage) {
  return `${languagePairKey(sourceLanguage, targetLanguage)}:${normalizeText(value)}`;
}

function addGrouped(index, key, entry) {
  const entries = index.get(key) || [];
  if (!entries.some((candidate) => candidate.id === entry.id)) entries.push(entry);
  index.set(key, entries);
}

function adaptLegacyRecord(record, index) {
  if (!record || typeof record.word !== 'string' || !record.word.trim()) return null;
  if (typeof record.translation !== 'string' || !record.translation.trim()) return null;

  const lemma = normalizeText(record.word);
  const entryId = `legacy-entry-${index}`;
  const senseId = `${entryId}:sense-1`;
  return {
    id: entryId,
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    lemma,
    entryType: lemma.includes(' ') ? 'phrase' : 'word',
    partOfSpeech: 'UNKNOWN',
    senses: [{
      id: senseId,
      translations: [{ id: `${senseId}:translation`, text: record.translation }],
    }],
    source: 'legacy-json',
    verificationStatus: 'unverified',
  };
}

function buildIndexes(records) {
  dictionaryEntries = [];
  byLemma = new Map();
  byPhrase = new Map();
  skippedRecords = 0;

  records.forEach((record, index) => {
    const entry = adaptLegacyRecord(record, index);
    if (!entry) {
      skippedRecords += 1;
      return;
    }

    dictionaryEntries.push(entry);
    const indexTarget = entry.entryType === 'phrase' ? byPhrase : byLemma;
    addGrouped(indexTarget, indexKey(entry.lemma, entry.sourceLanguage, entry.targetLanguage), entry);
  });
}

async function loadDictionary() {
  if (dictionaryLoaded) return dictionaryEntries;

  try {
    const url = chrome.runtime.getURL('dictionaries/english-russian-dictionary.json');
    const response = await fetch(url);
    const dictionaryData = await response.json();
    buildIndexes(Array.isArray(dictionaryData) ? dictionaryData : []);
    dictionaryLoaded = true;
    console.log(`[DictionaryService] Loaded ${dictionaryEntries.length} dictionary entries; skipped ${skippedRecords}`);
    return dictionaryEntries;
  } catch (error) {
    console.error('[DictionaryService] Failed to load dictionary:', error);
    buildIndexes([]);
    dictionaryLoaded = false;
    return dictionaryEntries;
  }
}

function getLemmaCandidates(analysis, normalizedText) {
  const candidates = [];
  const add = (lemma, partOfSpeech) => {
    const normalizedLemma = normalizeText(lemma);
    if (!normalizedLemma) return;
    const key = `${normalizedLemma}:${partOfSpeech || ''}`;
    if (!candidates.some((candidate) => `${candidate.lemma}:${candidate.partOfSpeech || ''}` === key)) {
      candidates.push({ lemma: normalizedLemma, partOfSpeech: partOfSpeech || null });
    }
  };

  if (analysis) {
    add(analysis.lemma, analysis.partOfSpeech);
    (analysis.candidates || []).forEach((candidate) => add(candidate.lemma, candidate.partOfSpeech));
  }
  if (!candidates.some((candidate) => candidate.lemma === normalizedText)) {
    candidates.unshift({ lemma: normalizedText, partOfSpeech: null });
  }
  return candidates;
}

function rankMatch(entry, candidate, directMatch) {
  const posMatch = candidate.partOfSpeech
    && entry.partOfSpeech !== 'UNKNOWN'
    && entry.partOfSpeech === candidate.partOfSpeech;
  return {
    entry,
    lemma: candidate.lemma,
    partOfSpeech: entry.partOfSpeech,
    score: (posMatch ? 20 : 0) + (directMatch ? 5 : 0),
  };
}

function deduplicateMatches(matches) {
  const unique = new Map();
  matches.forEach((match) => {
    const previous = unique.get(match.entry.id);
    if (!previous || match.score > previous.score) unique.set(match.entry.id, match);
  });
  return [...unique.values()].sort((left, right) => right.score - left.score);
}

function flattenTranslations(structured) {
  if (!structured.found) return null;
  const translations = structured.matches.flatMap((match) => (
    match.entry.senses.flatMap((sense) => sense.translations.map((translation) => translation.text))
  ));
  return [...new Set(translations)].join(', ') || null;
}

async function lookupWord(word) {
  await loadDictionary();
  const originalText = word === null || word === undefined ? '' : String(word);
  const normalizedText = normalizeText(originalText);
  const base = {
    originalText,
    normalizedText,
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    lemmaCandidates: [],
    ambiguous: false,
  };

  if (!normalizedText) {
    const structured = {
      found: false,
      reason: 'empty-input',
      matches: [],
      ...base,
    };
    return {
      ...structured,
      structured,
      translation: null,
      selectedWord: normalizedText,
      lemma: normalizedText,
      partOfSpeech: null,
      analysis: null,
    };
  }

  if (normalizedText.includes(' ')) {
    const entries = byPhrase.get(indexKey(normalizedText, 'en', 'ru')) || [];
    const matches = deduplicateMatches(entries.map((entry) => ({
      entry,
      lemma: entry.lemma,
      partOfSpeech: entry.partOfSpeech,
      score: 20,
    })));
    const structured = matches.length > 0
      ? { ...base, found: true, matchType: 'phrase', matches }
      : { ...base, found: false, reason: 'phrase-not-found', matches: [] };
    return {
      ...structured,
      structured,
      translation: flattenTranslations(structured),
      selectedWord: normalizedText,
      lemma: matches[0] ? matches[0].lemma : normalizedText,
      partOfSpeech: matches[0] ? matches[0].partOfSpeech : null,
      analysis: null,
    };
  }

  const analysis = nlpRuntime && typeof nlpRuntime.analyzeWord === 'function'
    ? nlpRuntime.analyzeWord(originalText)
    : null;
  const lemmaCandidates = getLemmaCandidates(analysis, normalizedText);
  const matches = deduplicateMatches(lemmaCandidates.flatMap((candidate) => (
    (byLemma.get(indexKey(candidate.lemma, 'en', 'ru')) || [])
      .map((entry) => rankMatch(entry, candidate, candidate.lemma === normalizedText))
  )));
  const structured = matches.length > 0
    ? {
      ...base,
      found: true,
      matchType: matches.some((match) => match.lemma === normalizedText) ? 'direct' : 'lemma',
      matches,
      lemmaCandidates,
      ambiguous: Boolean(analysis && (analysis.ambiguous || lemmaCandidates.length > 1)),
    }
    : {
      ...base,
      found: false,
      reason: 'word-not-found',
      matches: [],
      lemmaCandidates,
      ambiguous: Boolean(analysis && analysis.ambiguous),
    };

  return {
    ...structured,
    structured,
    translation: flattenTranslations(structured),
    selectedWord: normalizedText,
    lemma: matches[0] ? matches[0].lemma : (analysis && analysis.lemma) || normalizedText,
    partOfSpeech: matches[0] ? matches[0].partOfSpeech : (analysis && analysis.partOfSpeech) || null,
    analysis,
  };
}

function formatDisplayResult(selectedWord, translation) {
  const cleanSelected = normalizeText(selectedWord);
  const targetTranslation =
    !translation || translation.trim().toLowerCase() === 'translation not found'
      ? 'Translation not found'
      : translation;
  return `${cleanSelected} — ${targetTranslation}`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadDictionary,
    lookupWord,
    formatDisplayResult,
    getDictionaryStats: () => ({ loaded: dictionaryEntries.length, skipped: skippedRecords }),
  };
}
