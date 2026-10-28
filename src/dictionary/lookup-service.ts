import { analyzeWord, normalizeLookupKey, type WordAnalysis } from '../nlp/lemmatization.js';
import {
  STATISTICAL_DICTIONARY_SOURCE,
  type DictionaryEntry,
  type DictionaryPartOfSpeech,
} from './model.js';
import type { DictionaryRepository } from './repository.js';

export interface LookupOptions {
  analysis?: WordAnalysis | null;
}

export interface LemmaCandidate {
  lemma: string;
  partOfSpeech: DictionaryPartOfSpeech | null;
}

export interface LookupMatch {
  entry: DictionaryEntry;
  lemma: string;
  partOfSpeech: DictionaryPartOfSpeech;
  score: number;
}

interface LookupResultBase {
  originalText: string;
  normalizedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  lemmaCandidates: LemmaCandidate[];
  ambiguous: boolean;
}

export interface FoundLookupResult extends LookupResultBase {
  found: true;
  matchType: 'phrase' | 'direct' | 'lemma';
  matches: LookupMatch[];
}

export interface NotFoundLookupResult extends LookupResultBase {
  found: false;
  reason: 'empty-input' | 'phrase-not-found' | 'word-not-found';
  matches: [];
}

export type LookupResult = FoundLookupResult | NotFoundLookupResult;

function normalizeLookupText(text: string): string {
  return normalizeLookupKey(text)
    .replace(/^[\s\[\]{}()<>"“”‘’.,;:!?_—–#*~]+/, '')
    .replace(/[\s\[\]{}()<>"“”‘’.,;:!?_—–#*~]+$/, '');
}

function candidateKey(candidate: LemmaCandidate): string {
  return `${candidate.lemma}:${candidate.partOfSpeech ?? ''}`;
}

function getLemmaCandidates(analysis: WordAnalysis | null): LemmaCandidate[] {
  if (!analysis) return [];

  const candidates: LemmaCandidate[] = [];
  const add = (lemma: string, partOfSpeech: DictionaryPartOfSpeech | null): void => {
    const normalizedLemma = normalizeLookupKey(lemma);
    if (!normalizedLemma) return;
    const candidate = { lemma: normalizedLemma, partOfSpeech };
    if (!candidates.some((existing) => candidateKey(existing) === candidateKey(candidate))) {
      candidates.push(candidate);
    }
  };

  add(analysis.lemma, analysis.partOfSpeech);
  for (const candidate of analysis.candidates) {
    add(candidate.lemma, candidate.partOfSpeech);
  }

  return candidates;
}

function rankMatch(
  entry: DictionaryEntry,
  candidate: LemmaCandidate,
  directMatch: boolean,
): LookupMatch {
  const posMatch = candidate.partOfSpeech !== null
    && entry.partOfSpeech !== 'UNKNOWN'
    && entry.partOfSpeech === candidate.partOfSpeech;

  return {
    entry,
    lemma: candidate.lemma,
    partOfSpeech: entry.partOfSpeech,
    score: (posMatch ? 20 : 0) + (directMatch ? 5 : 0),
  };
}

function deduplicateMatches(matches: LookupMatch[]): LookupMatch[] {
  const unique = new Map<string, LookupMatch>();
  for (const match of matches) {
    const current = unique.get(match.entry.id);
    if (!current || match.score > current.score) unique.set(match.entry.id, match);
  }
  return [...unique.values()].sort((left, right) => {
    const leftImported = left.entry.source === STATISTICAL_DICTIONARY_SOURCE;
    const rightImported = right.entry.source === STATISTICAL_DICTIONARY_SOURCE;
    if (leftImported !== rightImported) return leftImported ? 1 : -1;
    if (left.score !== right.score) return right.score - left.score;

    if (leftImported && rightImported) {
      const leftTranslation = left.entry.senses[0]?.translations[0];
      const rightTranslation = right.entry.senses[0]?.translations[0];
      const probabilityDifference = (rightTranslation?.probability ?? 0)
        - (leftTranslation?.probability ?? 0);
      if (probabilityDifference !== 0) return probabilityDifference;
      const countDifference = (rightTranslation?.count ?? 0) - (leftTranslation?.count ?? 0);
      if (countDifference !== 0) return countDifference;
      const leftText = normalizeLookupKey(leftTranslation?.text ?? '');
      const rightText = normalizeLookupKey(rightTranslation?.text ?? '');
      if (leftText !== rightText) return leftText < rightText ? -1 : 1;
    }

    return 0;
  });
}

export function lookupTranslation(
  repository: DictionaryRepository,
  text: string | null | undefined,
  sourceLanguage: string,
  targetLanguage: string,
  options: LookupOptions = {},
): LookupResult {
  const originalText = text ?? '';
  const normalizedText = normalizeLookupText(originalText);
  const baseResult = {
    originalText,
    normalizedText,
    sourceLanguage,
    targetLanguage,
    lemmaCandidates: [] as LemmaCandidate[],
    ambiguous: false,
  };

  if (!normalizedText) {
    return { ...baseResult, found: false, reason: 'empty-input', matches: [] };
  }

  if (normalizedText.includes(' ')) {
    const phraseEntries = repository.findByPhrase(normalizedText, sourceLanguage, targetLanguage);
    const matches = phraseEntries.map((entry) => ({
      entry,
      lemma: entry.lemma,
      partOfSpeech: entry.partOfSpeech,
      score: 20,
    }));

    if (matches.length > 0) {
      return {
        ...baseResult,
        found: true,
        matchType: 'phrase',
        matches: deduplicateMatches(matches),
      };
    }

    return { ...baseResult, found: false, reason: 'phrase-not-found', matches: [] };
  }

  const analysis = options.analysis === undefined ? analyzeWord(originalText) : options.analysis;
  const lemmaCandidates = getLemmaCandidates(analysis);
  if (!lemmaCandidates.some((candidate) => candidate.lemma === normalizedText)) {
    lemmaCandidates.unshift({ lemma: normalizedText, partOfSpeech: null });
  }

  const matches = lemmaCandidates.flatMap((candidate) => (
    repository.findByLemma(candidate.lemma, sourceLanguage, targetLanguage)
      .map((entry) => rankMatch(entry, candidate, candidate.lemma === normalizedText))
  ));
  const uniqueMatches = deduplicateMatches(matches);

  if (uniqueMatches.length === 0) {
    return {
      ...baseResult,
      lemmaCandidates,
      ambiguous: Boolean(analysis?.ambiguous),
      found: false,
      reason: 'word-not-found',
      matches: [],
    };
  }

  return {
    ...baseResult,
    lemmaCandidates,
    ambiguous: Boolean(analysis?.ambiguous || lemmaCandidates.length > 1),
    found: true,
    matchType: uniqueMatches.some((match) => match.lemma === normalizedText) ? 'direct' : 'lemma',
    matches: uniqueMatches,
  };
}
