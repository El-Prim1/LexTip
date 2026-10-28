import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';

const DATASET_REVISION = 'c1220e8a63b95bb94fa914160b91d6954d3b7f2c';
const DATASET_URL = `https://huggingface.co/datasets/KvaytG/en-ru-statistical-dict-20m-corpus/resolve/${DATASET_REVISION}/dictionary.parquet`;
const DATASET_SHA256 = 'bb81cbbe3cb12d8cbed0400efa42ee1d44782a227aa03efe647b9a3a797dd0c8';
const EXPECTED_ROWS = 56_624;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacyPath = path.join(root, 'extension/dictionaries/english-russian-dictionary.json');
const argumentsList = process.argv.slice(2);
function argumentValue(name) {
  const index = argumentsList.indexOf(name);
  if (index === -1) return undefined;
  const value = argumentsList[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

const requestedOutputPath = argumentValue('--output');
const inputPath = argumentValue('--input');
const outputPath = requestedOutputPath
  ? path.resolve(requestedOutputPath)
  : path.join(root, 'extension/dictionaries/statistical-en-russian-dictionary.json');

function normalizeTypeScript(value) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeExtension(value) {
  return normalizeTypeScript(value)
    .replace(/^[\s\[\]{}()<>"“”‘’.,;:!?_—–#*~]+/, '')
    .replace(/[\s\[\]{}()<>"“”‘’.,;:!?_—–#*~]+$/, '');
}

function pairKey(english, russian) {
  return JSON.stringify([english, russian]);
}

function compareText(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function validateRecord(row, index) {
  if (typeof row.english_word !== 'string' || !row.english_word.trim()) {
    throw new Error(`Invalid english_word at Parquet row ${index}`);
  }
  if (typeof row.russian_word !== 'string' || !row.russian_word.trim()) {
    throw new Error(`Invalid russian_word at Parquet row ${index}`);
  }
  const count = typeof row.count === 'bigint' ? Number(row.count) : row.count;
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error(`Invalid count at Parquet row ${index}`);
  }
  if (!Number.isFinite(row.probability) || row.probability < 0 || row.probability > 1) {
    throw new Error(`Invalid probability at Parquet row ${index}`);
  }
  return count;
}

async function loadVerifiedParquet() {
  if (inputPath) {
    return { bytes: await readFile(path.resolve(inputPath)), source: path.resolve(inputPath) };
  }

  const response = await fetch(DATASET_URL);
  if (!response.ok) {
    throw new Error(`Dataset download failed: HTTP ${response.status} ${response.statusText}`);
  }
  return { bytes: Buffer.from(await response.arrayBuffer()), source: DATASET_URL };
}

async function main() {
  const startedAt = performance.now();
  if (inputPath && path.resolve(inputPath) === outputPath) {
    throw new Error('Input and output paths must be different');
  }
  const { bytes, source } = await loadVerifiedParquet();
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== DATASET_SHA256) {
    throw new Error(`Dataset SHA-256 mismatch: expected ${DATASET_SHA256}, got ${actualHash}`);
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'lextip-dictionary-'));
  const parquetPath = path.join(tempDir, 'dictionary.parquet');
  const temporaryOutputPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.tmp`);

  try {
    await writeFile(parquetPath, bytes);
    const parquet = await asyncBufferFromFile(parquetPath);
    const rows = await parquetReadObjects({ file: parquet });
    if (rows.length !== EXPECTED_ROWS) {
      throw new Error(`Unexpected dataset row count: expected ${EXPECTED_ROWS}, got ${rows.length}`);
    }

    const expectedColumns = ['english_word', 'russian_word', 'count', 'probability'];
    const actualColumns = Object.keys(rows[0] ?? {});
    if (JSON.stringify(actualColumns) !== JSON.stringify(expectedColumns)) {
      throw new Error(`Unexpected dataset schema: ${actualColumns.join(', ')}`);
    }

    const legacy = JSON.parse(await readFile(legacyPath, 'utf8'));
    if (!Array.isArray(legacy)) {
      throw new Error('Canonical dictionary is not an array');
    }

    const legacyTypeScriptPairs = new Set();
    const legacyExtensionPairs = new Set();
    const legacyTypeScriptAlternatives = new Set();
    const legacyExtensionAlternatives = new Set();
    for (const record of legacy) {
      if (typeof record.word !== 'string' || typeof record.translation !== 'string') continue;
      const englishTypeScript = normalizeTypeScript(record.word);
      const englishExtension = normalizeExtension(record.word);
      legacyTypeScriptPairs.add(pairKey(englishTypeScript, normalizeTypeScript(record.translation)));
      legacyExtensionPairs.add(pairKey(englishExtension, normalizeExtension(record.translation)));
      for (const alternative of record.translation.split(',')) {
        if (!alternative.trim()) continue;
        legacyTypeScriptAlternatives.add(pairKey(englishTypeScript, normalizeTypeScript(alternative)));
        legacyExtensionAlternatives.add(pairKey(englishExtension, normalizeExtension(alternative)));
      }
    }

    const importedRecords = [];
    const seenExactRows = new Set();
    let skippedLegacyOverlaps = 0;
    let removedExactDuplicates = 0;
    const overlaps = {
      typescript: { wholeTranslation: 0, commaSeparatedAlternative: 0 },
      extension: { wholeTranslation: 0, commaSeparatedAlternative: 0 },
    };
    const lemmas = new Set();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const count = validateRecord(row, index);
      const typeScriptPair = pairKey(
        normalizeTypeScript(row.english_word),
        normalizeTypeScript(row.russian_word),
      );
      const extensionPair = pairKey(
        normalizeExtension(row.english_word),
        normalizeExtension(row.russian_word),
      );
      const overlapsTypeScript = legacyTypeScriptPairs.has(typeScriptPair)
        || legacyTypeScriptAlternatives.has(typeScriptPair);
      const overlapsExtension = legacyExtensionPairs.has(extensionPair)
        || legacyExtensionAlternatives.has(extensionPair);
      if (legacyTypeScriptPairs.has(typeScriptPair)) overlaps.typescript.wholeTranslation += 1;
      else if (legacyTypeScriptAlternatives.has(typeScriptPair)) {
        overlaps.typescript.commaSeparatedAlternative += 1;
      }
      if (legacyExtensionPairs.has(extensionPair)) overlaps.extension.wholeTranslation += 1;
      else if (legacyExtensionAlternatives.has(extensionPair)) {
        overlaps.extension.commaSeparatedAlternative += 1;
      }
      if (overlapsTypeScript || overlapsExtension) {
        skippedLegacyOverlaps += 1;
        continue;
      }

      const exactRowKey = JSON.stringify([
        row.english_word,
        row.russian_word,
        count,
        row.probability,
      ]);
      if (seenExactRows.has(exactRowKey)) {
        removedExactDuplicates += 1;
        continue;
      }
      seenExactRows.add(exactRowKey);
      importedRecords.push({
        word: row.english_word,
        translation: row.russian_word,
        count,
        probability: row.probability,
      });
      lemmas.add(normalizeTypeScript(row.english_word));
    }

    importedRecords.sort((left, right) => (
      compareText(normalizeTypeScript(left.word), normalizeTypeScript(right.word))
      || right.probability - left.probability
      || right.count - left.count
      || compareText(
        normalizeTypeScript(left.translation),
        normalizeTypeScript(right.translation),
      )
      || compareText(left.translation, right.translation)
    ));

    const serialized = `${JSON.stringify(importedRecords)}\n`;
    await writeFile(temporaryOutputPath, serialized, 'utf8');
    const validatedOutput = JSON.parse(await readFile(temporaryOutputPath, 'utf8'));
    if (!Array.isArray(validatedOutput) || validatedOutput.length !== importedRecords.length) {
      throw new Error('Generated dictionary failed output validation');
    }
    await rename(temporaryOutputPath, outputPath);

    const elapsedMs = performance.now() - startedAt;
    console.log(JSON.stringify({
      source,
      revision: DATASET_REVISION,
      sha256: actualHash,
      schema: expectedColumns,
      sourceRows: rows.length,
      canonicalRecordsBefore: legacy.length,
      normalizedLegacyPairs: {
        typescript: legacyTypeScriptPairs.size,
        extension: legacyExtensionPairs.size,
      },
      overlapRowsRemoved: skippedLegacyOverlaps,
      overlapRowsByNormalization: overlaps,
      exactDuplicateRowsRemoved: removedExactDuplicates,
      importedRecords: importedRecords.length,
      distinctImportedLemmas: lemmas.size,
      expandedRecordCount: legacy.length + importedRecords.length,
      outputPath,
      outputBytes: Buffer.byteLength(serialized),
      outputGzipBytes: gzipSync(serialized, { level: 9 }).byteLength,
      elapsedMs: Number(elapsedMs.toFixed(2)),
    }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await rm(temporaryOutputPath, { force: true });
  }
}

main().catch((error) => {
  console.error('[build-statistical-dictionary] Failed:', error);
  process.exitCode = 1;
});
