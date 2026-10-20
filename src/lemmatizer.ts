/**
 * Custom Production-Ready TypeScript Lemmatizer for Browser Extension & Web Dashboard
 * Pipeline:
 * - Edge punctuation & whitespace normalization
 * - Level 1: Irregular Form & Invariant Lookup Map (O(1))
 * - Level 2: Protected Suffix Guard (Native '-s' Protection)
 * - Level 3: Morphological Rule Pipeline (-ing, -ed, -s/-es with silent 'e' restoration)
 */

export interface LemmatizationResult {
  lemma: string;
  original: string;
  cleaned: string;
  ruleApplied: string;
}

const IRREGULAR_MAP: Record<string, string> = {
  // Irregular verbs
  went: 'go',
  gone: 'go',
  goes: 'go',
  bought: 'buy',
  running: 'run',
  ran: 'run',
  written: 'write',
  wrote: 'write',
  began: 'begin',
  begun: 'begin',
  came: 'come',
  did: 'do',
  does: 'do',
  done: 'do',
  ate: 'eat',
  eaten: 'eat',
  felt: 'feel',
  found: 'find',
  flew: 'fly',
  flown: 'fly',
  gave: 'give',
  given: 'give',
  got: 'get',
  gotten: 'get',
  had: 'have',
  has: 'have',
  held: 'hold',
  knew: 'know',
  known: 'know',
  left: 'leave',
  lost: 'lose',
  made: 'make',
  met: 'meet',
  paid: 'pay',
  said: 'say',
  saw: 'see',
  seen: 'see',
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
  wore: 'wear',
  worn: 'wear',
  won: 'win',
  broken: 'break',
  broke: 'break',
  chosen: 'choose',
  chose: 'choose',
  driven: 'drive',
  drove: 'drive',
  hidden: 'hide',
  hid: 'hide',
  ridden: 'ride',
  rode: 'ride',
  risen: 'rise',
  rose: 'rise',
  swum: 'swim',
  swam: 'swim',

  // Irregular plural nouns
  children: 'child',
  teeth: 'tooth',
  feet: 'foot',
  men: 'man',
  women: 'woman',
  mice: 'mouse',
  geese: 'goose',
  people: 'person',
  oxen: 'ox',

  // Singular invariant / native '-s' words that must NEVER be stripped
  news: 'news',
  series: 'series',
  species: 'species',
  status: 'status',
  means: 'means',
  lens: 'lens',
  crisis: 'crisis',
  basis: 'basis',
  axis: 'axis',
  chassis: 'chassis',
  corpus: 'corpus',
  apparatus: 'apparatus',
};

// Level 2: Protected non-suffix endings intrinsic to the root
const PROTECTED_SUFFIXES = ['ss', 'us', 'is', 'ous', 'ics', 'as', 'os', 'tion', 'sion', 'ment'];

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

function isVowel(char: string): boolean {
  return VOWELS.has(char);
}

function isConsonant(char: string): boolean {
  return /^[a-z]$/.test(char) && !VOWELS.has(char);
}

/**
 * Trims edge punctuation and whitespace, then converts to lower case
 */
export function normalizeSelection(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[\s"'`“‘«„\[\(\{<>\.,;:!?\-_—–#*~]+/, '')
    .replace(/[\s"'`”’»“\]\)\}<>\.,;:!?\-_—–#*~]+$/, '');
}

/**
 * Core 3-Level Morphological Lemmatizer
 */
export function lemmatize(rawWord: string): string {
  const cleaned = normalizeSelection(rawWord);
  if (!cleaned || cleaned.length < 3) {
    return cleaned;
  }

  // Level 1: Irregular Form & Invariant Lookup Map (O(1))
  if (Object.prototype.hasOwnProperty.call(IRREGULAR_MAP, cleaned)) {
    return IRREGULAR_MAP[cleaned];
  }

  // Level 2: Protected Suffix Guard (Native '-s' Protection)
  const isProtectedFromSStripping = PROTECTED_SUFFIXES.some((suffix) => cleaned.endsWith(suffix));

  // Level 3: Morphological Rule Pipeline

  // 3A: Handle '-ing' Suffixes (word length > 4)
  if (cleaned.endsWith('ing') && cleaned.length > 4) {
    // Map '-ying' to '-ie' (e.g., 'dying' -> 'die', 'lying' -> 'lie')
    if (cleaned.endsWith('ying') && cleaned.length > 4) {
      return cleaned.slice(0, -4) + 'ie';
    }

    const stem = cleaned.slice(0, -3);

    // Keep 'll' intact (e.g., 'calling' -> 'call', 'falling' -> 'fall', 'pulling' -> 'pull')
    if (stem.endsWith('ll')) {
      return stem;
    }

    // Doubled consonants before '-ing' (excluding 'll', e.g., 'bb', 'dd', 'gg', 'mm', 'nn', 'pp', 'rr', 'tt')
    if (
      stem.length >= 3 &&
      stem[stem.length - 1] === stem[stem.length - 2] &&
      stem[stem.length - 1] !== 'l' &&
      stem[stem.length - 1] !== 's' &&
      !['w', 'x', 'y'].includes(stem[stem.length - 1]) &&
      isConsonant(stem[stem.length - 1])
    ) {
      return stem.slice(0, -1);
    }

    // Silent 'e' restoration:
    // 1. Soft c / g endings: e.g. 'debouncing' -> 'debounce', 'dancing' -> 'dance', 'bridging' -> 'bridge', 'changing' -> 'change'
    if (
      stem.endsWith('nc') ||
      stem.endsWith('rc') ||
      stem.endsWith('sc') ||
      stem.endsWith('dg') ||
      stem.endsWith('chang') ||
      stem.endsWith('rang') ||
      stem.endsWith('tc')
    ) {
      // e.g., debounc -> debounce, danc -> dance
      return stem + 'e';
    }

    // 2. CVC pattern (consonant-vowel-consonant, excluding w, x, y) -> append 'e'
    // e.g. making -> make, taking -> take, creating -> create, saving -> save, smiling -> smile
    if (stem.length >= 3) {
      const c2 = stem[stem.length - 1]; // last consonant
      const v1 = stem[stem.length - 2]; // preceding vowel
      const c1 = stem[stem.length - 3]; // preceding char

      if (isConsonant(c2) && !['w', 'x', 'y'].includes(c2) && isVowel(v1)) {
        // If preceding char is vowel (e.g. 'clean' in cleaning, 'look' in looking), do NOT add silent 'e'
        if (isVowel(c1)) {
          return stem; // cleaning -> clean, looking -> look, speaking -> speak
        }
        // True CVC: consonant - vowel - consonant -> add 'e' (make, take, save, ride, hope, use)
        return stem + 'e';
      }
    } else if (stem.length === 2) {
      // e.g. use -> using, move -> moving (if 2 chars like us -> use)
      const [v, c] = stem.split('');
      if (isVowel(v) && isConsonant(c) && !['w', 'x', 'y'].includes(c)) {
        return stem + 'e';
      }
    }

    // Fallback to standard '-ing' stripping (e.g., 'walking' -> 'walk')
    return stem;
  }

  // 3B: Handle '-ed' Suffixes (word length >= 3)
  if (cleaned.endsWith('ed') && cleaned.length >= 3) {
    // Step 1: Handle '-ied' -> '-y' (e.g., 'carried' -> 'carry', 'hurried' -> 'hurry')
    if (cleaned.endsWith('ied') && cleaned.length >= 4) {
      return cleaned.slice(0, -3) + 'y';
    }

    const stemWithoutEd = cleaned.slice(0, -2);

    // Step 2: Keep 'll' intact (e.g., 'chilled' -> 'chill', 'killed' -> 'kill', 'spilled' -> 'spill')
    if (stemWithoutEd.endsWith('ll')) {
      return stemWithoutEd;
    }

    // Step 3: Strip doubled consonants (e.g., 'stopped' -> 'stop', 'planned' -> 'plan')
    if (
      stemWithoutEd.length >= 2 &&
      stemWithoutEd[stemWithoutEd.length - 1] === stemWithoutEd[stemWithoutEd.length - 2] &&
      stemWithoutEd[stemWithoutEd.length - 1] !== 'l' &&
      stemWithoutEd[stemWithoutEd.length - 1] !== 's' &&
      !['w', 'x', 'y'].includes(stemWithoutEd[stemWithoutEd.length - 1]) &&
      isConsonant(stemWithoutEd[stemWithoutEd.length - 1])
    ) {
      return stemWithoutEd.slice(0, -1);
    }

    // Step 4: Universal Silent 'e' Restoration
    // For all remaining words ending in -ed, strip the suffix to get the stem.
    // If the resulting stem ends in a consonant (and does not end in a double vowel like eed or bleed),
    // always append 'e' back to restore the base form.
    // Examples: "used" -> "use", "saved" -> "save", "punctuated" -> "punctuate",
    // "executed" -> "execute", "danced" -> "dance"
    if (stemWithoutEd.length >= 1) {
      const lastChar = stemWithoutEd[stemWithoutEd.length - 1];

      // Exclude double vowel patterns like "eed" (from "need" -> "needed", "feed" -> "fed", etc.)
      // and "bleed" pattern where the stem already ends in "ee"
      if (stemWithoutEd.endsWith('eed') || stemWithoutEd.endsWith('ee')) {
        return stemWithoutEd;
      }

      // Exclude digraphs intrinsic to non-'e' roots: 'ch', 'sh', 'th', 'ck', 'ss', 'ng', 'gh'
      // e.g., walked -> walk, helped -> help, looked -> look, asked -> ask
      const isDigraph = ['ch', 'sh', 'th', 'ck', 'ss', 'ng', 'gh'].some((dg) => stemWithoutEd.endsWith(dg));
      if (isDigraph) {
        return stemWithoutEd;
      }

      // Exclude words ending in w, x, y (e.g., showed -> show, fixed -> fix, stayed -> stay)
      if (['w', 'x', 'y'].includes(lastChar)) {
        return stemWithoutEd;
      }

      // Soft c / g endings that need silent 'e' restoration
      // e.g., danced -> dance, debounced -> debounce, managed -> manage, changed -> change, forced -> force, judged -> judge
      if (
        stemWithoutEd.endsWith('nc') ||
        stemWithoutEd.endsWith('rc') ||
        stemWithoutEd.endsWith('sc') ||
        stemWithoutEd.endsWith('dg') ||
        stemWithoutEd.endsWith('chang') ||
        stemWithoutEd.endsWith('rang')
      ) {
        return cleaned.slice(0, -1);
      }

      // Consonant + le: 'handled' -> 'handle', 'settled' -> 'settle', 'enabled' -> 'enable'
      // Exclude doubled consonants before 'led' (e.g., 'belled' -> 'bell', 'killed' -> 'kill')
      // But allow 'tt' before 'led' (e.g., 'settled' -> 'settle') since 'tt' is the doubled consonant that was added
      if (cleaned.endsWith('led') && cleaned.length >= 5) {
        const charBeforeLed = cleaned[cleaned.length - 4];
        const charBeforeThat = cleaned.length >= 6 ? cleaned[cleaned.length - 5] : '';
        // Exclude 'l' (double l case handled separately above)
        // Exclude other doubled consonants except 'tt' which is common in past tense
        if (isConsonant(charBeforeLed) && charBeforeLed !== 'l' && (charBeforeLed !== charBeforeThat || charBeforeLed === 't')) {
          return cleaned.slice(0, -1);
        }
      }

      // Handle -uated pattern (e.g., punctuated -> punctuate, situated -> situate)
      if (stemWithoutEd.endsWith('uat')) {
        return cleaned.slice(0, -1);
      }

      // Handle -ated pattern (e.g., created -> create, located -> locate)
      if (stemWithoutEd.endsWith('at')) {
        return cleaned.slice(0, -1);
      }

      // If stem ends in a consonant and has a vowel before it (CVC pattern), restore 'e'
      // This handles: used -> use, saved -> save, hoped -> hope, named -> name
      // But NOT: walked -> walk (no vowel before k), helped -> help (no vowel before p)
      if (isConsonant(lastChar) && stemWithoutEd.length >= 2 && isVowel(stemWithoutEd[stemWithoutEd.length - 2])) {
        // Additional check: if there are two vowels before the consonant, don't add 'e'
        // e.g., cleaned -> clean (ea before n), looked -> look (oo before k)
        if (stemWithoutEd.length >= 3 && isVowel(stemWithoutEd[stemWithoutEd.length - 3])) {
          return stemWithoutEd;
        }
        return stemWithoutEd + 'e';
      }

      // Handle specific patterns where stem ends in consonant-consonant but should restore 'e'
      // e.g., navigated -> navigate (gat -> gate), organized -> organize (giz -> gize)
      // Check for consonant-vowel-consonant pattern at the end
      if (isConsonant(lastChar) && stemWithoutEd.length >= 3) {
        const charBeforeLast = stemWithoutEd[stemWithoutEd.length - 2];
        const charBeforeThat = stemWithoutEd[stemWithoutEd.length - 3];
        // Pattern: consonant (at -3) - vowel (at -2) - consonant (at -1)
        if (isConsonant(charBeforeThat) && isVowel(charBeforeLast)) {
          return stemWithoutEd + 'e';
        }
      }
    }

    // Step 5: Fallback - if stem ends in vowel or is short/irregular, return stem without 'e'
    return stemWithoutEd;
  }

  // 3C: Handle '-s' / '-es' Suffixes (word length > 3, subject to Level 2 protection guard)
  if (!isProtectedFromSStripping && cleaned.endsWith('s') && cleaned.length > 3) {
    // Map '-ies' to '-y' (e.g., 'boundaries' -> 'boundary', 'categories' -> 'category')
    if (cleaned.endsWith('ies') && cleaned.length >= 4) {
      return cleaned.slice(0, -3) + 'y';
    }

    // Precise '-es' Suffix Handling:
    // When processing words ending in '-es', check the character immediately preceding 'e'.
    // If it is part of a sibilant cluster ('ch', 'sh', 'x', 'z', 'ss'), strip the entire '-es' suffix (e.g., 'watches' -> 'watch').
    // If the preceding character is any other consonant (meaning the 'e' is part of the root word, such as in 'coordinates' or 'causes'), strip only the final 's' to correctly preserve the root's silent 'e' (e.g., 'coordinates' -> 'coordinate', 'causes' -> 'cause').
    // If the preceding character is a vowel (e.g., 'goes', 'does'), strip only the final 's' to get the correct base form (e.g., 'goes' -> 'go', 'does' -> 'do').
    if (cleaned.endsWith('es')) {
      const beforeEs = cleaned.slice(0, -2);
      const isSibilantCluster =
        beforeEs.endsWith('ch') ||
        beforeEs.endsWith('sh') ||
        beforeEs.endsWith('ss') ||
        beforeEs.endsWith('x') ||
        beforeEs.endsWith('z');

      if (isSibilantCluster) {
        return beforeEs;
      }

      // Strip only the final 's' for both consonant and vowel cases
      // Consonant: 'e' is part of root (e.g., 'coordinates' -> 'coordinate', 'causes' -> 'cause')
      // Vowel: strip 's' to get base form (e.g., 'goes' -> 'go', 'does' -> 'do')
      return cleaned.slice(0, -1);
    }

    // Fallback to standard single '-s' stripping (e.g., 'cats' -> 'cat')
    return cleaned.slice(0, -1);
  }

  // Default fallback: return cleaned word as base form
  return cleaned;
}

/**
 * Generates an array of lemma candidates for dictionary lookup
 * Primary candidate is the resolved lemma from the pipeline, followed by alternate variations
 */
export function generateLemmaCandidates(word: string): string[] {
  const primaryLemma = lemmatize(word);
  const candidates: string[] = [];

  // Normalize word for comparison to handle case, punctuation, etc.
  const normalizedWord = normalizeSelection(word);

  if (primaryLemma && primaryLemma !== normalizedWord) {
    candidates.push(primaryLemma);
  }

  if (normalizedWord && !candidates.includes(normalizedWord)) {
    candidates.push(normalizedWord);
  }

  // Fallbacks for dictionary lookups
  if (normalizedWord.endsWith('es') && normalizedWord.length > 4) {
    const withoutEs = normalizedWord.slice(0, -2);
    if (!candidates.includes(withoutEs)) candidates.push(withoutEs);
  }
  if (normalizedWord.endsWith('ed') && normalizedWord.length > 4) {
    const withoutEd = normalizedWord.slice(0, -2);
    if (!candidates.includes(withoutEd)) candidates.push(withoutEd);
  }
  if (normalizedWord.endsWith('ing') && normalizedWord.length > 4) {
    const withoutIng = normalizedWord.slice(0, -3);
    if (!candidates.includes(withoutIng)) candidates.push(withoutIng);
  }

  return candidates;
}

/**
 * Formats translation output according to UI specification:
 * - If translation is missing or not found, replaces only the translation portion with "Translation not found"
 * - If cleaned selected word matches resolved base form case-insensitively: "word — translation"
 * - If cleaned selected word differs from base form: "base_form (selected_word) — translation"
 */
export function formatDisplayResult(
  selectedWord: string,
  lemma: string,
  translation?: string | null
): string {
  const cleanSelected = normalizeSelection(selectedWord);
  const cleanLemma = normalizeSelection(lemma);
  const targetTranslation =
    !translation || translation.trim().toLowerCase() === 'translation not found'
      ? 'Translation not found'
      : translation;

  if (!cleanLemma || cleanSelected === cleanLemma) {
    return `${cleanSelected} — ${targetTranslation}`;
  }

  return `${cleanLemma} (${cleanSelected}) — ${targetTranslation}`;
}

