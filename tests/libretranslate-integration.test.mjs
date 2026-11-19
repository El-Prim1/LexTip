import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const serviceWorkerSource = fs.readFileSync(
  path.join(root, 'extension', 'background', 'service-worker.js'),
  'utf8',
);

console.log('--- LexTip LibreTranslate Integration Test Suite ---\n');

let messageListeners = [];
const requests = [];
let nextLanguagesResponse = {
  ok: true,
  status: 200,
  json: async () => [
    { code: 'en', name: 'English', targets: ['ru'] },
    { code: 'ru', name: 'Russian', targets: ['en'] },
  ],
};
let nextTranslateResponse = {
  ok: true,
  status: 200,
  json: async () => ({
    translatedText: 'привет',
    detectedLanguage: { confidence: 99, language: 'en' },
  }),
};

const mockChrome = {
  runtime: {
    onInstalled: { addListener: () => {} },
    onMessage: { addListener: (fn) => { messageListeners.push(fn); } },
    getURL: (file) => file,
  },
};

const context = {
  console,
  performance,
  setTimeout,
  clearTimeout,
  AbortController,
  importScripts: () => {},
  chrome: mockChrome,
  lookupWord: async () => ({ found: false, lemma: '', selectedWord: '' }),
  formatLookupDisplay: () => '',
  LEXTIP_CONFIG: {
    libretranslateBaseUrl: 'https://lt.example.test/',
    libretranslateApiKey: 'test-api-key',
  },
  fetch: async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).endsWith('/languages')) return nextLanguagesResponse;
    if (String(url).endsWith('/translate')) return nextTranslateResponse;
    throw new Error(`Unexpected URL: ${url}`);
  },
};

vm.runInNewContext(serviceWorkerSource, context, { filename: 'service-worker.js' });
assert.ok(messageListeners.length > 0, 'Service worker registered a message listener');
const onMessage = messageListeners[0];

function sendMessage(message) {
  return new Promise((resolve) => {
    onMessage(message, {}, resolve);
  });
}

// -------------------------------------------------------------
// Test 1: Supported-language discovery from /languages
// -------------------------------------------------------------
console.log('Test 1: Supported-language discovery...');
const languagesResponse = await sendMessage({ type: 'LIBRETRANSLATE_LANGUAGES_REQUEST' });
assert.equal(languagesResponse.success, true, 'languages request succeeds');
assert.equal(languagesResponse.data.length, 2, 'languages list is returned');
assert.deepEqual(languagesResponse.data.map((l) => l.code), ['en', 'ru']);
const languagesRequest = requests.find((r) => r.url.endsWith('/languages'));
assert.ok(languagesRequest, 'languages endpoint was requested');
assert.equal(languagesRequest.url, 'https://lt.example.test/languages', 'base URL is normalized without trailing slash');
assert.equal(languagesRequest.options.method, 'GET', 'languages request uses GET');

// A second request is served from the short-lived cache.
const beforeCachedCount = requests.filter((r) => r.url.endsWith('/languages')).length;
const cachedResponse = await sendMessage({ type: 'LIBRETRANSLATE_LANGUAGES_REQUEST' });
const afterCachedCount = requests.filter((r) => r.url.endsWith('/languages')).length;
assert.equal(cachedResponse.success, true);
assert.equal(afterCachedCount, beforeCachedCount, 'languages response is cached between calls');
console.log('  [PASS] LibreTranslate languages are discovered and cached.');

// -------------------------------------------------------------
// Test 2: /translate request format and auto-detection response
// -------------------------------------------------------------
console.log('\nTest 2: Translation request format and auto-detection...');
const autoResponse = await sendMessage({
  type: 'LIBRETRANSLATE_REQUEST',
  payload: { text: 'hello', sourceLang: 'auto', targetLang: 'ru' },
});
assert.equal(autoResponse.success, true, 'translate request succeeds');
assert.equal(autoResponse.data.translation, 'привет');
assert.equal(autoResponse.data.detectedSourceLang, 'en', 'detected language is surfaced');

const translateRequest = requests.filter((r) => r.url.endsWith('/translate')).at(-1);
assert.equal(translateRequest.url, 'https://lt.example.test/translate', 'translate endpoint URL is correct');
assert.equal(translateRequest.options.method, 'POST', 'translate request uses POST');
assert.equal(translateRequest.options.headers['Content-Type'], 'application/json');
const body = JSON.parse(translateRequest.options.body);
assert.equal(body.q, 'hello', 'q carries the selected text');
assert.equal(body.source, 'auto', 'source is forwarded');
assert.equal(body.target, 'ru', 'target is forwarded');
assert.equal(body.format, 'text', 'text format is requested');
assert.equal(body.api_key, 'test-api-key', 'optional API key is forwarded when configured');
console.log('  [PASS] LibreTranslate request payload and response parsing are correct.');

// -------------------------------------------------------------
// Test 3: Manual source is preserved when the server omits detection
// -------------------------------------------------------------
console.log('\nTest 3: Manual source language...');
nextTranslateResponse = {
  ok: true,
  status: 200,
  json: async () => ({ translatedText: 'bonjour' }),
};
const manualResponse = await sendMessage({
  type: 'LIBRETRANSLATE_REQUEST',
  payload: { text: 'hello', sourceLang: 'fr', targetLang: 'ru' },
});
assert.equal(manualResponse.success, true);
assert.equal(manualResponse.data.translation, 'bonjour');
assert.equal(manualResponse.data.detectedSourceLang, 'fr', 'manual source is preserved');
console.log('  [PASS] Manual source language is preserved.');

// -------------------------------------------------------------
// Test 4: Identical source and target short-circuits without a request
// -------------------------------------------------------------
console.log('\nTest 4: Identical source and target...');
const beforeShortCircuit = requests.length;
const samePair = await sendMessage({
  type: 'LIBRETRANSLATE_REQUEST',
  payload: { text: 'hello', sourceLang: 'en', targetLang: 'en' },
});
assert.equal(samePair.success, true);
assert.equal(samePair.data.translation, 'hello');
assert.equal(requests.length, beforeShortCircuit, 'no network request for identical languages');
console.log('  [PASS] Identical language pair returns the text unchanged.');

// -------------------------------------------------------------
// Test 5: Backend error handling
// -------------------------------------------------------------
console.log('\nTest 5: Backend error handling...');
nextTranslateResponse = {
  ok: false,
  status: 400,
  json: async () => ({ error: 'Unsupported language pair' }),
};
const errorResponse = await sendMessage({
  type: 'LIBRETRANSLATE_REQUEST',
  payload: { text: 'hello', sourceLang: 'en', targetLang: 'xx' },
});
assert.equal(errorResponse.success, false, 'backend errors are reported');
assert.match(errorResponse.error, /400/, 'status code is included');
assert.match(errorResponse.error, /Unsupported language pair/, 'backend error detail is included');

nextTranslateResponse = {
  ok: true,
  status: 200,
  json: async () => ({ translatedText: '' }),
};
const emptyResponse = await sendMessage({
  type: 'LIBRETRANSLATE_REQUEST',
  payload: { text: 'hello', sourceLang: 'en', targetLang: 'ru' },
});
assert.equal(emptyResponse.success, false, 'empty translations are rejected');
assert.match(emptyResponse.error, /Empty translation/, 'empty translation error is clear');
console.log('  [PASS] HTTP and empty-response errors are handled.');

// -------------------------------------------------------------
// Test 6: Network failure handling
// -------------------------------------------------------------
console.log('\nTest 6: Network failure handling...');
const originalFetch = context.fetch;
context.fetch = async () => {
  throw new Error('network down');
};
const networkResponse = await sendMessage({
  type: 'LIBRETRANSLATE_REQUEST',
  payload: { text: 'hello', sourceLang: 'auto', targetLang: 'ru' },
});
context.fetch = originalFetch;
assert.equal(networkResponse.success, false, 'network failures are reported');
assert.match(networkResponse.error, /network down/);
console.log('  [PASS] Network failures are surfaced to the caller.');

console.log('\n--- All LibreTranslate Integration Tests Passed! ---');
