import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const backend = path.join(root, 'lex-tip-backend');
const read = (file) => fs.readFileSync(path.join(backend, file), 'utf8');

console.log('--- LexTip Backend Deployment Configuration Test Suite ---\n');

// -------------------------------------------------------------
// Test 1: Required deployment files exist
// -------------------------------------------------------------
console.log('Test 1: Required deployment files...');
const requiredFiles = [
  'render.yaml',
  'Dockerfile',
  'docker-compose.yml',
  '.env.example',
  '.gitignore',
  '.dockerignore',
  'README.md',
];
requiredFiles.forEach((file) => {
  assert.ok(fs.existsSync(path.join(backend, file)), `${file} exists`);
});
console.log('  [PASS] All deployment files are present.');

// -------------------------------------------------------------
// Test 2: Render configuration
// -------------------------------------------------------------
console.log('\nTest 2: Render configuration...');
const renderYaml = read('render.yaml');
assert.match(renderYaml, /type:\s*web/, 'Render service is a web service');
assert.match(renderYaml, /runtime:\s*docker/, 'Render service runs Docker');
assert.match(renderYaml, /dockerfilePath:/, 'Render uses the Dockerfile');
assert.match(renderYaml, /healthCheckPath:\s*\/languages/, 'health check uses /languages');
assert.match(renderYaml, /LT_LOAD_ONLY/, 'language set is configured');
assert.match(renderYaml, /LT_DISABLE_WEB_UI/, 'demo UI can be disabled');
assert.doesNotMatch(renderYaml, /gsk_[A-Za-z0-9]/, 'no Groq key is committed');
assert.doesNotMatch(renderYaml, /AQ\.[A-Za-z0-9]/, 'no Google key is committed');
console.log('  [PASS] render.yaml is complete and contains no secrets.');

// -------------------------------------------------------------
// Test 3: Docker image is pinned
// -------------------------------------------------------------
console.log('\nTest 3: Pinned LibreTranslate image...');
const dockerfile = read('Dockerfile');
const fromLine = dockerfile.split(/\r?\n/).find((line) => line.trim().startsWith('FROM '));
assert.ok(fromLine, 'Dockerfile has a FROM instruction');
assert.match(fromLine, /libretranslate\/libretranslate:v?[0-9]+\.[0-9]+\.[0-9]+/, 'image uses a pinned semantic version');
assert.doesNotMatch(fromLine, /:latest\b/, 'image is not floating on latest');
assert.match(dockerfile, /PORT/, 'container binds to Render PORT');
assert.match(dockerfile, /ENTRYPOINT\s*\[\s*\]/, 'upstream entrypoint is reset so PORT is honored');
console.log('  [PASS] LibreTranslate image is pinned and binds to PORT.');

// -------------------------------------------------------------
// Test 4: Environment example and gitignore
// -------------------------------------------------------------
console.log('\nTest 4: Environment and ignore rules...');
const envExample = read('.env.example');
assert.match(envExample, /LT_LOAD_ONLY/, '.env.example documents the language set');
assert.match(envExample, /LT_DISABLE_WEB_UI/, '.env.example documents the UI flag');
assert.doesNotMatch(envExample, /gsk_[A-Za-z0-9]/, '.env.example has no real key');
assert.doesNotMatch(envExample, /AQ\.[A-Za-z0-9]/, '.env.example has no real key');

const gitignore = read('.gitignore');
assert.match(gitignore, /^\.env$/m, '.env is ignored');
assert.match(gitignore, /^data\/$/m, 'local data is ignored');
console.log('  [PASS] Environment example is documented and secrets are ignored.');

// -------------------------------------------------------------
// Test 5: README covers the manual deployment workflow
// -------------------------------------------------------------
console.log('\nTest 5: Deployment documentation...');
const readme = read('README.md');
assert.match(readme, /GitHub/i, 'README covers GitHub upload');
assert.match(readme, /Render/i, 'README covers Render deployment');
assert.match(readme, /\/translate/, 'README documents the translate endpoint');
assert.match(readme, /\/languages/, 'README documents the languages endpoint');
assert.match(readme, /LT_LOAD_ONLY/, 'README documents language configuration');
console.log('  [PASS] README documents setup, deployment and configuration.');

// -------------------------------------------------------------
// Test 6: Extension no longer uses the unofficial Google endpoint
// -------------------------------------------------------------
console.log('\nTest 6: Extension integration...');
const serviceWorker = fs.readFileSync(
  path.join(root, 'extension', 'background', 'service-worker.js'),
  'utf8',
);
const contentScript = fs.readFileSync(
  path.join(root, 'extension', 'content', 'content-script.js'),
  'utf8',
);
const configSource = fs.readFileSync(
  path.join(root, 'extension', 'config', 'libretranslate.config.js'),
  'utf8',
);

assert.match(serviceWorker, /LIBRETRANSLATE_REQUEST/, 'service worker handles LibreTranslate requests');
assert.match(serviceWorker, /LIBRETRANSLATE_LANGUAGES_REQUEST/, 'service worker discovers languages');
assert.match(serviceWorker, /\/translate`,/, 'service worker calls the LibreTranslate /translate endpoint');
assert.match(serviceWorker, /\/languages`,/, 'service worker calls the LibreTranslate /languages endpoint');
assert.doesNotMatch(serviceWorker, /clients5\.google\.com/, 'unofficial Google endpoint is removed');
assert.doesNotMatch(serviceWorker, /GOOGLE_TRANSLATE_REQUEST/, 'Google message type is removed');

assert.match(contentScript, /LIBRETRANSLATE_REQUEST/, 'content script uses LibreTranslate');
assert.doesNotMatch(contentScript, /GOOGLE_TRANSLATE_REQUEST/, 'content script no longer uses Google');
assert.match(contentScript, /sourceLang.*targetLang.*encodeURIComponent/, 'cache key includes source and target');

assert.match(configSource, /libretranslateBaseUrl/, 'deployment URL lives in a config file');
assert.match(configSource, /libretranslateApiKey/, 'optional API key lives in the config file');
console.log('  [PASS] Extension is wired to LibreTranslate via external configuration.');

console.log('\n--- All Backend Deployment Tests Passed! ---');
