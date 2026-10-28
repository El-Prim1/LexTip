import {
  STATISTICAL_DICTIONARY_SOURCE,
  type AdaptedDictionaryResult,
  type DictionaryEntry,
  type LegacyDictionaryRecord,
  type TranslationAlternative,
} from './model.js';

const DEFAULT_SOURCE_LANGUAGE = 'en';
const DEFAULT_TARGET_LANGUAGE = 'ru';
const LEGACY_SOURCE = 'legacy-json';

export interface LegacyAdapterOptions {
  sourceLanguage?: string;
  targetLanguage?: string;
  source?: string;
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

function createTranslation(
  entryId: string,
  translation: string,
  probability?: number,
  count?: number,
): TranslationAlternative {
  return {
    id: `${entryId}:translation`,
    text: translation,
    ...(probability === undefined ? {} : { probability }),
    ...(count === undefined ? {} : { count }),
  };
}

export function adaptLegacyDictionary(
  records: unknown,
  options: LegacyAdapterOptions = {},
): AdaptedDictionaryResult {
  const sourceLanguage = options.sourceLanguage ?? DEFAULT_SOURCE_LANGUAGE;
  const targetLanguage = options.targetLanguage ?? DEFAULT_TARGET_LANGUAGE;
  const source = options.source ?? LEGACY_SOURCE;
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

    const probability = candidate?.probability;
    const count = candidate?.count;
    const statisticalProbability = typeof probability === 'number'
      && Number.isFinite(probability)
      && probability >= 0
      && probability <= 1
      ? probability
      : undefined;
    const statisticalCount = typeof count === 'number'
      && Number.isSafeInteger(count)
      && count > 0
      ? count
      : undefined;
    if (source === STATISTICAL_DICTIONARY_SOURCE
      && (statisticalProbability === undefined || statisticalCount === undefined)) {
      skipped.push({ index, reason: 'Invalid statistical translation metadata' });
      return;
    }

    const identity = `${index}|${sourceLanguage}|${targetLanguage}|${lemma}|${translation}`;
    const entryId = source === LEGACY_SOURCE
      ? `legacy-entry-${stableHash(identity)}`
      : `statistical-entry-${stableHash(`${source}|${identity}`)}`;
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
        translations: [createTranslation(
          senseId,
          translation,
          source === STATISTICAL_DICTIONARY_SOURCE ? statisticalProbability : undefined,
          source === STATISTICAL_DICTIONARY_SOURCE ? statisticalCount : undefined,
        )],
      }],
      source,
      verificationStatus: 'unverified',
    });
  });

  return { entries, skipped };
}
