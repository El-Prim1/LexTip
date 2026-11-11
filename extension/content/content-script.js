/**
 * LexTip - Content Script
 * Precision Viewport Positioning Engine (Fixed Coordinates + Dynamic Boundary Flipping)
 */

(function () {
  'use strict';

  if (window.__LEXTIP_INITIALIZED__) return;
  window.__LEXTIP_INITIALIZED__ = true;

  const CONFIG = {
    DEBOUNCE_MS: 150,
    // While the user is actively dragging a selection, the popup refreshes
    // the translation of the current selection on this interval (~500 ms).
    LIVE_SELECTION_DEBOUNCE_MS: 300,
    VIEWPORT_PADDING: 12,
    GAP: 8,
    MIN_WIDTH: 100,
    MAX_WIDTH: 480,
    HOST_TAG_ID: 'lextip-popover-host',
    MAX_SELECTION_LENGTH: 1000,
  };

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

  // Readable language names (never raw codes) used for the dynamic popup labels.
  const SOURCE_LANGUAGE_NAMES = {};
  SUPPORTED_LANGUAGES.forEach((l) => {
    SOURCE_LANGUAGE_NAMES[l.code] = l.name;
  });
  const TARGET_LANGUAGE_NAMES = { ...SOURCE_LANGUAGE_NAMES };
  const NEUTRAL_SOURCE_LABEL = 'Source text';
  const FALLBACK_TARGET_LABEL = 'Translation';

  let currentSourceLang = DEFAULT_SOURCE_LANG;
  let currentTargetLang = DEFAULT_TARGET_LANG;
  let lastDetectedSourceLang = null;

  function getStorageArea() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return chrome.storage.sync || chrome.storage.local;
    }
    return null;
  }

  function loadSavedPreferences() {
    const storage = getStorageArea();
    if (!storage) return;
    storage.get([STORAGE_KEYS.SOURCE_LANG, STORAGE_KEYS.TARGET_LANG], (result) => {
      if (chrome.runtime.lastError) return;
      if (result && result[STORAGE_KEYS.SOURCE_LANG]) {
        currentSourceLang = result[STORAGE_KEYS.SOURCE_LANG];
      }
      if (result && result[STORAGE_KEYS.TARGET_LANG]) {
        currentTargetLang = result[STORAGE_KEYS.TARGET_LANG];
      }
      syncPopupSelectors();
    });
  }

  function savePreferences(source, target) {
    const storage = getStorageArea();
    if (!storage) return;
    storage.set({
      [STORAGE_KEYS.SOURCE_LANG]: source,
      [STORAGE_KEYS.TARGET_LANG]: target,
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[LexTip] Preference save error:', chrome.runtime.lastError);
      }
    });
  }

  function detectSourceLanguageName(text) {
    // Neutral fallback instead of guessing when detection fails.
    if (!text || typeof text !== 'string') return null;
    // Dictionary pipeline is English -> Russian; Cyrillic selections are not
    // English source words, so they fall back to the neutral label.
    if (/[\u0400-\u04FF]/.test(text)) return null;
    if (/[a-zA-Z\u00C0-\u024F]/.test(text)) return 'English';
    return null;
  }

  function applyPopupLabels(sourceLabel, targetLabel) {
    if (!shadowRoot) return;
    const sourceTitleEl = shadowRoot.getElementById('ll-source-label');
    if (sourceTitleEl) sourceTitleEl.textContent = sourceLabel;
    const targetLabelEl = shadowRoot.getElementById('ll-target-label');
    if (targetLabelEl) targetLabelEl.textContent = targetLabel;
  }

  const ISOLATED_CSS = `
    :host {
      all: initial;
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      overflow: visible;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      pointer-events: none;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    .ll-popover {
      position: fixed;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      background: #171b24;
      color: #f8fafc;
      border: 1px solid #343b49;
      border-radius: 13px;
      box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.45), 0 4px 6px -2px rgba(0, 0, 0, 0.3);
      padding: 6px;
      opacity: 0;
      transform: translateY(4px) scale(0.98);
      transition: opacity 120ms ease-out, transform 120ms ease-out, width 120ms ease-out;
      pointer-events: none;
      user-select: text;
      font-size: 13px;
      line-height: 1.4;
      width: max-content;
      min-width: min(${CONFIG.MIN_WIDTH}px, calc(100vw - ${CONFIG.VIEWPORT_PADDING * 2}px));
      max-width: min(${CONFIG.MAX_WIDTH}px, calc(100vw - ${CONFIG.VIEWPORT_PADDING * 2}px));
      max-height: calc(100vh - ${CONFIG.VIEWPORT_PADDING * 2}px);
      z-index: 2147483647;
    }
    .ll-popover.ll-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .ll-header {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 8px;
    }
    .ll-summary {
      display: flex;
      align-items: center;
      min-width: 0;
      gap: 5px;
      white-space: nowrap;
      flex: 1 1 auto;
    }
    .ll-expanded-title {
      display: none;
      flex: 1 1 auto;
      margin-left: 10px;
      color: #8994a7;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .ll-summary-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
    }
    .ll-source {
      color: #b4bdcc;
      font-weight: 400;
    }
    .ll-divider {
      color: #788399;
      flex: 0 0 auto;
    }
    .ll-target {
      color: #8eb9ed;
      font-weight: 600;
    }
    .ll-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 32px;
      width: 32px;
      height: 32px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #b4bdcc;
      font: inherit;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      transition: color 100ms ease, background-color 100ms ease;
    }
    .ll-toggle:hover {
      color: #ffffff;
      background: #292f3b;
    }
    .ll-toggle:focus-visible {
      outline: 2px solid #8eb9ed;
      outline-offset: 1px;
    }
    .ll-expanded-content {
      display: none;
      overflow: auto;
      overscroll-behavior: contain;
      min-height: 0;
      padding: 0 10px 10px;
      scrollbar-width: thin;
      scrollbar-color: #4b5565 transparent;
    }
    .ll-popover.ll-expanded .ll-summary {
      display: none;
    }
    .ll-popover.ll-expanded .ll-expanded-content {
      display: block;
    }
    .ll-lang-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #343b49;
    }
    .ll-lang-select {
      background: #232936;
      color: #cbd5e1;
      border: 1px solid #343b49;
      border-radius: 6px;
      padding: 3px 6px;
      font-size: 11px;
      font-family: inherit;
      outline: none;
      cursor: pointer;
      max-width: 140px;
      flex: 1 1 0;
      min-width: 0;
    }
    .ll-lang-select:hover {
      border-color: #4b5565;
      color: #f8fafc;
    }
    .ll-lang-select:focus-visible {
      border-color: #8eb9ed;
      outline: 1px solid #8eb9ed;
    }
    .ll-lang-select option:disabled {
      color: #556075;
      background: #171b24;
    }
    .ll-lang-arrow {
      color: #788399;
      font-size: 11px;
      flex: 0 0 auto;
    }
    .ll-detail-divider {
      height: 1px;
      margin: 10px 0;
      background: #343b49;
    }
    .ll-detail-label {
      margin-bottom: 3px;
      color: #8994a7;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .ll-detail-text {
      color: #eef2f8;
      font-size: 13px;
      font-weight: 400;
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .ll-detail-translation {
      color: #a8c8ee;
    }
    .ll-popover.ll-expanded .ll-header {
      justify-content: space-between;
      flex: 0 0 auto;
    }
    .ll-popover.ll-expanded .ll-expanded-title {
      display: block;
    }
    .ll-popover.ll-expanded .ll-original {
      margin-top: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      .ll-popover,
      .ll-toggle {
        transition: none;
      }
    }
    .ll-arrow {
      position: absolute;
      width: 8px;
      height: 8px;
      background: #171b24;
      transform: rotate(45deg);
      pointer-events: none;
    }
    /* Arrow positioned at bottom pointing down (popup rendered above word) */
    .ll-arrow-bottom,
    .ll-popover.popup--above .ll-arrow,
    .ll-popover.popup--bottom-arrow .ll-arrow,
    .ll-popover.ll-popover--above .ll-arrow {
      bottom: -4px;
      top: auto;
      border-right: 1px solid #343b49;
      border-bottom: 1px solid #343b49;
      border-left: none;
      border-top: none;
    }
    /* Arrow positioned at top pointing up (popup rendered below word) */
    .ll-arrow-top,
    .ll-popover.popup--below .ll-arrow,
    .ll-popover.popup--top-arrow .ll-arrow,
    .ll-popover.ll-popover--below .ll-arrow {
      top: -4px;
      bottom: auto;
      border-left: 1px solid #343b49;
      border-top: 1px solid #343b49;
      border-right: none;
      border-bottom: none;
    }
  `;

  let hostElement = null;
  let shadowRoot = null;
  let popoverElement = null;
  let arrowElement = null;
  let currentSelectionText = '';
  let debounceTimer = null;
  let mutationObserver = null;
  let lastActiveRange = null;
  let lastSelectionRect = null;
  let currentRequestId = 0;
  // Live-selection tracking: true between mousedown and mouseup so the popup
  // can refresh translations while the user is still dragging a selection.
  let isMouseDragging = false;
  let lastLiveSelectionText = '';
  let liveDebounceTimer = null;

  function initShadowHost() {
    if (hostElement && shadowRoot) return;

    try {
      hostElement = document.getElementById(CONFIG.HOST_TAG_ID);
      if (!hostElement) {
        hostElement = document.createElement('div');
        hostElement.id = CONFIG.HOST_TAG_ID;
        // Host element in light DOM fixed at 0,0 with zero size
        hostElement.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; overflow: visible; z-index: 2147483647; pointer-events: none; margin: 0; padding: 0; border: none;';
        (document.documentElement || document.body).appendChild(hostElement);
      }

      shadowRoot = hostElement.attachShadow({ mode: 'closed' });
      applyShadowStyles(shadowRoot);

      const template = document.createElement('div');
      template.className = 'll-popover';
      template.innerHTML = `
        <div class="ll-arrow ll-arrow-bottom" id="ll-arrow"></div>
        <div class="ll-header" id="ll-header">
          <div class="ll-summary" id="ll-text-container">
            <span class="ll-summary-text ll-source" id="ll-source"></span>
            <span class="ll-divider">—</span>
            <span class="ll-summary-text ll-target" id="ll-target">Translating...</span>
          </div>
          <div class="ll-expanded-title" id="ll-source-label">Original text</div>
          <button class="ll-toggle" id="ll-toggle" type="button" aria-expanded="false" aria-controls="ll-expanded-content" aria-label="Expand translation" title="Expand translation">⋯</button>
        </div>
        <div class="ll-expanded-content" id="ll-expanded-content" aria-hidden="true">
          <div class="ll-lang-bar" id="ll-lang-bar">
            <select class="ll-lang-select" id="ll-source-select" aria-label="Source language"></select>
            <span class="ll-lang-arrow">→</span>
            <select class="ll-lang-select" id="ll-target-select" aria-label="Target language"></select>
          </div>
          <div class="ll-detail-text ll-original" id="ll-original"></div>
          <div class="ll-detail-divider" aria-hidden="true"></div>
          <div>
            <div class="ll-detail-label" id="ll-target-label">Russian translation</div>
            <div class="ll-detail-text ll-detail-translation" id="ll-translation"></div>
          </div>
        </div>
      `;

      shadowRoot.appendChild(template);
      popoverElement = template;
      arrowElement = shadowRoot.getElementById('ll-arrow');

      populatePopupSelectors();

      const sourceSel = shadowRoot.getElementById('ll-source-select');
      const targetSel = shadowRoot.getElementById('ll-target-select');

      if (sourceSel) {
        sourceSel.addEventListener('change', (e) => {
          e.stopPropagation();
          let newSource = sourceSel.value;
          if (newSource !== 'auto' && newSource === currentTargetLang) {
            currentTargetLang = newSource === 'ru' ? 'en' : 'ru';
          }
          currentSourceLang = newSource;
          syncPopupSelectors();
          savePreferences(currentSourceLang, currentTargetLang);
          retranslateCurrentSelection();
        });
        sourceSel.addEventListener('pointerdown', (e) => e.stopPropagation());
        sourceSel.addEventListener('mousedown', (e) => e.stopPropagation());
        sourceSel.addEventListener('click', (e) => e.stopPropagation());
      }

      if (targetSel) {
        targetSel.addEventListener('change', (e) => {
          e.stopPropagation();
          let newTarget = targetSel.value;
          if (currentSourceLang !== 'auto' && currentSourceLang === newTarget) {
            currentSourceLang = newTarget === 'en' ? 'ru' : 'auto';
          }
          currentTargetLang = newTarget;
          syncPopupSelectors();
          savePreferences(currentSourceLang, currentTargetLang);
          retranslateCurrentSelection();
        });
        targetSel.addEventListener('pointerdown', (e) => e.stopPropagation());
        targetSel.addEventListener('mousedown', (e) => e.stopPropagation());
        targetSel.addEventListener('click', (e) => e.stopPropagation());
      }

      shadowRoot.getElementById('ll-toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        togglePopover();
      });
    } catch (err) {
      console.warn('[LexTip] Initialization error:', err);
    }
  }

  function applyShadowStyles(root) {
    if ('adoptedStyleSheets' in Document.prototype && 'replaceSync' in CSSStyleSheet.prototype) {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(ISOLATED_CSS);
        root.adoptedStyleSheets = [sheet];
        return;
      } catch (e) { }
    }
    try {
      const styleEl = document.createElement('style');
      styleEl.textContent = ISOLATED_CSS;
      root.appendChild(styleEl);
    } catch (e) {
      console.error('[LexTip] Failed to inject styles:', e);
    }
  }

  function populatePopupSelectors() {
    if (!shadowRoot) return;
    const sourceSel = shadowRoot.getElementById('ll-source-select');
    const targetSel = shadowRoot.getElementById('ll-target-select');
    if (!sourceSel || !targetSel) return;

    sourceSel.innerHTML = '';
    const autoOpt = document.createElement('option');
    autoOpt.value = 'auto';
    autoOpt.textContent = 'Auto-detect';
    sourceSel.appendChild(autoOpt);

    SUPPORTED_LANGUAGES.forEach((lang) => {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = lang.name;
      sourceSel.appendChild(opt);
    });

    targetSel.innerHTML = '';
    SUPPORTED_LANGUAGES.forEach((lang) => {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = lang.name;
      targetSel.appendChild(opt);
    });

    syncPopupSelectors();
  }

  function syncPopupSelectors() {
    if (!shadowRoot) return;
    const sourceSel = shadowRoot.getElementById('ll-source-select');
    const targetSel = shadowRoot.getElementById('ll-target-select');
    if (!sourceSel || !targetSel) return;

    sourceSel.value = currentSourceLang;
    targetSel.value = currentTargetLang;

    // Source cannot be the same as target (unless auto)
    for (let i = 0; i < sourceSel.options.length; i++) {
      const opt = sourceSel.options[i];
      opt.disabled = opt.value !== 'auto' && opt.value === currentTargetLang;
    }

    // Target cannot be the same as manual source
    for (let i = 0; i < targetSel.options.length; i++) {
      const opt = targetSel.options[i];
      opt.disabled = currentSourceLang !== 'auto' && opt.value === currentSourceLang;
    }
  }

  function retranslateCurrentSelection() {
    if (!popoverElement || !popoverElement.classList.contains('ll-visible')) return;
    if (!currentSelectionText) return;

    const targetEl = shadowRoot.getElementById('ll-target');
    const translationEl = shadowRoot.getElementById('ll-translation');
    if (targetEl) targetEl.textContent = '…';
    if (translationEl) translationEl.textContent = '…';

    const targetName = TARGET_LANGUAGE_NAMES[currentTargetLang] || FALLBACK_TARGET_LABEL;
    const sourceName = currentSourceLang !== 'auto'
      ? SOURCE_LANGUAGE_NAMES[currentSourceLang] || NEUTRAL_SOURCE_LABEL
      : (lastDetectedSourceLang && SOURCE_LANGUAGE_NAMES[lastDetectedSourceLang]
          ? SOURCE_LANGUAGE_NAMES[lastDetectedSourceLang]
          : (detectSourceLanguageName(currentSelectionText) || 'Source'));
    applyPopupLabels(`${sourceName} text`, `${targetName} translation`);

    currentRequestId += 1;
    dispatchTranslationRequest(currentSelectionText.trim(), currentRequestId);
  }

  /**
   * Viewport Coordinate Boundary Calculator (Position: Fixed)
   * 
   * Uses rect from range.getBoundingClientRect() which is already in viewport coordinates.
   * Accurately aligns popover ~8px strictly above selection, or flips below if top boundary is exceeded.
   */
  function calculatePopoverPosition(rect) {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (!popoverElement) return null;

    const popoverWidth = popoverElement.offsetWidth || CONFIG.MIN_WIDTH;
    const selectionCenterX = rect.left + rect.width / 2;
    const idealLeft = selectionCenterX - popoverWidth / 2;
    const minLeft = CONFIG.VIEWPORT_PADDING;
    const maxLeft = Math.max(minLeft, viewportWidth - popoverWidth - CONFIG.VIEWPORT_PADDING);
    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, idealLeft));
    const arrowX = Math.max(18, Math.min(popoverWidth - 18, selectionCenterX - clampedLeft));

    const spaceAbove = Math.max(0, rect.top - CONFIG.GAP - CONFIG.VIEWPORT_PADDING);
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - CONFIG.GAP - CONFIG.VIEWPORT_PADDING);
    const header = shadowRoot.getElementById('ll-header');
    const content = shadowRoot.getElementById('ll-expanded-content');
    const expanded = popoverElement.classList.contains('ll-expanded');
    const desiredHeight = expanded
      ? (header ? header.offsetHeight : 0) + (content ? content.scrollHeight : 0) + 20
      : popoverElement.scrollHeight;

    let isFlipped;
    if (spaceAbove >= desiredHeight) {
      isFlipped = false;
    } else if (spaceBelow >= desiredHeight) {
      isFlipped = true;
    } else {
      isFlipped = spaceBelow > spaceAbove;
    }

    const availableHeight = isFlipped ? spaceBelow : spaceAbove;
    if (expanded) {
      popoverElement.style.maxHeight = `${Math.max(48, availableHeight)}px`;
      if (content) {
        content.style.maxHeight = `${Math.max(0, availableHeight - (header ? header.offsetHeight : 0) - 20)}px`;
      }
    } else {
      popoverElement.style.maxHeight = `calc(100vh - ${CONFIG.VIEWPORT_PADDING * 2}px)`;
      if (content) content.style.maxHeight = '';
    }

    const popoverHeight = popoverElement.offsetHeight || 36;
    const idealTop = isFlipped
      ? rect.bottom + CONFIG.GAP
      : rect.top - popoverHeight - CONFIG.GAP;
    const finalTop = Math.max(
      CONFIG.VIEWPORT_PADDING,
      Math.min(viewportHeight - popoverHeight - CONFIG.VIEWPORT_PADDING, idealTop)
    );

    return {
      top: Math.round(finalTop),
      left: Math.round(clampedLeft),
      arrowX: Math.round(arrowX),
      arrowClass: isFlipped ? 'll-arrow-top' : 'll-arrow-bottom',
      isFlipped,
    };
  }

  function applyPopoverPosition(coords) {
    if (!popoverElement) return;
    popoverElement.style.top = `${coords.top}px`;
    popoverElement.style.left = `${coords.left}px`;

    // Apply modifier classes to popover container
    if (coords.isFlipped) {
      popoverElement.classList.add('popup--below', 'popup--top-arrow', 'll-popover--below');
      popoverElement.classList.remove('popup--above', 'popup--bottom-arrow', 'll-popover--above');
    } else {
      popoverElement.classList.add('popup--above', 'popup--bottom-arrow', 'll-popover--above');
      popoverElement.classList.remove('popup--below', 'popup--top-arrow', 'll-popover--below');
    }

    if (arrowElement) {
      arrowElement.className = `ll-arrow ${coords.arrowClass}`;
      arrowElement.style.left = `${coords.arrowX - 4}px`;
      if (coords.isFlipped) {
        arrowElement.style.top = '-4px';
        arrowElement.style.bottom = 'auto';
      } else {
        arrowElement.style.bottom = '-4px';
        arrowElement.style.top = 'auto';
      }
    }
  }

  function showPopover(rect, text, requestText = text.trim(), options = {}) {
    if (!popoverElement) initShadowHost();
    if (!popoverElement) return;

    currentSelectionText = text;
    lastSelectionRect = rect;
    currentRequestId += 1;

    // During live-selection refreshes keep the popup in whatever state the
    // user left it (e.g. expanded); new selections always start collapsed.
    const preserveExpanded = options.preserveExpanded === true && popoverElement.classList.contains('ll-expanded');
    if (!preserveExpanded) {
      popoverElement.classList.remove('ll-expanded');
      popoverElement.style.width = '';
      popoverElement.style.maxHeight = `calc(100vh - ${CONFIG.VIEWPORT_PADDING * 2}px)`;

      const toggle = shadowRoot.getElementById('ll-toggle');
      const expandedContent = shadowRoot.getElementById('ll-expanded-content');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Expand translation');
        toggle.title = 'Expand translation';
      }
      if (expandedContent) {
        expandedContent.setAttribute('aria-hidden', 'true');
        expandedContent.style.maxHeight = '';
      }
    }

    const sourceEl = shadowRoot.getElementById('ll-source');
    const targetEl = shadowRoot.getElementById('ll-target');
    const originalEl = shadowRoot.getElementById('ll-original');
    const translationEl = shadowRoot.getElementById('ll-translation');

    if (sourceEl) sourceEl.textContent = text;
    if (targetEl) targetEl.textContent = '…';
    if (originalEl) originalEl.textContent = text;
    if (translationEl) translationEl.textContent = '…';

    // Dynamic labels: detected source language name and selected target
    // language name; neutral fallback when source detection fails.
    syncPopupSelectors();
    const detectedSourceName = currentSourceLang !== 'auto'
      ? SOURCE_LANGUAGE_NAMES[currentSourceLang]
      : detectSourceLanguageName(text);
    const targetLabelName = TARGET_LANGUAGE_NAMES[currentTargetLang] || FALLBACK_TARGET_LABEL;
    applyPopupLabels(
      detectedSourceName ? `${detectedSourceName} text` : NEUTRAL_SOURCE_LABEL,
      `${targetLabelName} translation`
    );

    popoverElement.classList.add('ll-visible');
    const coords = calculatePopoverPosition(rect);
    if (coords) applyPopoverPosition(coords);

    dispatchTranslationRequest(requestText, currentRequestId);
  }

  function hidePopover() {
    if (popoverElement && popoverElement.classList.contains('ll-visible')) {
      popoverElement.classList.remove('ll-visible');
    }
    currentSelectionText = '';
    // Invalidate any in-flight lookup so late responses cannot re-render or
    // reposition the hidden popup (e.g. during live-selection updates).
    currentRequestId += 1;
  }

  const CACHE_PREFIX = 'lextip_trans_';

  function getCacheKey(text, sourceLang = 'auto', targetLang = 'ru') {
    return `${CACHE_PREFIX}${sourceLang}_${targetLang}_${encodeURIComponent(text.trim().toLowerCase())}`;
  }

  function getCachedTranslation(text, sourceLang = 'auto', targetLang = 'ru') {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve(null);
        return;
      }
      const key = getCacheKey(text, sourceLang, targetLang);
      chrome.storage.local.get([key], (result) => {
        if (chrome.runtime.lastError) {
          console.warn('[LexTip] Cache read error:', chrome.runtime.lastError);
          resolve(null);
          return;
        }
        const entry = result && result[key] ? result[key] : null;
        if (!entry) {
          // Backward compatibility: check legacy cache key if source is auto and target is ru
          if (sourceLang === 'auto' && targetLang === 'ru') {
            const legacyKey = `${CACHE_PREFIX}${encodeURIComponent(text.trim().toLowerCase())}_${targetLang}`;
            chrome.storage.local.get([legacyKey], (legacyResult) => {
              const legacyEntry = legacyResult && legacyResult[legacyKey] ? legacyResult[legacyKey] : null;
              if (legacyEntry) {
                if (typeof legacyEntry === 'string') {
                  resolve({ translation: legacyEntry, detectedSourceLang: null });
                  return;
                }
                resolve(legacyEntry.translation ? legacyEntry : null);
                return;
              }
              resolve(null);
            });
            return;
          }
          resolve(null);
          return;
        }
        // Legacy cache entries stored the translation as a plain string.
        if (typeof entry === 'string') {
          resolve({ translation: entry, detectedSourceLang: null });
          return;
        }
        resolve(entry.translation ? entry : null);
      });
    });
  }

  function setCachedTranslation(text, sourceLang = 'auto', targetLang = 'ru', translation, detectedSourceLang = null) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local || !translation) return;
    const key = getCacheKey(text, sourceLang, targetLang);
    const dataToSet = { [key]: { translation, detectedSourceLang } };

    // If source was 'auto' and Google detected a language, also cache under the detected language
    if (sourceLang === 'auto' && detectedSourceLang && detectedSourceLang !== 'auto') {
      const specificKey = getCacheKey(text, detectedSourceLang, targetLang);
      dataToSet[specificKey] = { translation, detectedSourceLang };
    }

    chrome.storage.local.set(dataToSet, () => {
      if (chrome.runtime.lastError) {
        console.warn('[LexTip] Cache write error:', chrome.runtime.lastError);
      }
    });
  }

  function requestDictionaryLookup(text, sourceLang = 'en', targetLang = 'ru', timeoutMs = 800) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        resolve(null);
        return;
      }

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        resolve(null);
      }, timeoutMs);

      chrome.runtime.sendMessage(
        {
          type: 'TRANSLATE_REQUEST',
          payload: { text, sourceLang, targetLang },
        },
        (response) => {
          clearTimeout(timer);
          if (timedOut) return;
          if (chrome.runtime.lastError || !response || !response.success || !response.data) {
            resolve(null);
            return;
          }
          const { translation } = response.data;
          if (!translation || translation.trim().toLowerCase() === 'translation not found') {
            resolve(null);
            return;
          }
          resolve(response.data);
        }
      );
    });
  }

  function requestBackgroundTranslation(text, sourceLang = 'auto', targetLang = 'ru', timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        reject(new Error('Chrome runtime messaging unavailable'));
        return;
      }

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error('Background translation timeout'));
      }, timeoutMs);

      chrome.runtime.sendMessage(
        {
          type: 'GOOGLE_TRANSLATE_REQUEST',
          payload: { text, sourceLang, targetLang },
        },
        (response) => {
          clearTimeout(timer);
          if (timedOut) return;
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.success || !response.data) {
            reject(new Error(response?.error || 'Translation request failed'));
            return;
          }
          resolve(response.data);
        }
      );
    });
  }

  async function dispatchTranslationRequest(text, requestId) {
    let resolved = false;

    const applyFallback = () => {
      if (resolved || !shadowRoot || requestId !== currentRequestId) return;
      resolved = true;
      updatePopoverContent({
        translation: 'Translation not found',
        selectedWord: text,
        lemma: text,
      });
    };

    // If source and target are the same manual language, handle gracefully
    if (currentSourceLang !== 'auto' && currentSourceLang === currentTargetLang) {
      resolved = true;
      updatePopoverContent({
        translation: text,
        selectedWord: text,
        lemma: text,
      });
      return;
    }

    try {
      // 1. Tier 1: Check offline dictionaries
      // Local dictionary only indexes English -> Russian.
      // If targetLang is not 'ru', or sourceLang is not 'en' or 'auto', skip dictionary.
      const isEnglishCandidate = currentSourceLang === 'en'
        || (currentSourceLang === 'auto' && detectSourceLanguageName(text) === 'English');
      const canUseDictionary = currentTargetLang === 'ru' && isEnglishCandidate;

      if (canUseDictionary) {
        const dictResult = await requestDictionaryLookup(text, currentSourceLang, currentTargetLang);
        if (requestId !== currentRequestId) return;

        if (dictResult) {
          resolved = true;
          lastDetectedSourceLang = 'en';
          updatePopoverContent(dictResult);
          return;
        }
      }

      // 2. Tier 2: Check browser local cache
      const cached = await getCachedTranslation(text, currentSourceLang, currentTargetLang);
      if (requestId !== currentRequestId) return;

      if (cached && cached.translation) {
        resolved = true;
        if (cached.detectedSourceLang) {
          lastDetectedSourceLang = cached.detectedSourceLang;
        }
        const effectiveSource = currentSourceLang !== 'auto' ? currentSourceLang : cached.detectedSourceLang;
        const cachedSourceName = effectiveSource
          ? SOURCE_LANGUAGE_NAMES[String(effectiveSource).toLowerCase()] || null
          : null;
        if (cachedSourceName) {
          const targetName = TARGET_LANGUAGE_NAMES[currentTargetLang] || FALLBACK_TARGET_LABEL;
          applyPopupLabels(`${cachedSourceName} text`, `${targetName} translation`);
        }
        updatePopoverContent({
          translation: cached.translation,
          selectedWord: text,
          lemma: text,
        });
        return;
      }

      // 3. Tier 3: Fetch from Google Translate endpoint
      const result = await requestBackgroundTranslation(text, currentSourceLang, currentTargetLang);
      if (requestId !== currentRequestId) return;

      if (result && result.translation) {
        resolved = true;
        if (result.detectedSourceLang) {
          lastDetectedSourceLang = result.detectedSourceLang;
        }
        setCachedTranslation(text, currentSourceLang, currentTargetLang, result.translation, result.detectedSourceLang);
        // Update the source label automatically with the language Google detected or manual selection
        const effectiveSource = currentSourceLang !== 'auto' ? currentSourceLang : result.detectedSourceLang;
        const googleSourceName = effectiveSource
          ? SOURCE_LANGUAGE_NAMES[String(effectiveSource).toLowerCase()] || null
          : null;
        const targetName = TARGET_LANGUAGE_NAMES[currentTargetLang] || FALLBACK_TARGET_LABEL;
        applyPopupLabels(
          googleSourceName ? `${googleSourceName} text` : NEUTRAL_SOURCE_LABEL,
          `${targetName} translation`
        );
        updatePopoverContent({
          translation: result.translation,
          selectedWord: text,
          lemma: text,
        });
      } else {
        applyFallback();
      }
    } catch (error) {
      console.warn('[LexTip] Translation dispatch error:', error);
      applyFallback();
    }
  }

  function updatePopoverContent(data) {
    if (!shadowRoot) return;
    const sourceEl = shadowRoot.getElementById('ll-source');
    const targetEl = shadowRoot.getElementById('ll-target');
    const originalEl = shadowRoot.getElementById('ll-original');
    const translationEl = shadowRoot.getElementById('ll-translation');

    const targetTranslation =
      !data || !data.translation || data.translation.trim().toLowerCase() === 'translation not found'
        ? 'Translation not found'
        : data.translation;

    // Headword line prepared by the dictionary service: matched lemma plus the
    // original selection in parentheses when lemmatization changed the form.
    // Falls back to the raw selection for cache/Google tiers that have no
    // dictionary metadata. The full original selection always stays visible.
    const displayHeadword = (data && typeof data.displayHeadword === 'string' && data.displayHeadword)
      || currentSelectionText;

    if (sourceEl) sourceEl.textContent = displayHeadword;
    if (targetEl) targetEl.textContent = targetTranslation;
    // The expanded popup reuses the same formatted headword as the collapsed
    // one: matched lemma plus the original selection in parentheses when
    // lemmatization changed the form.
    if (originalEl) originalEl.textContent = displayHeadword;
    if (translationEl) translationEl.textContent = targetTranslation;

    // Keep labels in sync with the latest lookup result
    const effectiveSource = currentSourceLang !== 'auto'
      ? currentSourceLang
      : (lastDetectedSourceLang || detectSourceLanguageName(currentSelectionText));
    const sourceLabelName = SOURCE_LANGUAGE_NAMES[effectiveSource] || (effectiveSource === 'English' ? 'English' : null);
    const targetLabelName = TARGET_LANGUAGE_NAMES[currentTargetLang] || FALLBACK_TARGET_LABEL;
    applyPopupLabels(
      sourceLabelName ? `${sourceLabelName} text` : NEUTRAL_SOURCE_LABEL,
      `${targetLabelName} translation`
    );

    if (popoverElement && popoverElement.classList.contains('ll-visible') && (lastActiveRange || lastSelectionRect)) {
      try {
        const rect = lastActiveRange ? lastActiveRange.getBoundingClientRect() : lastSelectionRect;
        lastSelectionRect = rect;
        const coords = calculatePopoverPosition(rect);
        if (coords) applyPopoverPosition(coords);
      } catch (error) {
        console.warn('[LexTip] Could not reposition popup after translation:', error);
      }
    }
  }

  function togglePopover() {
    if (!popoverElement || !shadowRoot) return;
    const expanded = !popoverElement.classList.contains('ll-expanded');
    const toggle = shadowRoot.getElementById('ll-toggle');
    const expandedContent = shadowRoot.getElementById('ll-expanded-content');

    if (expanded) {
      popoverElement.style.width = `${popoverElement.offsetWidth}px`;
      popoverElement.classList.add('ll-expanded');
    } else {
      popoverElement.classList.remove('ll-expanded');
      popoverElement.style.width = '';
    }

    if (toggle) {
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', expanded ? 'Collapse translation' : 'Expand translation');
      toggle.title = expanded ? 'Collapse translation' : 'Expand translation';
    }
    if (expandedContent) expandedContent.setAttribute('aria-hidden', String(!expanded));

    if (lastActiveRange || lastSelectionRect) {
      try {
        const rect = lastActiveRange ? lastActiveRange.getBoundingClientRect() : lastSelectionRect;
        lastSelectionRect = rect;
        const coords = calculatePopoverPosition(rect);
        if (coords) applyPopoverPosition(coords);
      } catch (error) {
        console.warn('[LexTip] Could not reposition popup after toggling:', error);
      }
    }
  }

  function handleSelectionEvaluation() {
    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      const selectionInfo = getValidatedSelection();
      if (!selectionInfo) return;
      lastLiveSelectionText = selectionInfo.text;
      showPopover(selectionInfo.rect, selectionInfo.selectedText, selectionInfo.text);
    }, CONFIG.DEBOUNCE_MS);
  }

  // Shared validation for both final (mouseup/dblclick) and live (dragging)
  // selections. Returns null when the current selection should be ignored.
  function getValidatedSelection() {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }

    const selectedText = selection.toString();
    const text = selectedText.trim();
    if (!text || text.length > CONFIG.MAX_SELECTION_LENGTH) {
      return null;
    }

    const anchorNode = selection.anchorNode;
    const targetElement = anchorNode ? (anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement) : null;

    if (targetElement) {
      if (targetElement.tagName === 'INPUT' && targetElement.type === 'password') return null;
      if (targetElement.closest && targetElement.closest('[data-lextip-ignore]')) return null;
      if (targetElement.id === CONFIG.HOST_TAG_ID || (hostElement && hostElement.contains(targetElement))) return null;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Guard against zero-dimension selections
    if (rect.width === 0 && rect.height === 0) return null;

    lastActiveRange = range;
    return { selectedText, text, rect };
  }

  // Live updates while the user is still dragging a selection: every
  // LIVE_SELECTION_DEBOUNCE_MS (~500 ms) after the selection last changed,
  // re-translate whatever is currently selected so the popup keeps up with
  // an extending highlight instead of waiting for mouseup.
  function handleLiveSelectionEvaluation() {
    clearTimeout(liveDebounceTimer);

    liveDebounceTimer = setTimeout(() => {
      if (!isMouseDragging) return;

      const selectionInfo = getValidatedSelection();
      if (!selectionInfo) return;
      if (selectionInfo.text === lastLiveSelectionText) return;

      lastLiveSelectionText = selectionInfo.text;
      const wasVisible = popoverElement && popoverElement.classList.contains('ll-visible');
      showPopover(selectionInfo.rect, selectionInfo.selectedText, selectionInfo.text, { preserveExpanded: wasVisible });
    }, CONFIG.LIVE_SELECTION_DEBOUNCE_MS);
  }

  function setupEventListeners() {
    document.addEventListener('mousedown', (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      if (hostElement && (path.includes(hostElement) || hostElement.contains(e.target))) return;
      isMouseDragging = true;
      lastLiveSelectionText = '';
      clearTimeout(liveDebounceTimer);
    });

    document.addEventListener('mouseup', (e) => {
      isMouseDragging = false;
      clearTimeout(liveDebounceTimer);
      const path = e.composedPath ? e.composedPath() : [];
      if (hostElement && (path.includes(hostElement) || hostElement.contains(e.target))) return;
      handleSelectionEvaluation();
    });

    document.addEventListener('dblclick', (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      if (hostElement && (path.includes(hostElement) || hostElement.contains(e.target))) return;
      handleSelectionEvaluation();
    });

    // Fires on every selection change, including intermediate ones while the
    // mouse button is held down. Only used for live drag updates here; the
    // existing mouseup/dblclick flow is untouched.
    document.addEventListener('selectionchange', () => {
      if (!isMouseDragging) return;
      handleLiveSelectionEvaluation();
    });

    // Escape Key: immediate dismissal
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
          if (popoverElement && popoverElement.classList.contains('ll-visible')) {
            hidePopover();
          }
        }
      },
      true
    );

    // Click anywhere outside to dismiss
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (!popoverElement || !popoverElement.classList.contains('ll-visible')) return;
        const path = e.composedPath ? e.composedPath() : [];
        const isInsidePopover = hostElement && (path.includes(hostElement) || hostElement.contains(e.target));
        if (!isInsidePopover) {
          hidePopover();
        }
      },
      true
    );

    // Dynamic Scroll Follow & Dismiss on Out-of-View
    window.addEventListener(
      'scroll',
      () => {
        if (!popoverElement || !popoverElement.classList.contains('ll-visible') || !lastActiveRange) return;
        try {
          const rect = lastActiveRange.getBoundingClientRect();
          lastSelectionRect = rect;
          // If scrolled entirely off screen, hide
          if (rect.bottom < 0 || rect.top > window.innerHeight) {
            hidePopover();
          } else {
            const coords = calculatePopoverPosition(rect);
            if (coords) applyPopoverPosition(coords);
          }
        } catch (error) {
          console.warn('[LexTip] Could not reposition popup after scrolling:', error);
          hidePopover();
        }
      },
      { passive: true }
    );

    window.addEventListener(
      'resize',
      () => {
        if (!popoverElement || !popoverElement.classList.contains('ll-visible') || !lastActiveRange) return;
        try {
          const rect = lastActiveRange.getBoundingClientRect();
          lastSelectionRect = rect;
          const coords = calculatePopoverPosition(rect);
          if (coords) applyPopoverPosition(coords);
        } catch (error) {
          console.warn('[LexTip] Could not reposition popup after resizing:', error);
          hidePopover();
        }
      },
      { passive: true }
    );
  }

  function setupSPAMutationObserver() {
    mutationObserver = new MutationObserver((mutations) => {
      let hostDetached = false;

      for (let i = 0; i < mutations.length; i++) {
        const mutation = mutations[i];
        if (mutation.removedNodes) {
          for (let j = 0; j < mutation.removedNodes.length; j++) {
            if (mutation.removedNodes[j] === hostElement) {
              hostDetached = true;
              break;
            }
          }
        }
      }

      if (hostDetached && hostElement && !document.contains(hostElement)) {
        (document.documentElement || document.body).appendChild(hostElement);
      }
    });

    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function init() {
    loadSavedPreferences();
    initShadowHost();
    setupEventListeners();
    setupSPAMutationObserver();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes) => {
        let updated = false;
        if (changes[STORAGE_KEYS.SOURCE_LANG]) {
          currentSourceLang = changes[STORAGE_KEYS.SOURCE_LANG].newValue || DEFAULT_SOURCE_LANG;
          updated = true;
        }
        if (changes[STORAGE_KEYS.TARGET_LANG]) {
          currentTargetLang = changes[STORAGE_KEYS.TARGET_LANG].newValue || DEFAULT_TARGET_LANG;
          updated = true;
        }
        if (updated) {
          syncPopupSelectors();
          if (popoverElement && popoverElement.classList.contains('ll-visible')) {
            retranslateCurrentSelection();
          }
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__LEXTIP_API__ = {
    showAtRect: (rect, text) => showPopover(rect, text),
    hide: () => hidePopover(),
    updateContent: (data) => updatePopoverContent(data),
    getIsVisible: () => popoverElement && popoverElement.classList.contains('ll-visible'),
  };
})();
