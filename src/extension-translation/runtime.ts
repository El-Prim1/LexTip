import {
  env,
  pipeline,
  type AllTasks,
  type ProgressInfo,
} from '@huggingface/transformers';

const MODEL_ID = 'Xenova/opus-mt-en-ru';
const WASM_ASSET_BASE = chrome.runtime.getURL('experiments/local-translation/assets/');
const WASM_SUFFIX = 'ort-wasm-simd-threaded.asyncify';
const wasmEnvironment = env.backends.onnx.wasm;

if (!wasmEnvironment) {
  throw new Error('ONNX Runtime Web WASM configuration is unavailable.');
}

env.useBrowserCache = true;
env.useWasmCache = true;
wasmEnvironment.wasmPaths = {
  mjs: `${WASM_ASSET_BASE}${WASM_SUFFIX}.mjs`,
  wasm: `${WASM_ASSET_BASE}${WASM_SUFFIX}.wasm`,
};

let translator: AllTasks['translation'] | null = null;
let translatorPromise: Promise<AllTasks['translation']> | null = null;
let initializationMs: number | null = null;

type TranslationRuntime = {
  translate(
    text: string,
    progressCallback: (progress: ProgressInfo) => void,
  ): Promise<{ translation: string; initializationMs: number; inferenceMs: number }>;
};

const runtime: TranslationRuntime = {
  async translate(text, progressCallback) {
    if (!text.trim()) throw new Error('Enter English text to translate.');

    if (!translator) {
      if (!translatorPromise) {
        const startedAt = performance.now();
        translatorPromise = pipeline('translation', MODEL_ID, {
          dtype: 'q8',
          device: 'wasm',
          progress_callback: progressCallback,
        }).then((loadedTranslator) => {
          initializationMs = performance.now() - startedAt;
          translator = loadedTranslator;
          return loadedTranslator;
        }).catch((error: unknown) => {
          translatorPromise = null;
          throw error;
        });
      }
      translator = await translatorPromise;
    }

    const inferenceStartedAt = performance.now();
    const result = await translator(text);
    const translation = result[0]?.translation_text;
    if (!translation) throw new Error('The translation pipeline returned no output.');

    return {
      translation,
      initializationMs: initializationMs ?? 0,
      inferenceMs: performance.now() - inferenceStartedAt,
    };
  },
};

(globalThis as typeof globalThis & { LexTipStage3Translation: TranslationRuntime })
  .LexTipStage3Translation = runtime;

declare const chrome: {
  runtime: {
    getURL(path: string): string;
  };
};
