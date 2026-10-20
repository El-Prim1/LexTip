/**
 * LinguaLens - Dictionary Service Module
 * Loads and indexes the English-Russian dictionary for O(1) lookups
 * Integrates with the lemmatization pipeline
 */

let dictionaryMap = null;
let dictionaryLoaded = false;

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

/**
 * Simple lemmatizer for English words
 * Handles common irregular forms and suffixes
 */
function lemmatizeSimple(word) {
  const cleaned = normalizeText(word);
  if (!cleaned || cleaned.length < 3) {
    return cleaned;
  }

  // Irregular forms map (subset of common irregulars)
  const irregularMap = {
    went: 'go',
    gone: 'go',
    goes: 'go',
    was: 'be',
    were: 'be',
    been: 'be',
    had: 'have',
    has: 'have',
    did: 'do',
    done: 'do',
    saw: 'see',
    seen: 'see',
    bought: 'buy',
    wrote: 'write',
    written: 'write',
    began: 'begin',
    begun: 'begin',
    came: 'come',
    ate: 'eat',
    eaten: 'eat',
    felt: 'feel',
    found: 'find',
    gave: 'give',
    given: 'give',
    got: 'get',
    gotten: 'get',
    kept: 'keep',
    left: 'leave',
    lost: 'lose',
    made: 'make',
    met: 'meet',
    paid: 'pay',
    said: 'say',
    sold: 'sell',
    sent: 'send',
    spoke: 'speak',
    spoken: 'speak',
    spent: 'spend',
    stood: 'stand',
    took: 'take',
    taken: 'take',
    taught: 'teach',
    told: 'tell',
    thought: 'think',
    understood: 'understand',
    won: 'win',
    children: 'child',
    teeth: 'tooth',
    feet: 'foot',
    men: 'man',
    women: 'woman',
    mice: 'mouse',
    geese: 'goose',
    people: 'person',
  };

  // Check irregular map
  if (irregularMap[cleaned]) {
    return irregularMap[cleaned];
  }

  // Protected suffixes (words ending in -s that should NOT be stripped)
  const protectedSuffixes = ['ss', 'us', 'is', 'ous', 'ics', 'as', 'os', 'tion', 'sion', 'ment'];
  const isProtected = protectedSuffixes.some(suffix => cleaned.endsWith(suffix));

  // Handle -ing
  if (cleaned.endsWith('ing') && cleaned.length > 4) {
    if (cleaned.endsWith('ying')) {
      return cleaned.slice(0, -4) + 'ie';
    }
    const stem = cleaned.slice(0, -3);
    // Restore silent 'e' for certain patterns
    if (stem.endsWith('nc') || stem.endsWith('rc') || stem.endsWith('sc') || 
        stem.endsWith('dg') || stem.endsWith('chang') || stem.endsWith('rang')) {
      return stem + 'e';
    }
    // CVC pattern
    if (stem.length >= 3) {
      const c2 = stem[stem.length - 1];
      const v1 = stem[stem.length - 2];
      const c1 = stem[stem.length - 3];
      const vowels = 'aeiou';
      if (!vowels.includes(c2) && vowels.includes(v1) && !vowels.includes(c1)) {
        return stem + 'e';
      }
    }
    return stem;
  }

  // Handle -ed
  if (cleaned.endsWith('ed') && cleaned.length >= 3) {
    if (cleaned.endsWith('ied')) {
      return cleaned.slice(0, -3) + 'y';
    }
    const stem = cleaned.slice(0, -2);
    // Restore silent 'e' for certain patterns
    if (stem.endsWith('nc') || stem.endsWith('rc') || stem.endsWith('sc') || 
        stem.endsWith('dg') || stem.endsWith('chang') || stem.endsWith('rang')) {
      return cleaned.slice(0, -1);
    }
    // CVC pattern
    if (stem.length >= 2) {
      const lastChar = stem[stem.length - 1];
      const vowels = 'aeiou';
      if (!vowels.includes(lastChar) && vowels.includes(stem[stem.length - 2])) {
        if (stem.length >= 3 && vowels.includes(stem[stem.length - 3])) {
          return stem;
        }
        return stem + 'e';
      }
    }
    return stem;
  }

  // Handle -s/-es (with protection)
  if (!isProtected && cleaned.endsWith('s') && cleaned.length > 3) {
    if (cleaned.endsWith('ies')) {
      return cleaned.slice(0, -3) + 'y';
    }
    if (cleaned.endsWith('es')) {
      const beforeEs = cleaned.slice(0, -2);
      const sibilants = ['ch', 'sh', 'ss', 'x', 'z'];
      if (sibilants.some(s => beforeEs.endsWith(s))) {
        return beforeEs;
      }
      return cleaned.slice(0, -1);
    }
    return cleaned.slice(0, -1);
  }

  return cleaned;
}

/**
 * Generate lemma candidates for dictionary lookup
 */
function generateLemmaCandidates(word) {
  const primaryLemma = lemmatizeSimple(word);
  const normalizedWord = normalizeText(word);
  const candidates = [];

  if (primaryLemma) {
    candidates.push(primaryLemma);
  }

  if (normalizedWord && !candidates.includes(normalizedWord)) {
    candidates.push(normalizedWord);
  }

  // Add fallback candidates
  if (normalizedWord.endsWith('es') && normalizedWord.length > 4) {
    candidates.push(normalizedWord.slice(0, -2));
  }
  if (normalizedWord.endsWith('ed') && normalizedWord.length > 4) {
    candidates.push(normalizedWord.slice(0, -2));
  }
  if (normalizedWord.endsWith('ing') && normalizedWord.length > 4) {
    candidates.push(normalizedWord.slice(0, -3));
  }

  // Add the original normalized word
  candidates.push(normalizedWord);

  return [...new Set(candidates.filter(c => c && c.length >= 2))];
}

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

  const candidates = generateLemmaCandidates(word);

  for (const candidate of candidates) {
    const entry = dictionaryMap.get(candidate);
    if (entry) {
      return {
        found: true,
        translation: entry.translation,
        lemma: candidate,
        selectedWord: normalizeText(word),
      };
    }
  }

  // Not found
  return {
    found: false,
    translation: null,
    lemma: candidates[0] || normalizeText(word),
    selectedWord: normalizeText(word),
  };
}

/**
 * Format display result according to UI specification
 */
function formatDisplayResult(selectedWord, lemma, translation) {
  const cleanSelected = normalizeText(selectedWord);
  const cleanLemma = normalizeText(lemma);
  const targetTranslation =
    !translation || translation.trim().toLowerCase() === 'translation not found'
      ? 'Translation not found'
      : translation;

  if (!cleanLemma || cleanSelected === cleanLemma) {
    return `${cleanSelected} — ${targetTranslation}`;
  }

  return `${cleanLemma} (${cleanSelected}) — ${targetTranslation}`;
}

// Export functions for use in service worker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadDictionary,
    lookupWord,
    formatDisplayResult,
    lemmatizeSimple,
    generateLemmaCandidates,
  };
}
