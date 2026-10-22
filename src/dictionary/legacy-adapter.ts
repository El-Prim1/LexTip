import type {
  AdaptedDictionaryResult,
  DictionaryEntry,
  LegacyDictionaryRecord,
  TranslationAlternative,
} from './model.js';

const DEFAULT_SOURCE_LANGUAGE = 'en';
const DEFAULT_TARGET_LANGUAGE = 'ru';
const LEGACY_SOURCE = 'legacy-json';

export interface LegacyAdapterOptions {
  sourceLanguage?: string;
  targetLanguage?: string;
}

export function normalizeDictionaryKey(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createTranslation(entryId: string, translation: string): TranslationAlternative {
  return {
    id: `${entryId}:translation`,
    text: translation,
  };
}

export function adaptLegacyDictionary(
  records: unknown,
  options: LegacyAdapterOptions = {},
): AdaptedDictionaryResult {
  const sourceLanguage = options.sourceLanguage ?? DEFAULT_SOURCE_LANGUAGE;
  const targetLanguage = options.targetLanguage ?? DEFAULT_TARGET_LANGUAGE;
  const entries: DictionaryEntry[] = [];
  const skipped: Array<{ index: number; reason: string }> = [];

  if (!Array.isArray(records)) {
    return { entries, skipped: [{ index: -1, reason: 'Dictionary data is not an array' }] };
  }

  records.forEach((record: unknown, index) => {
    const candidate = record as LegacyDictionaryRecord | null;
    const word = typeof candidate?.word === 'string' ? candidate.word : '';
    const translation = typeof candidate?.translation === 'string' ? candidate.translation : '';
    const lemma = normalizeDictionaryKey(word);

    if (!lemma) {
      skipped.push({ index, reason: 'Missing word' });
      return;
    }

    if (!translation.trim()) {
      skipped.push({ index, reason: 'Missing translation' });
      return;
    }

    const entryId = `legacy-entry-${stableHash(
      `${index}|${sourceLanguage}|${targetLanguage}|${lemma}|${translation}`,
    )}`;
    const senseId = `${entryId}:sense-1`;

    entries.push({
      id: entryId,
      sourceLanguage,
      targetLanguage,
      lemma,
      entryType: lemma.includes(' ') ? 'phrase' : 'word',
      partOfSpeech: 'UNKNOWN',
      senses: [{
        id: senseId,
        translations: [createTranslation(senseId, translation)],
      }],
      source: LEGACY_SOURCE,
      verificationStatus: 'unverified',
    });
  });

  return { entries, skipped };
}
