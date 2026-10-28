import { useCallback, useEffect, useRef, useState } from 'react';
import {
  env,
  ModelRegistry,
  pipeline,
  type AllTasks,
  type ProgressInfo,
} from '@huggingface/transformers';
import './translation-test.css';

const MODEL_ID = 'Xenova/opus-mt-en-ru';
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

function formatDuration(milliseconds: number): string {
  return `${milliseconds.toFixed(0)} ms`;
}

export default function TranslationTest() {
  const [input, setInput] = useState(SAMPLE_INPUTS[0]);
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState('Model has not been loaded.');
  const [error, setError] = useState('');
  const [initializationMs, setInitializationMs] = useState<number | null>(null);
  const [results, setResults] = useState<TranslationResult[]>([]);
  const [requestedFiles, setRequestedFiles] = useState<string[]>([]);
  const [assetFiles, setAssetFiles] = useState<string[]>([]);
  const [externalRequests, setExternalRequests] = useState<string[]>([]);
  const pipelineRef = useRef<AllTasks['translation'] | null>(null);
  const pipelinePromiseRef = useRef<Promise<AllTasks['translation']> | null>(null);
  const requestSetRef = useRef(new Set<string>());
  const assetSetRef = useRef(new Set<string>());

  useEffect(() => {
    const originalFetch = env.fetch;
    const trackedFetch = (url: string | URL, init?: RequestInit) => {
      const requestUrl = new URL(String(url), window.location.origin);
      if (requestUrl.origin !== window.location.origin) {
        const requestPath = `${requestUrl.host}${requestUrl.pathname}`;
        if (!requestSetRef.current.has(requestPath)) {
          requestSetRef.current.add(requestPath);
          setRequestedFiles([...requestSetRef.current]);
        }
        if (!requestUrl.pathname.includes('/resolve/')) {
          setExternalRequests((current) =>
            current.includes(requestPath) ? current : [...current, requestPath],
          );
        }
      }
      return originalFetch(url, init);
    };

    env.fetch = trackedFetch;
    return () => {
      if (env.fetch === trackedFetch) env.fetch = originalFetch;
    };
  }, []);

  const recordProgress = useCallback((info: ProgressInfo) => {
    if ('file' in info) {
      assetSetRef.current.add(info.file);
      setAssetFiles([...assetSetRef.current]);
      setStatus(`${info.status === 'done' ? 'Loaded' : 'Loading'} ${info.file}`);
    } else if (info.status === 'progress_total') {
      setProgress(info.progress);
      setStatus(`Downloading model files: ${info.progress.toFixed(0)}%`);
    }
  }, []);

  const getPipeline = useCallback(async () => {
    if (pipelineRef.current) return pipelineRef.current;
    if (pipelinePromiseRef.current) return pipelinePromiseRef.current;

    const pending = (async () => {
      setLoading(true);
      setError('');
      setProgress(null);
      setStatus('Checking model quantization support…');

      try {
        const availableDtypes = await ModelRegistry.get_available_dtypes(MODEL_ID);
        if (!availableDtypes.includes('q8')) {
          throw new Error(
            `Installed Transformers.js does not report q8 for ${MODEL_ID}. Available: ${availableDtypes.join(', ') || 'none'}.`,
          );
        }

        setStatus('Loading q8 model into the browser WASM runtime…');
        const startedAt = performance.now();
        const translator = await pipeline('translation', MODEL_ID, {
          dtype: 'q8',
          device: 'wasm',
          progress_callback: recordProgress,
        });
        setInitializationMs(performance.now() - startedAt);
        pipelineRef.current = translator;
        setStatus('Model ready in this browser tab (WASM).');
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
  }, [recordProgress]);

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
          <progress aria-label="Model download progress" max="100" value={progress} />
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
            <dt>External requests outside model asset paths</dt>
            <dd>{externalRequests.length === 0 ? 'None observed' : externalRequests.join(', ')}</dd>
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
        <h3>Network requests observed by Transformers.js</h3>
        {requestedFiles.length > 0 ? (
          <ul className="translation-test__file-list">
            {requestedFiles.map((file) => <li key={file}>{file}</li>)}
          </ul>
        ) : (
          <p className="translation-test__muted">No external requests observed yet.</p>
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
