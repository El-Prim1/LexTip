/**
 * LexTip - Settings Page Controller
 * Manages source & target language preferences with real-time sync across sessions.
 */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    SOURCE_LANG: 'lextip_source_lang',
    TARGET_LANG: 'lextip_target_lang',
  };

  const DEFAULT_SOURCE_LANG = 'auto';
  const DEFAULT_TARGET_LANG = 'ru';

  const SUPPORTED_LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'ru', name: 'Russian' },
    { code: 'de', name: 'German' },
    { code: 'fr', name: 'French' },
    { code: 'es', name: 'Spanish' },
    { code: 'it', name: 'Italian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'nl', name: 'Dutch' },
    { code: 'pl', name: 'Polish' },
    { code: 'uk', name: 'Ukrainian' },
    { code: 'tr', name: 'Turkish' },
    { code: 'ar', name: 'Arabic' },
    { code: 'he', name: 'Hebrew' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
    { code: 'sv', name: 'Swedish' },
    { code: 'no', name: 'Norwegian' },
    { code: 'da', name: 'Danish' },
    { code: 'fi', name: 'Finnish' },
    { code: 'cs', name: 'Czech' },
    { code: 'sk', name: 'Slovak' },
    { code: 'hu', name: 'Hungarian' },
    { code: 'ro', name: 'Romanian' },
    { code: 'bg', name: 'Bulgarian' },
    { code: 'el', name: 'Greek' },
    { code: 'hi', name: 'Hindi' },
    { code: 'id', name: 'Indonesian' },
    { code: 'th', name: 'Thai' },
    { code: 'vi', name: 'Vietnamese' },
  ];

  function getStorageArea() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return chrome.storage.sync || chrome.storage.local;
    }
    return null;
  }

  const sourceSelect = document.getElementById('source-lang-select');
  const targetSelect = document.getElementById('target-lang-select');

  let currentSource = DEFAULT_SOURCE_LANG;
  let currentTarget = DEFAULT_TARGET_LANG;

  function populateOptions() {
    if (!sourceSelect || !targetSelect) return;

    // Populate source selector: Auto-detect + all supported languages
    sourceSelect.innerHTML = '';
    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.textContent = 'Auto-detect';
    sourceSelect.appendChild(autoOption);

    SUPPORTED_LANGUAGES.forEach((lang) => {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = lang.name;
      sourceSelect.appendChild(opt);
    });

    // Populate target selector: all supported languages (target cannot be auto)
    targetSelect.innerHTML = '';
    SUPPORTED_LANGUAGES.forEach((lang) => {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = lang.name;
      targetSelect.appendChild(opt);
    });

    updateDisabledOptions();
  }

  function updateDisabledOptions() {
    if (!sourceSelect || !targetSelect) return;

    // Source cannot be the same as target (unless source is auto)
    for (let i = 0; i < sourceSelect.options.length; i++) {
      const opt = sourceSelect.options[i];
      if (opt.value === 'auto') {
        opt.disabled = false;
      } else {
        opt.disabled = opt.value === currentTarget;
      }
    }

    // Target cannot be the same as manual source
    for (let i = 0; i < targetSelect.options.length; i++) {
      const opt = targetSelect.options[i];
      opt.disabled = currentSource !== 'auto' && opt.value === currentSource;
    }
  }

  function loadPreferences() {
    const storage = getStorageArea();
    if (!storage) {
      applyValues(DEFAULT_SOURCE_LANG, DEFAULT_TARGET_LANG);
      return;
    }

    storage.get([STORAGE_KEYS.SOURCE_LANG, STORAGE_KEYS.TARGET_LANG], (result) => {
      if (chrome.runtime.lastError) {
        console.warn('[LexTip Settings] Failed to load preferences:', chrome.runtime.lastError);
        applyValues(DEFAULT_SOURCE_LANG, DEFAULT_TARGET_LANG);
        return;
      }
      const source = result && result[STORAGE_KEYS.SOURCE_LANG] ? result[STORAGE_KEYS.SOURCE_LANG] : DEFAULT_SOURCE_LANG;
      const target = result && result[STORAGE_KEYS.TARGET_LANG] ? result[STORAGE_KEYS.TARGET_LANG] : DEFAULT_TARGET_LANG;
      applyValues(source, target);
    });
  }

  function applyValues(source, target) {
    currentSource = source;
    currentTarget = target;

    // Prevent unsupported combinations where source == target
    if (currentSource !== 'auto' && currentSource === currentTarget) {
      currentTarget = currentSource === 'ru' ? 'en' : 'ru';
    }

    if (sourceSelect) sourceSelect.value = currentSource;
    if (targetSelect) targetSelect.value = currentTarget;

    updateDisabledOptions();
  }

  function savePreferences() {
    const storage = getStorageArea();
    if (!storage) return;

    storage.set({
      [STORAGE_KEYS.SOURCE_LANG]: currentSource,
      [STORAGE_KEYS.TARGET_LANG]: currentTarget,
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[LexTip Settings] Failed to save preferences:', chrome.runtime.lastError);
      }
    });
  }

  function setupListeners() {
    if (sourceSelect) {
      sourceSelect.addEventListener('change', () => {
        let newSource = sourceSelect.value;
        if (newSource !== 'auto' && newSource === currentTarget) {
          // Auto-adjust target to avoid invalid identical pair
          currentTarget = newSource === 'ru' ? 'en' : 'ru';
          if (targetSelect) targetSelect.value = currentTarget;
        }
        currentSource = newSource;
        updateDisabledOptions();
        savePreferences();
      });
    }

    if (targetSelect) {
      targetSelect.addEventListener('change', () => {
        let newTarget = targetSelect.value;
        if (currentSource !== 'auto' && currentSource === newTarget) {
          // Auto-adjust source to avoid invalid identical pair
          currentSource = newTarget === 'en' ? 'ru' : 'auto';
          if (sourceSelect) sourceSelect.value = currentSource;
        }
        currentTarget = newTarget;
        updateDisabledOptions();
        savePreferences();
      });
    }

    // Sync in real-time when preferences change from the translation popup or another page
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes) => {
        let updated = false;
        let newSource = currentSource;
        let newTarget = currentTarget;

        if (changes[STORAGE_KEYS.SOURCE_LANG]) {
          newSource = changes[STORAGE_KEYS.SOURCE_LANG].newValue || DEFAULT_SOURCE_LANG;
          updated = true;
        }
        if (changes[STORAGE_KEYS.TARGET_LANG]) {
          newTarget = changes[STORAGE_KEYS.TARGET_LANG].newValue || DEFAULT_TARGET_LANG;
          updated = true;
        }

        if (updated) {
          applyValues(newSource, newTarget);
        }
      });
    }
  }

  function init() {
    populateOptions();
    loadPreferences();
    setupListeners();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
