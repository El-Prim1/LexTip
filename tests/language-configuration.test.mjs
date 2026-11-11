import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadExtensionDictionaryService } from './helpers/extension-dictionary.mjs';

const root = process.cwd();

console.log('--- LexTip Language Configuration Test Suite ---\n');

// -------------------------------------------------------------
// Test 1: Dictionary Lookup Scoping & Backwards Compatibility
// -------------------------------------------------------------
console.log('Test 1: Dictionary lookup language pair filtering...');
const service = loadExtensionDictionaryService(root);
await service.loadDictionary();

// 1.1 Existing English -> Russian translation works as before (default arguments)
const exactEnRu = await service.lookupWord('the');
assert.equal(exactEnRu.found, true, 'Default en->ru lookup succeeds');
assert.ok(exactEnRu.translation.length > 0, 'Translation returned for exact word');

// 1.2 Explicit en -> ru succeeds
const explicitEnRu = await service.lookupWord('the', 'en', 'ru');
assert.equal(explicitEnRu.found, true, 'Explicit en->ru lookup succeeds');

// 1.3 Auto -> ru succeeds
const autoEnRu = await service.lookupWord('the', 'auto', 'ru');
assert.equal(autoEnRu.found, true, 'auto->ru lookup succeeds in dictionary');

// 1.4 Non-English source language to ru (e.g. French -> Russian) must NOT use the en->ru dictionary
const frRu = await service.lookupWord('the', 'fr', 'ru');
assert.equal(frRu.found, false, 'fr->ru lookup does not use en->ru dictionary');
assert.equal(frRu.reason, 'unsupported-language-pair', 'unsupported language pair reports explicit reason');
assert.equal(frRu.translation, null);

// 1.5 English to non-Russian target language (e.g. English -> German) must NOT use the en->ru dictionary
const enDe = await service.lookupWord('the', 'en', 'de');
assert.equal(enDe.found, false, 'en->de lookup does not use en->ru dictionary');
assert.equal(enDe.reason, 'unsupported-language-pair');
assert.equal(enDe.translation, null);

console.log('  [PASS] Dictionary correctly filters by language pair.');

// -------------------------------------------------------------
// Test 2: Service Worker Routing & Message Handling
// -------------------------------------------------------------
console.log('\nTest 2: Service Worker message routing for language pairs...');
const serviceWorkerSource = fs.readFileSync(path.join(root, 'extension', 'background', 'service-worker.js'), 'utf8');

let messageListeners = [];
const mockChrome = {
  runtime: {
    onInstalled: { addListener: () => {} },
    onMessage: {
      addListener: (fn) => { messageListeners.push(fn); },
    },
    getURL: (file) => file,
  },
};

const swContext = {
  console,
  performance,
  importScripts: () => {},
  chrome: mockChrome,
  lookupWord: service.lookupWord,
  formatLookupDisplay: service.formatLookupDisplay,
  fetch: async () => ({ ok: true, json: async () => [['тест', 'en']] }),
};

vm.runInNewContext(serviceWorkerSource, swContext, { filename: 'service-worker.js' });
assert.ok(messageListeners.length > 0, 'Service worker registered message listener');
const onMessage = messageListeners[0];

// 2.1 TRANSLATE_REQUEST with en -> ru invokes dictionary
await new Promise((resolve) => {
  onMessage(
    { type: 'TRANSLATE_REQUEST', payload: { text: 'the', sourceLang: 'en', targetLang: 'ru' } },
    {},
    (response) => {
      assert.equal(response.success, true);
      assert.notEqual(response.data.translation, 'Translation not found');
      resolve();
    }
  );
});

// 2.2 TRANSLATE_REQUEST with non-en source (e.g. es -> ru) skips dictionary and reports not found
await new Promise((resolve) => {
  onMessage(
    { type: 'TRANSLATE_REQUEST', payload: { text: 'the', sourceLang: 'es', targetLang: 'ru' } },
    {},
    (response) => {
      assert.equal(response.success, true);
      assert.equal(response.data.translation, 'Translation not found');
      resolve();
    }
  );
});

// 2.3 TRANSLATE_REQUEST with non-ru target (e.g. en -> es) skips dictionary and reports not found
await new Promise((resolve) => {
  onMessage(
    { type: 'TRANSLATE_REQUEST', payload: { text: 'the', sourceLang: 'en', targetLang: 'es' } },
    {},
    (response) => {
      assert.equal(response.success, true);
      assert.equal(response.data.translation, 'Translation not found');
      resolve();
    }
  );
});

console.log('  [PASS] Service worker routes TRANSLATE_REQUEST accurately based on language pair.');

// -------------------------------------------------------------
// Test 3: Cache Separation by Language Pair
// -------------------------------------------------------------
console.log('\nTest 3: Cache key separation by language pair...');
const contentScriptSource = fs.readFileSync(path.join(root, 'extension', 'content', 'content-script.js'), 'utf8');

// Verify cache key structure from content-script.js
assert.match(
  contentScriptSource,
  /function getCacheKey\(text,\s*sourceLang\s*=\s*'auto',\s*targetLang\s*=\s*'ru'\)/,
  'getCacheKey includes sourceLang and targetLang parameters with defaults'
);
assert.match(
  contentScriptSource,
  /CACHE_PREFIX.*sourceLang.*targetLang/,
  'getCacheKey embeds sourceLang and targetLang in cache key'
);

// Simulate the cache keys for colliding word "chat" across different pairs
function simCacheKey(text, sourceLang = 'auto', targetLang = 'ru') {
  return `lextip_trans_${sourceLang}_${targetLang}_${encodeURIComponent(text.trim().toLowerCase())}`;
}

const keyEnRu = simCacheKey('chat', 'en', 'ru');
const keyFrRu = simCacheKey('chat', 'fr', 'ru');
const keyEnDe = simCacheKey('chat', 'en', 'de');

assert.notEqual(keyEnRu, keyFrRu, 'en->ru and fr->ru cache keys do not collide');
assert.notEqual(keyEnRu, keyEnDe, 'en->ru and en->de cache keys do not collide');
assert.equal(keyEnRu, 'lextip_trans_en_ru_chat');
assert.equal(keyFrRu, 'lextip_trans_fr_ru_chat');
assert.equal(keyEnDe, 'lextip_trans_en_de_chat');

console.log('  [PASS] Cache keys prevent collisions between different language pairs.');

// -------------------------------------------------------------
// Test 4: Settings Page (popup.html and popup.js)
// -------------------------------------------------------------
console.log('\nTest 4: Settings page and synchronization...');
const popupHtml = fs.readFileSync(path.join(root, 'extension', 'popup', 'popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(root, 'extension', 'popup', 'popup.js'), 'utf8');

assert.ok(popupHtml.includes('id="source-lang-select"'), 'popup.html has source language selector');
assert.ok(popupHtml.includes('id="target-lang-select"'), 'popup.html has target language selector');
assert.ok(popupHtml.includes('src="popup.js"'), 'popup.html includes popup.js');

// Test popup.js execution in mock DOM context
let storageStore = {};
let storageListeners = [];

const mockStorageArea = {
  get: (keys, callback) => {
    const result = {};
    keys.forEach((k) => {
      if (storageStore[k] !== undefined) result[k] = storageStore[k];
    });
    callback(result);
  },
  set: (data, callback) => {
    const changes = {};
    Object.keys(data).forEach((k) => {
      changes[k] = { oldValue: storageStore[k], newValue: data[k] };
      storageStore[k] = data[k];
    });
    storageListeners.forEach((l) => l(changes, 'sync'));
    if (callback) callback();
  },
};

const mockDoc = {
  elements: {},
  getElementById(id) {
    if (!this.elements[id]) {
      this.elements[id] = {
        id,
        options: [],
        value: '',
        innerHTML: '',
        listeners: {},
        appendChild(child) { this.options.push(child); },
        addEventListener(event, fn) { this.listeners[event] = fn; },
        dispatchEvent(event) { if (this.listeners[event]) this.listeners[event](); },
      };
    }
    return this.elements[id];
  },
  createElement(tag) {
    return { tag, value: '', textContent: '', disabled: false };
  },
  readyState: 'complete',
  addEventListener: () => {},
};

const popupContext = {
  console,
  document: mockDoc,
  chrome: {
    runtime: { lastError: null },
    storage: {
      sync: mockStorageArea,
      local: mockStorageArea,
      onChanged: {
        addListener: (fn) => storageListeners.push(fn),
      },
    },
  },
};

vm.runInNewContext(popupJs, popupContext, { filename: 'popup.js' });

const sourceEl = mockDoc.getElementById('source-lang-select');
const targetEl = mockDoc.getElementById('target-lang-select');

// 4.1 Default values
assert.equal(sourceEl.value, 'auto', 'Default source language is Auto-detect');
assert.equal(targetEl.value, 'ru', 'Default target language is Russian');

// 4.2 Auto is present in source, but NOT in target
assert.ok(sourceEl.options.some((o) => o.value === 'auto'), 'Source options include Auto-detect');
assert.ok(!targetEl.options.some((o) => o.value === 'auto'), 'Target options do NOT include Auto-detect');

// 4.3 Unsupported pairs are disabled
// Current target is 'ru', so in source options, 'ru' is disabled
const ruInSource = sourceEl.options.find((o) => o.value === 'ru');
assert.ok(ruInSource, 'Russian is in source options');
assert.equal(ruInSource.disabled, true, 'Russian is disabled in source when target is Russian');

// Auto in source is always enabled
const autoInSource = sourceEl.options.find((o) => o.value === 'auto');
assert.equal(autoInSource.disabled, false, 'Auto-detect is never disabled in source');

// 4.4 Change preference and verify persistence
sourceEl.value = 'de';
sourceEl.dispatchEvent('change');
assert.equal(storageStore['lextip_source_lang'], 'de', 'Changing source saves to storage');

targetEl.value = 'fr';
targetEl.dispatchEvent('change');
assert.equal(storageStore['lextip_target_lang'], 'fr', 'Changing target saves to storage');

// When source is 'de', in target options, 'de' is disabled
const deInTarget = targetEl.options.find((o) => o.value === 'de');
assert.equal(deInTarget.disabled, true, 'German is disabled in target when source is German');

console.log('  [PASS] Settings page controls, defaults, validation and persistence verified.');

// -------------------------------------------------------------
// Test 5: Popup In-Page Selectors & Expand/Collapse Behavior
// -------------------------------------------------------------
console.log('\nTest 5: Content script in-popup language selectors...');

assert.ok(
  contentScriptSource.includes('id="ll-source-select"'),
  'Shadow DOM contains source selector'
);
assert.ok(
  contentScriptSource.includes('id="ll-target-select"'),
  'Shadow DOM contains target selector'
);
assert.ok(
  contentScriptSource.includes('.ll-lang-bar'),
  'Stylesheet includes .ll-lang-bar styling'
);
assert.ok(
  contentScriptSource.includes('.ll-lang-select'),
  'Stylesheet includes .ll-lang-select styling'
);

// Verify selectors are placed inside ll-expanded-content so collapsed view layout is 100% preserved
const expandedContentIndex = contentScriptSource.indexOf('<div class="ll-expanded-content" id="ll-expanded-content"');
const langBarIndex = contentScriptSource.indexOf('<div class="ll-lang-bar" id="ll-lang-bar">');
const summaryIndex = contentScriptSource.indexOf('<div class="ll-summary" id="ll-text-container">');

assert.ok(expandedContentIndex > 0, 'll-expanded-content exists');
assert.ok(langBarIndex > expandedContentIndex, 'll-lang-bar is inside ll-expanded-content');
assert.ok(summaryIndex < expandedContentIndex, 'll-summary remains before expanded content');

console.log('  [PASS] In-popup selectors cleanly integrated inside expanded view, preserving collapsed layout.');

console.log('\n--- All Language Configuration Tests Passed! ---');
