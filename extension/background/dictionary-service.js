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
let legacyLoaded = 0;
let statisticalLoaded = 0;
const statisticalDictionarySource = 'statistical-dataset';
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

function adaptLegacyRecord(record, index, source = 'legacy-json') {
  if (!record || typeof record.word !== 'string' || !record.word.trim()) return null;
  if (typeof record.translation !== 'string' || !record.translation.trim()) return null;
  if (source === statisticalDictionarySource
    && (!Number.isSafeInteger(record.count)
      || record.count <= 0
      || typeof record.probability !== 'number'
      || !Number.isFinite(record.probability)
      || record.probability < 0
      || record.probability > 1)) return null;

  const lemma = normalizeText(record.word);
  const entryId = `${source === statisticalDictionarySource ? 'statistical' : 'legacy'}-entry-${index}`;
  const senseId = `${entryId}:sense-1`;
  const translation = { id: `${senseId}:translation`, text: record.translation };
  if (source === statisticalDictionarySource) {
    translation.count = record.count;
    translation.probability = record.probability;
  }
  return {
    id: entryId,
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    lemma,
    entryType: lemma.includes(' ') ? 'phrase' : 'word',
    partOfSpeech: 'UNKNOWN',
    senses: [{
      id: senseId,
      translations: [translation],
    }],
    source,
    verificationStatus: 'unverified',
  };
}

function buildIndexes(legacyRecords, statisticalRecords) {
  dictionaryEntries = [];
  byLemma = new Map();
  byPhrase = new Map();
  skippedRecords = 0;
  legacyLoaded = 0;
  statisticalLoaded = 0;

  const addRecords = (records, source) => {
    records.forEach((record, index) => {
      const entry = adaptLegacyRecord(record, index, source);
      if (!entry) {
        skippedRecords += 1;
        return;
      }

      dictionaryEntries.push(entry);
      if (source === statisticalDictionarySource) statisticalLoaded += 1;
      else legacyLoaded += 1;
      const indexTarget = entry.entryType === 'phrase' ? byPhrase : byLemma;
      addGrouped(indexTarget, indexKey(entry.lemma, entry.sourceLanguage, entry.targetLanguage), entry);
    });
  };

  addRecords(legacyRecords, 'legacy-json');
  addRecords(statisticalRecords, statisticalDictionarySource);
}

async function loadDictionary() {
  if (dictionaryLoaded) return dictionaryEntries;

  try {
    const legacyUrl = chrome.runtime.getURL('dictionaries/english-russian-dictionary.json');
    const statisticalUrl = chrome.runtime.getURL('dictionaries/statistical-en-russian-dictionary.json');
    const legacyResponse = await fetch(legacyUrl);
    if (!legacyResponse.ok) {
      throw new Error(`Legacy dictionary asset request failed: HTTP ${legacyResponse.status}`);
    }
    const legacyData = await legacyResponse.json();
    if (!Array.isArray(legacyData)) {
      throw new Error('Legacy dictionary asset must contain a JSON array');
    }

    let statisticalData = [];
    try {
      const statisticalResponse = await fetch(statisticalUrl);
      if (!statisticalResponse.ok) {
        throw new Error(`HTTP ${statisticalResponse.status}`);
      }
      statisticalData = await statisticalResponse.json();
      if (!Array.isArray(statisticalData)) {
        throw new Error('Statistical dictionary asset must contain a JSON array');
      }
    } catch (error) {
      console.error('[DictionaryService] Statistical dictionary unavailable; continuing with canonical data:', error);
    }

    buildIndexes(legacyData, statisticalData);
    dictionaryLoaded = true;
    console.log(
      `[DictionaryService] Loaded ${legacyLoaded} legacy and ${statisticalLoaded} statistical entries; skipped ${skippedRecords}`,
    );
    return dictionaryEntries;
  } catch (error) {
    console.error('[DictionaryService] Failed to load dictionary:', error);
    buildIndexes([], []);
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
  return [...unique.values()].sort((left, right) => {
    const leftImported = left.entry.source === statisticalDictionarySource;
    const rightImported = right.entry.source === statisticalDictionarySource;
    if (leftImported !== rightImported) return leftImported ? 1 : -1;
    if (left.score !== right.score) return right.score - left.score;

    if (leftImported && rightImported) {
      const leftTranslation = left.entry.senses[0]?.translations[0];
      const rightTranslation = right.entry.senses[0]?.translations[0];
      const probabilityDifference = rightTranslation.probability - leftTranslation.probability;
      if (probabilityDifference !== 0) return probabilityDifference;
      const countDifference = rightTranslation.count - leftTranslation.count;
      if (countDifference !== 0) return countDifference;
      const leftText = normalizeText(leftTranslation.text);
      const rightText = normalizeText(rightTranslation.text);
      if (leftText !== rightText) return leftText < rightText ? -1 : 1;
    }

    return 0;
  });
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
  // The original selection is preserved verbatim for the entire pipeline;
  // lemmatization only produces lookup candidates and never replaces it.
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
      displayHeadword: normalizedText,
      selectedWord: normalizedText,
      lemma: normalizedText,
      partOfSpeech: null,
      analysis: null,
    };
  }

  // Phrases are handled before any word-level morphological analysis so a
  // multiword expression keeps its meaning instead of being lemmatized token
  // by token. Exact phrase matches keep their previous priority behaviour.
  if (normalizedText.includes(' ')) {
    const phraseEntries = byPhrase.get(indexKey(normalizedText, 'en', 'ru')) || [];
    const phraseMatches = deduplicateMatches(phraseEntries.map((entry) => ({
      entry,
      lemma: entry.lemma,
      partOfSpeech: entry.partOfSpeech,
      score: 20,
    })));
    if (phraseMatches.length > 0) {
      const structured = { ...base, found: true, matchType: 'phrase', matches: phraseMatches };
      return {
        ...structured,
        structured,
        translation: flattenTranslations(structured),
        displayHeadword: formatDisplayHeadword(normalizedText, normalizedText),
        selectedWord: normalizedText,
        lemma: phraseMatches[0].lemma,
        partOfSpeech: phraseMatches[0].partOfSpeech,
        analysis: null,
      };
    }

    // Fallback: build whole-phrase lemma candidates from per-token analyses
    // (the original phrase stays intact as a candidate too).
    let tokenAnalyses = null;
    if (nlpRuntime && typeof nlpRuntime.analyzeText === 'function') {
      try {
        tokenAnalyses = nlpRuntime.analyzeText(originalText);
      } catch (error) {
        console.warn('[DictionaryService] Phrase lemmatization failed:', error);
        tokenAnalyses = null;
      }
    }
    const phraseCandidates = buildPhraseLemmaCandidates(tokenAnalyses, normalizedText);
    const matches = deduplicateMatches(phraseCandidates.flatMap((candidate) => (
      (byPhrase.get(indexKey(candidate.lemma, 'en', 'ru')) || [])
        .map((entry) => rankMatch(entry, candidate, candidate.lemma === normalizedText))
    )));
    const structured = matches.length > 0
      ? {
        ...base,
        found: true,
        matchType: matches.some((match) => match.lemma === normalizedText) ? 'phrase-direct' : 'phrase-lemma',
        matches,
        lemmaCandidates: phraseCandidates,
      }
      : {
        ...base,
        found: false,
        reason: 'phrase-not-found',
        matches: [],
        lemmaCandidates: phraseCandidates,
      };
    return {
      ...structured,
      structured,
      translation: flattenTranslations(structured),
      displayHeadword: formatDisplayHeadword(matches[0] ? matches[0].lemma : normalizedText, normalizedText),
      selectedWord: normalizedText,
      lemma: matches[0] ? matches[0].lemma : normalizedText,
      partOfSpeech: matches[0] ? matches[0].partOfSpeech : null,
      analysis: Array.isArray(tokenAnalyses) && tokenAnalyses.length > 0 ? tokenAnalyses : null,
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
    displayHeadword: formatDisplayHeadword(matches[0] ? matches[0].lemma : normalizedText, normalizedText),
    selectedWord: normalizedText,
    lemma: matches[0] ? matches[0].lemma : (analysis && analysis.lemma) || normalizedText,
    partOfSpeech: matches[0] ? matches[0].partOfSpeech : (analysis && analysis.partOfSpeech) || null,
    analysis,
  };
}

// Collect every distinct lemma produced by the token analyses into one
// ordered candidate list for whole-phrase lookups. The raw normalized phrase
// always participates so an exact dictionary hit can never be lost.
function buildPhraseLemmaCandidates(tokenAnalyses, normalizedPhrase) {
  const candidates = [];
  const add = (lemma, partOfSpeech) => {
    const normalizedLemma = normalizeText(lemma);
    if (!normalizedLemma || !normalizedLemma.includes(' ')) return;
    const key = `${normalizedLemma}:${partOfSpeech || ''}`;
    if (!candidates.some((candidate) => `${candidate.lemma}:${candidate.partOfSpeech || ''}` === key)) {
      candidates.push({ lemma: normalizedLemma, partOfSpeech: partOfSpeech || null });
    }
  };

  if (Array.isArray(tokenAnalyses)) {
    // wink-nlp returns a placeholder object ("[object Object]") instead of a
    // real lemma for non-word tokens such as spaces or punctuation; those
    // tokens keep their surface form so phrase candidates stay readable.
    const isUsableLemma = (value) => typeof value === 'string'
      && value.trim().length > 0
      && !value.includes('[object');
    const lemmaSlots = tokenAnalyses.map((token) => {
      const seen = new Set();
      const options = [];
      const pushOption = (lemma, partOfSpeech) => {
        if (!isUsableLemma(lemma)) return;
        const normalizedLemma = normalizeText(lemma);
        if (!normalizedLemma || seen.has(`${normalizedLemma}:${partOfSpeech || ''}`)) return;
        seen.add(`${normalizedLemma}:${partOfSpeech || ''}`);
        options.push({ lemma: normalizedLemma, partOfSpeech: partOfSpeech || null });
      };
      if (token) {
        pushOption(token.lemma, token.partOfSpeech);
        (token.candidates || []).forEach((candidate) => pushOption(candidate.lemma, candidate.partOfSpeech));
      }
      if (options.length === 0) pushOption((token && (token.normalized || token.surface)) || '', null);
      return options;
    });
    if (lemmaSlots.length > 1 && lemmaSlots.every((slot) => slot.length > 0)) {
      let combinations = [''];
      for (const slot of lemmaSlots) {
        const next = [];
        for (const prefix of combinations) {
          for (const option of slot) {
            next.push({ text: prefix ? `${prefix} ${option.lemma}` : option.lemma, partOfSpeech: option.partOfSpeech });
          }
        }
        combinations = next;
        if (combinations.length > 64) break;
      }
      combinations.slice(0, 64).forEach((combination) => add(combination.text, combination.partOfSpeech));
    }
  }
  add(normalizedPhrase, null);
  return candidates;
}

// Headword shown in the popup: the matched dictionary lemma followed by the
// original selected text in parentheses whenever lemmatization changed the
// form. Identical forms render without parentheses.
function formatDisplayHeadword(lemma, normalizedText) {
  const cleanLemma = normalizeText(lemma);
  const cleanOriginal = normalizeText(normalizedText);
  if (!cleanLemma || cleanLemma === cleanOriginal) return cleanOriginal;
  return `${cleanLemma} (${cleanOriginal})`;
}

function formatDisplayResult(selectedWord, translation) {
  const cleanSelected = normalizeText(selectedWord);
  const targetTranslation =
    !translation || translation.trim().toLowerCase() === 'translation not found'
      ? 'Translation not found'
      : translation;
  return `${cleanSelected} — ${targetTranslation}`;
}

// Popup line built entirely inside the dictionary service so the content
// script never duplicates lookup semantics.
function formatLookupDisplay(result) {
  if (!result) return 'Translation not found';
  const headword = result.displayHeadword
    || formatDisplayHeadword(result.lemma, result.selectedWord);
  return formatDisplayResult(headword, result.translation);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadDictionary,
    lookupWord,
    formatDisplayResult,
    formatDisplayHeadword,
    formatLookupDisplay,
    getDictionaryStats: () => ({
      loaded: dictionaryEntries.length,
      skipped: skippedRecords,
      legacyLoaded,
      statisticalLoaded,
    }),
  };
}
