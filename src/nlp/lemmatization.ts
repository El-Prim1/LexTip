import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';
import type { ItemToken, PartOfSpeech } from 'wink-nlp';
import { wordFormIndex, type WordFormAnalysis } from './word-form-index.js';

export type AnalysisSource = 'curated' | 'nlp' | 'fallback';

export interface WordAnalysis {
  surface: string;
  normalized: string;
  lemma: string;
  partOfSpeech: PartOfSpeech | null;
  start: number;
  end: number;
  source: AnalysisSource;
  candidates: WordFormAnalysis[];
  ambiguous: boolean;
}

export interface AnalyzeTextOptions {
  includeUnknown?: boolean;
}

const nlp = winkNLP(model);
const its = nlp.its;

export function normalizeLookupKey(text: string): string {
  return text.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizePossessiveLookupKey(text: string): string {
  return normalizeLookupKey(text)
    .replace(/['’]s$/i, '')
    .replace(/s['’]$/i, '');
}

function isPossessiveSuffix(surface: string): boolean {
  return /^['’]s$/i.test(surface) || /^s['’]$/.test(surface);
}

function chooseCuratedCandidate(
  candidates: WordFormAnalysis[],
  partOfSpeech: PartOfSpeech | null,
  hasContext: boolean,
): WordFormAnalysis | undefined {
  if (candidates.length === 0) return undefined;
  if (!hasContext) return candidates.length === 1 ? candidates[0] : undefined;
  return candidates.find((candidate) => candidate.partOfSpeech === partOfSpeech) ?? candidates[0];
}

function analyzeToken(
  surface: string,
  normalized: string,
  partOfSpeech: PartOfSpeech | null,
  nlpLemma: string,
  isOutOfVocabulary: boolean,
  start: number,
  end: number,
  hasContext: boolean,
): WordAnalysis {
  const candidates = wordFormIndex.get(normalized) ?? [];
  const curated = chooseCuratedCandidate(candidates, partOfSpeech, hasContext);

  if (curated) {
    return {
      surface,
      normalized,
      lemma: curated.lemma,
      partOfSpeech: curated.partOfSpeech,
      start,
      end,
      source: 'curated',
      candidates,
      ambiguous: false,
    };
  }

  if (candidates.length > 1) {
    return {
      surface,
      normalized,
      lemma: normalizeLookupKey(nlpLemma || normalized),
      partOfSpeech,
      start,
      end,
      source: 'curated',
      candidates,
      ambiguous: true,
    };
  }

  const lemma = normalizeLookupKey(nlpLemma || normalized);
  return {
    surface,
    normalized,
    lemma: isOutOfVocabulary ? normalized : lemma,
    partOfSpeech,
    start,
    end,
    source: isOutOfVocabulary ? 'fallback' : 'nlp',
    candidates,
    ambiguous: isOutOfVocabulary,
  };
}

export function analyzeText(text: string, options: AnalyzeTextOptions = {}): WordAnalysis[] {
  if (!text || !text.trim()) return [];

  const doc = nlp.readDoc(text.normalize('NFC'));
  const analyses: WordAnalysis[] = [];
  let searchFrom = 0;
  const hasContext = text.trim().split(/\s+/).length > 1;
  const tokens: Array<{ token: ItemToken; type: string; surface: string }> = [];

  doc.tokens().each((token: ItemToken) => {
    const type = token.out(its.type) as string;
    const surface = token.out(its.value) as string;
    tokens.push({ token, type, surface });
  });

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index];
    if (current.type !== 'word' && !options.includeUnknown) continue;

    const possessive = tokens[index + 1];
    const isPossessive = current.type === 'word'
      && possessive !== undefined
      && isPossessiveSuffix(possessive.surface);
    const surface = isPossessive
      ? `${current.surface}${possessive.surface}`
      : current.surface;
    const start = text.indexOf(surface, searchFrom);
    const safeStart = start >= 0 ? start : searchFrom;
    const end = safeStart + surface.length;
    searchFrom = end;
    const normalized = normalizePossessiveLookupKey(surface);
    const partOfSpeech = current.token.out(its.pos) as PartOfSpeech;
    const nlpLemma = current.token.out(its.lemma as any) as string;

    analyses.push(analyzeToken(
      surface,
      normalized,
      partOfSpeech,
      nlpLemma,
      doc.isOOV(current.surface),
      safeStart,
      end,
      hasContext,
    ));

    if (isPossessive) index += 1;
  }

  return analyses;
}

export function analyzeWord(word: string, context?: string): WordAnalysis | null {
  const input = context ?? word;
  const analyses = analyzeText(input);
  const target = normalizePossessiveLookupKey(word);
  return analyses.find((analysis) => analysis.normalized === target) ?? null;
}
