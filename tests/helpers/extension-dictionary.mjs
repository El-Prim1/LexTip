import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export function loadExtensionDictionaryService(root = process.cwd()) {
  const dictionaryData = JSON.parse(fs.readFileSync(
    path.join(root, 'extension', 'dictionaries', 'english-russian-dictionary.json'),
    'utf8',
  ));
  const nlpRuntimeSource = fs.readFileSync(
    path.join(root, 'extension', 'background', 'nlp-runtime.js'),
    'utf8',
  );
  const serviceSource = fs.readFileSync(
    path.join(root, 'extension', 'background', 'dictionary-service.js'),
    'utf8',
  );
  const context = {
    console,
    performance,
    atob,
    module: { exports: {} },
    chrome: { runtime: { getURL: (file) => file } },
    fetch: async () => ({ json: async () => dictionaryData }),
  };

  vm.runInNewContext(nlpRuntimeSource, context, { filename: 'nlp-runtime.js' });
  vm.runInNewContext(serviceSource, context, { filename: 'dictionary-service.js' });
  return context.module.exports;
}
