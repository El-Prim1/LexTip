import { useCallback, useEffect, useRef, useState } from 'react';
import {
  env,
  pipeline,
  type AllTasks,
  type ProgressInfo,
} from '@huggingface/transformers';
import './translation-test.css';

const MODEL_ID = 'Xenova/opus-mt-en-ru';
const CACHE_KEY = env.cacheKey;
const WASM_ASSET_URL = 'cdn.jsdelivr.net/npm/onnxruntime-web@';
const SAMPLE_INPUTS = [
  'Good morning!',
  'I went to the bank to deposit some money.',
  'She gave me a hand with the assignment.',
];

type TranslationResult = {
  input: string;
  output: string;
  latencyMs: number;
};

type CacheEntry = {
  url: string;
  bytes: number | null;
  contentType: string;
};

function isExperimentAsset(url: string): boolean {
  return (
    url.includes(`/Xenova/${MODEL_ID.split('/')[1]}/resolve/`) ||
    (url.includes(WASM_ASSET_URL) &&
      (url.endsWith('.wasm') || url.endsWith('.mjs')))
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(milliseconds: number): string {
  return `${milliseconds.toFixed(0)} ms`;
}

env.useBrowserCache = true;
env.useWasmCache = true;

export default function TranslationTest() {
  const [input, setInput] = useState(SAMPLE_INPUTS[0]);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState('Model has not been loaded.');
  const [error, setError] = useState('');
  const [initializationMs, setInitializationMs] = useState<number | null>(null);
  const [assetLoadingMs, setAssetLoadingMs] = useState<number | null>(null);
  const [loadedModelBytes, setLoadedModelBytes] = useState({ loaded: 0, total: 0 });
  const [results, setResults] = useState<TranslationResult[]>([]);
  const [requestedUrls, setRequestedUrls] = useState<string[]>([]);
  const [assetFiles, setAssetFiles] = useState<string[]>([]);
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const [cacheMessage, setCacheMessage] = useState('Cache has not been inspected yet.');
  const pipelineRef = useRef<AllTasks['translation'] | null>(null);
  const pipelinePromiseRef = useRef<Promise<AllTasks['translation']> | null>(null);
  const requestSetRef = useRef(new Set<string>());
  const assetSetRef = useRef(new Set<string>());
  const completedAssetsRef = useRef(new Set<string>());
  const fileProgressRef = useRef(new Map<string, { loaded: number; total: number }>());
  const assetLoadingStartedRef = useRef<number | null>(null);

  const recordRequest = useCallback((url: string) => {
    if (new URL(url, window.location.origin).origin === window.location.origin) return;
    if (requestSetRef.current.has(url)) return;
    requestSetRef.current.add(url);
    setRequestedUrls([...requestSetRef.current]);
  }, []);

  const inspectCache = useCallback(async () => {
    if (typeof caches === 'undefined') {
      setCacheMessage('CacheStorage is not available in this browser context.');
      setCacheEntries([]);
      return;
    }

    try {
      const cache = await caches.open(CACHE_KEY);
      const entries: CacheEntry[] = [];
      for (const request of await cache.keys()) {
        const url = request.url;
        if (!isExperimentAsset(url)) continue;
        const response = await cache.match(request);
        const length = response?.headers.get('content-length');
        entries.push({
          url,
          bytes: length && Number.isFinite(Number(length)) ? Number(length) : null,
          contentType: response?.headers.get('content-type') ?? 'unknown',
        });
      }
      setCacheEntries(entries);
      setCacheMessage(
        `${entries.length} experiment asset${entries.length === 1 ? '' : 's'} in CacheStorage "${CACHE_KEY}".`,
      );
    } catch (cacheError) {
      const message = cacheError instanceof Error ? cacheError.message : String(cacheError);
      setCacheMessage(`Cache inspection failed: ${message}`);
    }
  }, []);

  const clearExperimentCache = useCallback(async () => {
    if (typeof caches === 'undefined') {
      setCacheMessage('CacheStorage is not available in this browser context.');
      return;
    }
    try {
      const cache = await caches.open(CACHE_KEY);
      let deleted = 0;
      for (const request of await cache.keys()) {
        if (isExperimentAsset(request.url) && (await cache.delete(request))) deleted += 1;
      }
      pipelineRef.current = null;
      pipelinePromiseRef.current = null;
      setInitializationMs(null);
      setAssetLoadingMs(null);
      setResults([]);
      setOutput('');
      setCacheMessage(`Removed ${deleted} matching LexTip model/WASM asset(s); other cache entries were left intact.`);
      await inspectCache();
    } catch (cacheError) {
      const message = cacheError instanceof Error ? cacheError.message : String(cacheError);
      setError(`Could not clear the LexTip experiment cache: ${message}`);
    }
  }, [inspectCache]);

  useEffect(() => {
    void inspectCache();
    const observer =
      typeof PerformanceObserver === 'undefined'
        ? null
        : new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              recordRequest(entry.name);
            }
          });
    observer?.observe({ type: 'resource', buffered: true });

    const originalFetch = env.fetch;
    const trackedFetch = async (url: string | URL, init?: RequestInit) => {
      recordRequest(String(url));
      return originalFetch(url, init);
    };

    env.fetch = trackedFetch;
    return () => {
      if (env.fetch === trackedFetch) env.fetch = originalFetch;
      observer?.disconnect();
    };
  }, [inspectCache, recordRequest]);

  const recordProgress = useCallback((info: ProgressInfo) => {
    if ('file' in info) {
      assetSetRef.current.add(info.file);
      setAssetFiles([...assetSetRef.current]);
      if (info.status === 'progress' || info.status === 'download') {
        assetLoadingStartedRef.current ??= performance.now();
      }
      if (info.status === 'progress') {
        fileProgressRef.current.set(info.file, { loaded: info.loaded, total: info.total });
        const totals = [...fileProgressRef.current.values()].reduce(
          (sum, file) => ({
            loaded: sum.loaded + file.loaded,
            total: sum.total + file.total,
          }),
          { loaded: 0, total: 0 },
        );
        setLoadedModelBytes(totals);
      }
      if (info.status === 'done') {
        completedAssetsRef.current.add(info.file);
        const expectedFiles = [
          'config.json',
          'tokenizer.json',
          'tokenizer_config.json',
          'generation_config.json',
          'onnx/encoder_model_quantized.onnx',
          'onnx/decoder_model_merged_quantized.onnx',
        ];
        if (
          assetLoadingStartedRef.current !== null &&
          expectedFiles.every((file) => completedAssetsRef.current.has(file))
        ) {
          setAssetLoadingMs(performance.now() - assetLoadingStartedRef.current);
        }
      }
      setStatus(`${info.status === 'done' ? 'Loaded' : 'Loading'} ${info.file}`);
    } else if (info.status === 'progress_total') {
      setProgress(info.progress);
      const fileTotals = Object.values(info.files).reduce(
        (sum, file) => ({
          loaded: sum.loaded + file.loaded,
          total: sum.total + file.total,
        }),
        { loaded: 0, total: 0 },
      );
      setLoadedModelBytes(fileTotals.total > 0 ? fileTotals : { loaded: info.loaded, total: info.total });
      setStatus(`Loading model files: ${info.progress.toFixed(0)}%`);
    }
  }, []);

  const getPipeline = useCallback(async () => {
    if (pipelineRef.current) return pipelineRef.current;
    if (pipelinePromiseRef.current) return pipelinePromiseRef.current;

    const pending = (async () => {
      setLoading(true);
      setError('');
      setProgress(null);
      setLoadedModelBytes({ loaded: 0, total: 0 });
      assetLoadingStartedRef.current = null;
      completedAssetsRef.current.clear();
      fileProgressRef.current.clear();
      setStatus('Loading q8 model into the browser WASM runtime…');

      try {
        const startedAt = performance.now();
        const translator = await pipeline('translation', MODEL_ID, {
          dtype: 'q8',
          device: 'wasm',
          progress_callback: recordProgress,
        });
        setInitializationMs(performance.now() - startedAt);
        pipelineRef.current = translator;
        setStatus('Model ready in this browser tab (WASM).');
        await inspectCache();
        return translator;
      } catch (loadError) {
        const message =
          loadError instanceof Error ? loadError.message : String(loadError);
        setError(`Model loading failed: ${message}`);
        setStatus('Model loading failed.');
        throw loadError;
      } finally {
        setLoading(false);
        pipelinePromiseRef.current = null;
      }
    })();

    pipelinePromiseRef.current = pending;
    return pending;
  }, [inspectCache, recordProgress]);

  const translate = useCallback(async () => {
    const source = input.trim();
    if (!source || translating || loading) return;

    setError('');
    setOutput('');
    setTranslating(true);
    try {
      const translator = await getPipeline();
      const startedAt = performance.now();
      const translated = await translator(source);
      const latencyMs = performance.now() - startedAt;
      const result = translated[0]?.translation_text;
      if (!result) throw new Error('The translation pipeline returned no output.');

      setOutput(result);
      setResults((current) => [...current, { input: source, output: result, latencyMs }]);
      setStatus('Translation executed locally in this tab.');
    } catch (translationError) {
      const message =
        translationError instanceof Error
          ? translationError.message
          : String(translationError);
      setError((current) => current || `Translation failed: ${message}`);
    } finally {
      setTranslating(false);
    }
  }, [getPipeline, input, loading, translating]);

  return (
    <main className="translation-test">
      <header className="translation-test__header">
        <p className="translation-test__eyebrow">LexTip · Stage 1 experiment</p>
        <h1>Local English → Russian translation</h1>
        <p>
          Transformers.js {env.version} · {MODEL_ID} · q8 · browser WASM
        </p>
      </header>

      <section className="translation-test__panel" aria-labelledby="translator-heading">
        <h2 id="translator-heading">Translate a sentence</h2>
        <label htmlFor="translation-input">English text</label>
        <textarea
          id="translation-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          placeholder="Enter English text"
        />
        <div className="translation-test__samples" aria-label="Test inputs">
          {SAMPLE_INPUTS.map((sample) => (
            <button
              className="translation-test__sample"
              key={sample}
              onClick={() => setInput(sample)}
              type="button"
            >
              {sample}
            </button>
          ))}
        </div>
        <button
          className="translation-test__translate"
          disabled={!input.trim() || loading || translating}
          onClick={translate}
          type="button"
        >
          {loading
            ? 'Loading model…'
            : translating
              ? 'Translating…'
              : pipelineRef.current
                ? 'Translate'
                : 'Load model & translate'}
        </button>
        <p className="translation-test__status" role="status">
          {status}
        </p>
        {loading && progress !== null && (
          <progress aria-label="Model loading progress" max="100" value={progress} />
        )}
        {error && (
          <p className="translation-test__error" role="alert">
            {error}
          </p>
        )}
        {output && (
          <div className="translation-test__output">
            <h3>Russian translation</h3>
            <p>{output}</p>
          </div>
        )}
      </section>

      <section className="translation-test__panel" aria-labelledby="measurements-heading">
        <h2 id="measurements-heading">Experiment measurements</h2>
        <dl className="translation-test__metrics">
          <div>
            <dt>Initialization</dt>
            <dd>{initializationMs === null ? 'Not measured' : formatDuration(initializationMs)}</dd>
          </div>
          <div>
            <dt>Model asset loading (progress callback)</dt>
            <dd>{assetLoadingMs === null ? 'Not measured' : formatDuration(assetLoadingMs)}</dd>
          </div>
          <div>
            <dt>Model bytes loaded (network or cache)</dt>
            <dd>
              {loadedModelBytes.total > 0
                ? `${formatBytes(loadedModelBytes.loaded)} / ${formatBytes(loadedModelBytes.total)}`
                : 'No file-byte progress reported (likely cache hit).'}
            </dd>
          </div>
          <div>
            <dt>Inference</dt>
            <dd>
              {results.length === 0
                ? 'Not measured'
                : results
                    .map(
                      (result, index) =>
                        `${index === 0 ? 'First' : `#${index + 1}`}: ${formatDuration(result.latencyMs)}`,
                    )
                    .join(' · ')}
            </dd>
          </div>
          <div>
            <dt>Execution</dt>
            <dd>Browser WASM; no remote inference API is configured.</dd>
          </div>
          <div>
            <dt>Cache configuration</dt>
            <dd>
              Browser model cache: {String(env.useBrowserCache)} · WASM cache: {String(env.useWasmCache)} · CacheStorage key: {CACHE_KEY}
            </dd>
          </div>
        </dl>

        <h3>Requested model files</h3>
        {assetFiles.length > 0 ? (
          <ul className="translation-test__file-list">
            {assetFiles.map((file) => <li key={file}>{file}</li>)}
          </ul>
        ) : (
          <p className="translation-test__muted">No model files requested yet.</p>
        )}
        <h3>External URLs observed (local Vite requests are not listed)</h3>
        {requestedUrls.length > 0 ? (
          <ul className="translation-test__file-list">
            {requestedUrls.map((url) => <li key={url}>{url}</li>)}
          </ul>
        ) : (
          <p className="translation-test__muted">No external requests observed.</p>
        )}

        <h3>Persistent experiment cache</h3>
        <p className="translation-test__muted">{cacheMessage}</p>
        <div className="translation-test__samples">
          <button className="translation-test__sample" onClick={() => void inspectCache()} type="button">
            Refresh cache inventory
          </button>
          <button
            className="translation-test__sample"
            disabled={loading || translating}
            onClick={() => void clearExperimentCache()}
            type="button"
          >
            Clear only LexTip model and WASM assets
          </button>
        </div>
        {cacheEntries.length > 0 ? (
          <ul className="translation-test__file-list">
            {cacheEntries.map((entry) => (
              <li key={entry.url}>
                {entry.url} · {entry.bytes === null ? 'size unavailable' : formatBytes(entry.bytes)} · {entry.contentType}
              </li>
            ))}
          </ul>
        ) : (
          <p className="translation-test__muted">No matching model or WASM entries are cached.</p>
        )}

        <h3>Translation results and latency</h3>
        {results.length > 0 ? (
          <ol className="translation-test__results">
            {results.map((result, index) => (
              <li key={`${index}-${result.input}`}>
                <p><strong>Input:</strong> {result.input}</p>
                <p><strong>Output:</strong> {result.output}</p>
                <p><strong>Latency:</strong> {formatDuration(result.latencyMs)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="translation-test__muted">No translations recorded yet.</p>
        )}
      </section>
    </main>
  );
}
