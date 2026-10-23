/**
 * LinguaLens - Content Script
 * Precision Viewport Positioning Engine (Fixed Coordinates + Dynamic Boundary Flipping)
 */

(function () {
  'use strict';

  if (window.__LINGUALENS_INITIALIZED__) return;
  window.__LINGUALENS_INITIALIZED__ = true;

  const CONFIG = {
    DEBOUNCE_MS: 150,
    VIEWPORT_PADDING: 12,
    GAP: 8, // Strictly ~8px gap above/below selection
    HOST_TAG_ID: 'lingualens-popover-host',
    MAX_SELECTION_LENGTH: 300,
    RATE_LIMIT_REQUESTS: 3, // Max requests per second
    RATE_LIMIT_WINDOW_MS: 1000, // 1 second window
  };

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
      align-items: center;
      gap: 10px;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 8px;
      box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.6), 0 4px 6px -2px rgba(0, 0, 0, 0.4);
      padding: 6px 10px;
      opacity: 0;
      transform: translateY(4px) scale(0.98);
      transition: opacity 120ms ease-out, transform 120ms ease-out;
      pointer-events: none;
      user-select: text;
      font-size: 13px;
      line-height: 1.4;
      white-space: nowrap;
      max-width: min(480px, calc(100vw - 24px));
      z-index: 2147483647;
    }
    .ll-popover.ll-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }
    .ll-translation-text {
      font-weight: 500;
      color: #f1f5f9;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 320px;
    }
    .ll-source {
      color: #94a3b8;
      font-weight: 400;
    }
    .ll-divider {
      color: #64748b;
      margin: 0 4px;
    }
    .ll-target {
      color: #38bdf8;
      font-weight: 600;
    }
    .ll-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .ll-explain-btn {
      display: inline-flex;
      align-items: center;
      background: #4f46e5;
      color: #ffffff;
      border: none;
      border-radius: 5px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      line-height: 1.3;
      transition: background-color 100ms ease;
      white-space: nowrap;
    }
    .ll-explain-btn:hover {
      background: #4338ca;
    }
    .ll-explain-btn:active {
      background: #3730a3;
    }
    .ll-close-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      padding: 2px 4px;
      font-size: 15px;
      line-height: 1;
      border-radius: 4px;
      transition: color 100ms ease, background-color 100ms ease;
    }
    .ll-close-btn:hover {
      color: #ffffff;
      background: #1e293b;
    }
    .ll-arrow {
      position: absolute;
      width: 8px;
      height: 8px;
      background: #0f172a;
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
      border-right: 1px solid #334155;
      border-bottom: 1px solid #334155;
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
      border-left: 1px solid #334155;
      border-top: 1px solid #334155;
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

  // Rate limiting state (sliding window)
  let requestTimestamps = [];

  /**
   * Rate limiter using sliding window algorithm
   */
  function checkRateLimit() {
    const now = Date.now();
    const windowStart = now - CONFIG.RATE_LIMIT_WINDOW_MS;

    // Remove timestamps outside the window
    while (requestTimestamps.length > 0 && requestTimestamps[0] < windowStart) {
      requestTimestamps.shift();
    }

    // Check if limit exceeded
    if (requestTimestamps.length >= CONFIG.RATE_LIMIT_REQUESTS) {
      return false;
    }

    // Add current timestamp
    requestTimestamps.push(now);
    return true;
  }

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
        <div class="ll-translation-text" id="ll-text-container">
          <span class="ll-source" id="ll-source"></span>
          <span class="ll-divider">—</span>
          <span class="ll-target" id="ll-target">Translating...</span>
        </div>
        <div class="ll-actions">
          <button class="ll-explain-btn" id="ll-explain">Explain Nuance</button>
          <button class="ll-close-btn" id="ll-close" aria-label="Close popover">&times;</button>
        </div>
      `;

      shadowRoot.appendChild(template);
      popoverElement = template;
      arrowElement = shadowRoot.getElementById('ll-arrow');

      shadowRoot.getElementById('ll-close').addEventListener('click', (e) => {
        e.stopPropagation();
        hidePopover();
      });

      shadowRoot.getElementById('ll-explain').addEventListener('click', (e) => {
        e.stopPropagation();
        handleExplainTrigger();
      });
    } catch (err) {
      console.warn('[LinguaLens] Initialization error:', err);
    }
  }

  function applyShadowStyles(root) {
    if ('adoptedStyleSheets' in Document.prototype && 'replaceSync' in CSSStyleSheet.prototype) {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(ISOLATED_CSS);
        root.adoptedStyleSheets = [sheet];
        return;
      } catch (e) {}
    }
    try {
      const styleEl = document.createElement('style');
      styleEl.textContent = ISOLATED_CSS;
      root.appendChild(styleEl);
    } catch (e) {
      console.error('[LinguaLens] Failed to inject styles:', e);
    }
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

    // Actual rendered dimensions of popover
    const popoverWidth = popoverElement ? popoverElement.offsetWidth || 260 : 260;
    const popoverHeight = popoverElement ? popoverElement.offsetHeight || 36 : 36;

    // 1. Horizontal Centering on selection
    const selectionCenterX = rect.left + rect.width / 2;
    const idealLeft = selectionCenterX - popoverWidth / 2;

    // Clamp horizontally to stay within viewport
    const minLeft = CONFIG.VIEWPORT_PADDING;
    const maxLeft = viewportWidth - popoverWidth - CONFIG.VIEWPORT_PADDING;
    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, idealLeft));

    // Arrow relative to popover box
    const arrowX = Math.max(12, Math.min(popoverWidth - 12, selectionCenterX - clampedLeft));

    // 2. Vertical Placement & Boundary Flipping Logic
    // Space available between selection top and viewport top
    const spaceAbove = rect.top;
    const neededAbove = popoverHeight + CONFIG.GAP + CONFIG.VIEWPORT_PADDING;

    let finalTop;
    let arrowClass;
    let isFlipped = false;

    if (spaceAbove >= neededAbove) {
      // Room available: strictly 8px ABOVE selection -> arrow at bottom pointing down
      finalTop = rect.top - popoverHeight - CONFIG.GAP;
      arrowClass = 'll-arrow-bottom';
      isFlipped = false;
    } else {
      // Near top of viewport: FLIP below selection by strictly 8px -> arrow at top pointing up
      finalTop = rect.bottom + CONFIG.GAP;
      arrowClass = 'll-arrow-top';
      isFlipped = true;
    }

    // Clamp vertically within screen
    finalTop = Math.max(CONFIG.VIEWPORT_PADDING, Math.min(viewportHeight - popoverHeight - CONFIG.VIEWPORT_PADDING, finalTop));

    return {
      top: Math.round(finalTop),
      left: Math.round(clampedLeft),
      arrowX: Math.round(arrowX),
      arrowClass: arrowClass,
      isFlipped: isFlipped,
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
      arrowElement.style.left = `${coords.arrowX}px`;
      if (coords.isFlipped) {
        arrowElement.style.top = '-4px';
        arrowElement.style.bottom = 'auto';
      } else {
        arrowElement.style.bottom = '-4px';
        arrowElement.style.top = 'auto';
      }
    }
  }

  function showPopover(rect, text) {
    if (!popoverElement) initShadowHost();
    if (!popoverElement) return;

    currentSelectionText = text;

    const sourceEl = shadowRoot.getElementById('ll-source');
    const targetEl = shadowRoot.getElementById('ll-target');

    if (sourceEl) sourceEl.textContent = `${text} (${text})`;
    if (targetEl) targetEl.textContent = '...';

    // Make visible to measure true DOM dimensions
    popoverElement.classList.add('ll-visible');

    // Compute fixed viewport coordinates and apply position & modifier classes
    const coords = calculatePopoverPosition(rect);
    applyPopoverPosition(coords);

    dispatchTranslationRequest(text);
  }

  function hidePopover() {
    if (popoverElement && popoverElement.classList.contains('ll-visible')) {
      popoverElement.classList.remove('ll-visible');
    }
    currentSelectionText = '';
  }

  function dispatchTranslationRequest(text) {
    // Check rate limit before dispatching
    if (!checkRateLimit()) {
      console.warn('[LinguaLens] Rate limit exceeded, throttling request');
      // Still attempt the request after a delay
      setTimeout(() => {
        dispatchTranslationRequest(text);
      }, CONFIG.RATE_LIMIT_WINDOW_MS);
      return;
    }

    let resolved = false;

    const applyFallback = () => {
      if (resolved || !shadowRoot) return;
      resolved = true;
      updatePopoverContent({
        translation: 'Translation not found',
        selectedWord: text,
        lemma: text,
      });
    };

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        const timer = setTimeout(applyFallback, 400);

        chrome.runtime.sendMessage(
          {
            type: 'TRANSLATE_REQUEST',
            payload: { text, targetLang: 'auto' },
          },
          (response) => {
            clearTimeout(timer);
            if (chrome.runtime.lastError || !response || !response.success || !response.data) {
              applyFallback();
              return;
            }
            resolved = true;
            updatePopoverContent(response.data);
          }
        );
      } catch (err) {
        applyFallback();
      }
    } else {
      setTimeout(() => {
        applyFallback();
      }, 50);
    }
  }

  function updatePopoverContent(data) {
    if (!shadowRoot) return;
    const sourceEl = shadowRoot.getElementById('ll-source');
    const dividerEl = shadowRoot.querySelector('.ll-divider');
    const targetEl = shadowRoot.getElementById('ll-target');

    const lemma = (data && (data.lemma || data.selectedWord)) || currentSelectionText || '';
    const rawSelected = (data && (data.selectedWord || data.lemma)) || currentSelectionText || '';
    
    const cleanLemma = lemma.trim().toLowerCase().replace(/^[\s"'`“‘«„\[\(\{<>\.,;:!?\-_—–#*~]+/, '').replace(/[\s"'`”’»“\]\)\}<>\.,;:!?\-_—–#*~]+$/, '');
    const cleanSelected = rawSelected.trim().toLowerCase().replace(/^[\s"'`“‘«„\[\(\{<>\.,;:!?\-_—–#*~]+/, '').replace(/[\s"'`”’»“\]\)\}<>\.,;:!?\-_—–#*~]+$/, '');
    const selectedWord = cleanSelected;

    const targetTranslation =
      !data || !data.translation || data.translation.trim().toLowerCase() === 'translation not found'
        ? 'Translation not found'
        : data.translation;

    if (dividerEl) dividerEl.style.display = 'inline';

    if (sourceEl) {
      if (cleanLemma === cleanSelected || !cleanLemma || !cleanSelected) {
        sourceEl.textContent = selectedWord || lemma;
      } else {
        sourceEl.textContent = `${cleanLemma} (${cleanSelected})`;
      }
    }

    if (targetEl) {
      targetEl.textContent = targetTranslation;
    }


    // Re-anchor when content width updates
    if (lastActiveRange && popoverElement) {
      try {
        const rect = lastActiveRange.getBoundingClientRect();
        const coords = calculatePopoverPosition(rect);
        applyPopoverPosition(coords);
      } catch (e) {}
    }
  }

  function handleExplainTrigger() {
    if (!currentSelectionText) return;
    const targetEl = shadowRoot ? shadowRoot.getElementById('ll-target') : null;
    if (targetEl) targetEl.textContent = 'Analyzing...';

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'AI_EXPLAIN_REQUEST',
        payload: { text: currentSelectionText },
      });
    } else {
      window.dispatchEvent(
        new CustomEvent('lingualens:ai_explain_request', {
          detail: { text: currentSelectionText },
        })
      );
    }
  }

  function handleSelectionEvaluation() {
    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
      const selection = window.getSelection();

      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return;
      }

      const text = selection.toString().trim();
      if (!text || text.length > CONFIG.MAX_SELECTION_LENGTH) {
        return;
      }

      const anchorNode = selection.anchorNode;
      const targetElement = anchorNode ? (anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement) : null;

      if (targetElement) {
        if (targetElement.tagName === 'INPUT' && targetElement.type === 'password') return;
        if (targetElement.closest && targetElement.closest('[data-lingualens-ignore]')) return;
        if (targetElement.id === CONFIG.HOST_TAG_ID || (hostElement && hostElement.contains(targetElement))) return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Guard against zero-dimension selections
      if (rect.width === 0 && rect.height === 0) return;

      lastActiveRange = range;
      showPopover(rect, text);
    }, CONFIG.DEBOUNCE_MS);
  }

  function setupEventListeners() {
    document.addEventListener('mouseup', (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      if (hostElement && (path.includes(hostElement) || hostElement.contains(e.target))) return;
      handleSelectionEvaluation();
    });

    document.addEventListener('dblclick', (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      if (hostElement && (path.includes(hostElement) || hostElement.contains(e.target))) return;
      handleSelectionEvaluation();
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
          // If scrolled entirely off screen, hide
          if (rect.bottom < 0 || rect.top > window.innerHeight) {
            hidePopover();
          } else {
            const coords = calculatePopoverPosition(rect);
            applyPopoverPosition(coords);
          }
        } catch (e) {
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
    initShadowHost();
    setupEventListeners();
    setupSPAMutationObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.__LINGUALENS_API__ = {
    showAtRect: (rect, text) => showPopover(rect, text),
    hide: () => hidePopover(),
    updateContent: (data) => updatePopoverContent(data),
    getIsVisible: () => popoverElement && popoverElement.classList.contains('ll-visible'),
  };
})();
