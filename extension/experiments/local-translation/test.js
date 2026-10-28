'use strict';

const MODEL_ID = 'Xenova/opus-mt-en-ru';
const textInput = document.getElementById('source-text');
const translateButton = document.getElementById('translate');
const statusElement = document.getElementById('status');
const progressElement = document.getElementById('progress');
const errorElement = document.getElementById('error');
const resultPanel = document.getElementById('result-panel');
const filesElement = document.getElementById('files');
const assetFiles = new Set();
const fileProgress = new Map();
let loadedBytes = 0;
let totalBytes = 0;

document.getElementById('origin').textContent = chrome.runtime.getURL('');

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'LEXTIP_STAGE3_PROGRESS') return;
  const progress = message.payload;
  if (typeof progress.file === 'string') assetFiles.add(progress.file);
  filesElement.textContent = [...assetFiles].join(', ') || 'No model files reported yet.';

  if (progress.status === 'progress') {
    fileProgress.set(progress.file, { loaded: progress.loaded, total: progress.total });
    const byteTotals = [...fileProgress.values()].reduce(
      (sum, file) => ({
        loaded: sum.loaded + file.loaded,
        total: sum.total + file.total,
      }),
      { loaded: 0, total: 0 },
    );
    loadedBytes = byteTotals.loaded;
    totalBytes = byteTotals.total;
    document.getElementById('bytes').textContent =
      `${(loadedBytes / 1024 / 1024).toFixed(1)} / ${(totalBytes / 1024 / 1024).toFixed(1)} MB`;
    progressElement.hidden = false;
    progressElement.value = progress.progress;
    statusElement.textContent = `Loading ${progress.file}: ${progress.progress.toFixed(0)}%`;
  } else if (progress.status === 'download' || progress.status === 'initiate') {
    statusElement.textContent = `Loading ${progress.file}`;
  } else if (progress.status === 'done') {
    statusElement.textContent = `Loaded ${progress.file}`;
  } else if (progress.status === 'progress_total') {
    loadedBytes = progress.loaded;
    totalBytes = progress.total;
    progressElement.hidden = false;
    progressElement.value = progress.progress;
    statusElement.textContent = `Loading model files: ${progress.progress.toFixed(0)}%`;
  }
});

translateButton.addEventListener('click', () => {
  const text = textInput.value.trim();
  if (!text) {
    errorElement.hidden = false;
    errorElement.textContent = 'Enter English text to translate.';
    return;
  }

  translateButton.disabled = true;
  translateButton.textContent = 'Loading model…';
  errorElement.hidden = true;
  resultPanel.hidden = true;
  progressElement.hidden = false;
  statusElement.textContent = 'Sending request through the extension service worker…';
  loadedBytes = 0;
  totalBytes = 0;
  assetFiles.clear();
  fileProgress.clear();

  chrome.runtime.sendMessage(
    { type: 'LEXTIP_STAGE3_TRANSLATE', payload: { text } },
    (response) => {
      const runtimeError = chrome.runtime.lastError;
      translateButton.disabled = false;
      translateButton.textContent = 'Translate';
      progressElement.hidden = true;

      if (runtimeError) {
        errorElement.hidden = false;
        errorElement.textContent = `Extension messaging failed: ${runtimeError.message}`;
        statusElement.textContent = 'Translation request failed.';
        return;
      }
      if (!response?.success) {
        errorElement.hidden = false;
        errorElement.textContent = response?.error || 'The translation request failed.';
        statusElement.textContent = 'Translation request failed.';
        return;
      }

      document.getElementById('result').textContent = response.data.translation;
      document.getElementById('initialization').textContent =
        `${response.data.initializationMs.toFixed(0)} ms`;
      document.getElementById('inference').textContent =
        `${response.data.inferenceMs.toFixed(0)} ms`;
      document.getElementById('bytes').textContent =
        totalBytes > 0
          ? `${(loadedBytes / 1024 / 1024).toFixed(1)} / ${(totalBytes / 1024 / 1024).toFixed(1)} MB`
          : 'No network download progress reported (cache hit).';
      resultPanel.hidden = false;
      statusElement.textContent = `Translated locally in the extension offscreen document. Model: ${MODEL_ID}, q8, WASM.`;
    },
  );
});
