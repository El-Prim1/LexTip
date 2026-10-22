import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = process.cwd();
const temporaryDirectory = fs.mkdtempSync(path.join(projectRoot, '.tmp-nlp-test-'));
const tscPath = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const testOutput = path.join(temporaryDirectory, 'tests', 'lemmatization.test.js');
fs.writeFileSync(
  path.join(temporaryDirectory, 'package.json'),
  JSON.stringify({ type: 'module' }),
  'utf8',
);

const compilerArguments = [
  'tests/lemmatization.test.ts',
  'src/nlp/lemmatization.ts',
  'src/nlp/word-form-index.ts',
  '--ignoreConfig',
  '--module', 'Node16',
  '--target', 'ES2022',
  '--esModuleInterop',
  '--moduleResolution', 'Node16',
  '--types', 'node',
  '--skipLibCheck',
  '--outDir', temporaryDirectory,
];

try {
  execFileSync(process.execPath, [tscPath, ...compilerArguments], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  execFileSync(process.execPath, [testOutput], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
