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
    VIEWPORT_PADDING: 12,
    GAP: 8,
    MIN_WIDTH: 220,
    MAX_WIDTH: 480,
    HOST_TAG_ID: 'lextip-popover-host',
    MAX_SELECTION_LENGTH: 300,
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
          <div class="ll-expanded-title">Original text</div>
          <button class="ll-toggle" id="ll-toggle" type="button" aria-expanded="false" aria-controls="ll-expanded-content" aria-label="Expand translation" title="Expand translation">⋯</button>
        </div>
        <div class="ll-expanded-content" id="ll-expanded-content" aria-hidden="true">
          <div class="ll-detail-text ll-original" id="ll-original"></div>
          <div class="ll-detail-divider" aria-hidden="true"></div>
          <div>
            <div class="ll-detail-label">Russian translation</div>
            <div class="ll-detail-text ll-detail-translation" id="ll-translation"></div>
          </div>
        </div>
      `;

      shadowRoot.appendChild(template);
      popoverElement = template;
      arrowElement = shadowRoot.getElementById('ll-arrow');

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

  function showPopover(rect, text, requestText = text.trim()) {
    if (!popoverElement) initShadowHost();
    if (!popoverElement) return;

    currentSelectionText = text;
    lastSelectionRect = rect;
    currentRequestId += 1;
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

    const sourceEl = shadowRoot.getElementById('ll-source');
    const targetEl = shadowRoot.getElementById('ll-target');
    const originalEl = shadowRoot.getElementById('ll-original');
    const translationEl = shadowRoot.getElementById('ll-translation');

    if (sourceEl) sourceEl.textContent = text;
    if (targetEl) targetEl.textContent = '…';
    if (originalEl) originalEl.textContent = text;
    if (translationEl) translationEl.textContent = '…';

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
  }

  function dispatchTranslationRequest(text, requestId) {
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
            if (requestId !== currentRequestId) return;
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
    const targetEl = shadowRoot.getElementById('ll-target');
    const originalEl = shadowRoot.getElementById('ll-original');
    const translationEl = shadowRoot.getElementById('ll-translation');

    const targetTranslation =
      !data || !data.translation || data.translation.trim().toLowerCase() === 'translation not found'
        ? 'Translation not found'
        : data.translation;

    if (sourceEl) sourceEl.textContent = currentSelectionText;
    if (targetEl) targetEl.textContent = targetTranslation;
    if (originalEl) originalEl.textContent = currentSelectionText;
    if (translationEl) translationEl.textContent = targetTranslation;

    if (popoverElement && (lastActiveRange || lastSelectionRect)) {
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
      const selection = window.getSelection();

      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return;
      }

      const selectedText = selection.toString();
      const text = selectedText.trim();
      if (!text || text.length > CONFIG.MAX_SELECTION_LENGTH) {
        return;
      }

      const anchorNode = selection.anchorNode;
      const targetElement = anchorNode ? (anchorNode.nodeType === Node.ELEMENT_NODE ? anchorNode : anchorNode.parentElement) : null;

      if (targetElement) {
        if (targetElement.tagName === 'INPUT' && targetElement.type === 'password') return;
        if (targetElement.closest && targetElement.closest('[data-lextip-ignore]')) return;
        if (targetElement.id === CONFIG.HOST_TAG_ID || (hostElement && hostElement.contains(targetElement))) return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Guard against zero-dimension selections
      if (rect.width === 0 && rect.height === 0) return;

      lastActiveRange = range;
      showPopover(rect, selectedText, text);
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
    initShadowHost();
    setupEventListeners();
    setupSPAMutationObserver();
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
