import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadExtensionDictionaryService } from './helpers/extension-dictionary.mjs';

const root = process.cwd();
const service = loadExtensionDictionaryService(root);
const serviceWorker = fs.readFileSync(
  path.join(root, 'extension', 'background', 'service-worker.js'),
  'utf8',
);

await service.loadDictionary();
const stats = service.getDictionaryStats();
assert.ok(stats.loaded > 0, 'legacy records are adapted and indexed');
assert.equal(stats.skipped, 0, 'valid legacy records load without skips');

const exact = await service.lookupWord('the');
assert.equal(exact.found, true, 'exact lookup succeeds');
assert.equal(exact.structured.matchType, 'direct', 'exact lookup uses direct match');
assert.ok(Array.isArray(exact.structured.matches), 'grouped index returns match collection');

const inflected = await service.lookupWord('handles');
assert.equal(inflected.found, true, 'lemma lookup succeeds');
assert.equal(inflected.lemma, 'handle', 'lemma lookup uses the NLP result');

const possessive = await service.lookupWord("government's");
assert.equal(possessive.found, true, 'possessive lookup succeeds');
assert.equal(possessive.lemma, 'government', 'possessive lookup uses the base lemma');

const phrase = await service.lookupWord('take on');
assert.equal(phrase.found, false, 'unknown phrase is not fuzzy-matched');
assert.equal(phrase.structured.reason, 'phrase-not-found', 'phrase miss has an explicit reason');

assert.match(serviceWorker, /performance\.now\(\)/, 'service worker measures latency');
assert.match(serviceWorker, /return true/, 'service worker keeps async message ports open');
assert.match(serviceWorker, /nlp-runtime\.js/, 'service worker loads the NLP runtime');

console.log('Phase 2.2 current-architecture verification passed.');
