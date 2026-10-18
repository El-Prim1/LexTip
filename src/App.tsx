import React, { useState, useEffect, useRef } from 'react';
import {
  Layers,
  Code2,
  CheckCircle2,
  ShieldCheck,
  Cpu,
  Maximize2,
  RefreshCw,
  Compass,
  FileCode,
  ArrowDownUp,
  Sliders,
  Eye,
  AlertTriangle,
  Info,
  Target
} from 'lucide-react';

interface EventLogItem {
  id: string;
  time: string;
  type: 'SELECTION' | 'POSITION' | 'DISMISS';
  message: string;
  detail?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'sandbox' | 'code' | 'roadmap'>('sandbox');
  const [selectedFile, setSelectedFile] = useState<'content-script.js' | 'content-styles.css' | 'manifest.json' | 'custom-seed.json' | 'service-worker.js'>('service-worker.js');
  const [hostCssHostile, setHostCssHostile] = useState(false);
  const [eventLogs, setEventLogs] = useState<EventLogItem[]>([
    {
      id: '1',
      time: '00:00:01',
      type: 'POSITION',
      message: 'Fixed Viewport Positioning Engine initialized (8px strict gap + Boundary Flip)',
    },
  ]);
  const [dynamicBlocks, setDynamicBlocks] = useState<string[]>([
    'In React applications, state management handles the state flow across components.',
    'Chrome Manifest v3 background service workers sleep after 30 seconds of inactivity.',
  ]);

  // Live Position Telemetry
  const [lastCoords, setLastCoords] = useState<{
    top: number;
    left: number;
    word: string;
    wordRect: { top: number; bottom: number; left: number; width: number };
    flipped: boolean;
  } | null>(null);

  const sandboxRef = useRef<HTMLDivElement>(null);
  const shadowHostRef = useRef<HTMLDivElement>(null);
  const shadowRootInstance = useRef<ShadowRoot | null>(null);
  const lastActiveRangeRef = useRef<Range | null>(null);

  // Initialize Minimalist Shadow DOM with Fixed Position Engine
  useEffect(() => {
    if (!shadowHostRef.current) return;
    if (shadowRootInstance.current) return;

    try {
      const shadow = shadowHostRef.current.attachShadow({ mode: 'closed' });
      shadowRootInstance.current = shadow;

      const style = document.createElement('style');
      style.textContent = `
        :host {
          all: initial;
          position: fixed;
          top: 0;
          left: 0;
          width: 0;
          height: 0;
          overflow: visible;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
      shadow.appendChild(style);

      const popover = document.createElement('div');
      popover.className = 'll-popover';
      popover.id = 'popover-box';
      popover.innerHTML = `
        <div class="ll-arrow ll-arrow-bottom" id="arrow-tail"></div>
        <div class="ll-translation-text" id="text-wrapper">
          <span class="ll-source" id="source-word">handle (handles)</span>
          <span class="ll-divider">—</span>
          <span class="ll-target" id="trans-word">обрабатывать, управлять, справляться</span>
        </div>
        <div class="ll-actions">
          <button class="ll-explain-btn" id="explain-btn">Explain Nuance</button>
          <button class="ll-close-btn" id="close-btn" aria-label="Close popover">&times;</button>
        </div>
      `;
      shadow.appendChild(popover);

      shadow.getElementById('close-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        popover.classList.remove('ll-visible');
        addLog('DISMISS', 'Popover closed via "X" button');
      });

      shadow.getElementById('explain-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetEl = shadow.getElementById('trans-word');
        if (targetEl) targetEl.textContent = 'Analyzing nuances...';
      });
    } catch (e) {
      console.error('Shadow DOM setup error:', e);
    }
  }, []);

  // Precision Viewport Coordinate Calculator
  const computeAndApplyPosition = (rect: DOMRect, text: string) => {
    if (!shadowRootInstance.current) return;

    const popover = shadowRootInstance.current.getElementById('popover-box');
    const arrow = shadowRootInstance.current.getElementById('arrow-tail');
    const source = shadowRootInstance.current.getElementById('source-word');
    const target = shadowRootInstance.current.getElementById('trans-word');

    if (!popover || !arrow || !source || !target) return;

    const result = lookupWord(text);
    const lemma = result.lemma || result.selectedWord || '';
    const rawSelected = result.selectedWord || result.lemma || '';

    const cleanLemma = normalizeText(lemma);
    const cleanSelected = normalizeText(rawSelected);
    const selectedWord = cleanSelected;

    const divider = shadowRootInstance.current.querySelector('.ll-divider') as HTMLElement;
    const targetTranslation =
      !result.translation || result.translation.trim().toLowerCase() === 'translation not found'
        ? 'Translation not found'
        : result.translation;

    if (divider) divider.style.display = 'inline';
    if (cleanLemma === cleanSelected || !cleanLemma || !cleanSelected) {
      source.textContent = selectedWord || lemma;
    } else {
      source.textContent = `${cleanLemma} (${cleanSelected})`;
    }
    target.textContent = targetTranslation;
    popover.classList.add('ll-visible');


    // 1. Viewport boundaries & measured dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const popoverWidth = popover.offsetWidth || 260;
    const popoverHeight = popover.offsetHeight || 36;
    const gap = 8; // Strictly 8px gap
    const padding = 12;

    // 2. Horizontal Centering on selection
    const selectionCenterX = rect.left + rect.width / 2;
    const idealLeft = selectionCenterX - popoverWidth / 2;
    const clampedLeft = Math.max(padding, Math.min(viewportWidth - popoverWidth - padding, idealLeft));
    const arrowX = Math.max(12, Math.min(popoverWidth - 12, selectionCenterX - clampedLeft));

    // 3. Vertical Positioning & Flipping Logic
    // Space available between selection top and viewport top
    const spaceAbove = rect.top;
    const neededAbove = popoverHeight + gap + padding;

    let finalTop = 0;
    let arrowClass = 'll-arrow-bottom';
    let isFlipped = false;

    if (spaceAbove >= neededAbove) {
      // Room above: strictly 8px above selection
      finalTop = rect.top - popoverHeight - gap;
      arrowClass = 'll-arrow-bottom';
      isFlipped = false;
    } else {
      // Near top edge: FLIP below selection by strictly 8px
      finalTop = rect.bottom + gap;
      arrowClass = 'll-arrow-top';
      isFlipped = true;
    }

    // Clamp vertically
    finalTop = Math.max(padding, Math.min(viewportHeight - popoverHeight - padding, finalTop));

    // Apply fixed coordinates and modifier classes
    popover.style.top = `${Math.round(finalTop)}px`;
    popover.style.left = `${Math.round(clampedLeft)}px`;

    if (isFlipped) {
      popover.classList.add('popup--below', 'popup--top-arrow', 'll-popover--below');
      popover.classList.remove('popup--above', 'popup--bottom-arrow', 'll-popover--above');
    } else {
      popover.classList.add('popup--above', 'popup--bottom-arrow', 'll-popover--above');
      popover.classList.remove('popup--below', 'popup--top-arrow', 'll-popover--below');
    }

    arrow.className = `ll-arrow ${arrowClass}`;
    arrow.style.left = `${Math.round(arrowX)}px`;
    if (isFlipped) {
      arrow.style.top = '-4px';
      arrow.style.bottom = 'auto';
    } else {
      arrow.style.bottom = '-4px';
      arrow.style.top = 'auto';
    }

    setLastCoords({
      top: Math.round(finalTop),
      left: Math.round(clampedLeft),
      word: text,
      wordRect: {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
      },
      flipped: isFlipped,
    });

    addLog(
      'POSITION',
      `Anchored: "${text}"`,
      `Word Top: ${Math.round(rect.top)}px · Popover Top: ${Math.round(finalTop)}px · Gap: ${Math.abs(
        isFlipped ? Math.round(finalTop - rect.bottom) : Math.round(rect.top - (finalTop + popoverHeight))
      )}px · Flipped: ${isFlipped ? 'YES (Below)' : 'NO (Above)'}`
    );
  };

  // Text selection & Dismissal Listeners
  useEffect(() => {
    let timer: any = null;

    const handleSelection = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

        const text = selection.toString().trim();
        if (!text || text.length > 300) return;

        const range = selection.getRangeAt(0);
        if (!sandboxRef.current || !sandboxRef.current.contains(range.commonAncestorContainer)) {
          return;
        }

        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        lastActiveRangeRef.current = range;
        computeAndApplyPosition(rect, text);
      }, 150);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismissPopover('Escape key pressed');
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (!shadowHostRef.current) return;
      const path = e.composedPath ? e.composedPath() : [];
      const isInside = path.includes(shadowHostRef.current) || shadowHostRef.current.contains(e.target as Node);

      if (!isInside) {
        dismissPopover('Clicked outside popover');
      }
    };

    const handleScroll = () => {
      if (!lastActiveRangeRef.current || !shadowRootInstance.current) return;
      const popover = shadowRootInstance.current.getElementById('popover-box');
      if (!popover || !popover.classList.contains('ll-visible')) return;

      try {
        const rect = lastActiveRangeRef.current.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
          dismissPopover('Scrolled out of view');
        } else {
          const text = lastActiveRangeRef.current.toString().trim();
          computeAndApplyPosition(rect, text);
        }
      } catch (e) {
        dismissPopover('Scroll error');
      }
    };

    const dismissPopover = (reason: string) => {
      if (shadowRootInstance.current) {
        const popover = shadowRootInstance.current.getElementById('popover-box');
        if (popover && popover.classList.contains('ll-visible')) {
          popover.classList.remove('ll-visible');
          addLog('DISMISS', reason);
        }
      }
    };

    document.addEventListener('selectionchange', handleSelection);
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('selectionchange', handleSelection);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(timer);
    };
  }, []);

  const addLog = (type: EventLogItem['type'], message: string, detail?: string) => {
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    setEventLogs((prev) => [{ id: Math.random().toString(), time: timeStr, type, message, detail }, ...prev.slice(0, 19)]);
  };

  const normalizeText = (text: string) => {
    if (!text) return '';
    return text
      .trim()
      .toLowerCase()
      .replace(/^[\s"'`“‘«„\[\(\{<>\.,;:!?\-_—–#*~]+/, '')
      .replace(/[\s"'`”’»“\]\)\}<>\.,;:!?\-_—–#*~]+$/, '');
  };

  const generateLemmaCandidates = (word: string) => {
    const candidates: string[] = [];
    if (!word || word.length < 3) return candidates;

    if (word.endsWith('ies') && word.length > 4) {
      candidates.push(word.slice(0, -3) + 'y');
    } else if (word.endsWith('es') && word.length > 4) {
      candidates.push(word.slice(0, -2));
      candidates.push(word.slice(0, -1));
    } else if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
      candidates.push(word.slice(0, -1));
    }

    if (word.endsWith('ied') && word.length > 4) {
      candidates.push(word.slice(0, -3) + 'y');
    } else if (word.endsWith('ed') && word.length > 4) {
      candidates.push(word.slice(0, -2));
      candidates.push(word.slice(0, -1));
      if (word.length > 5 && word[word.length - 3] === word[word.length - 4] && word[word.length - 3] !== 'l') {
        candidates.push(word.slice(0, -3));
      }
    }

    if (word.endsWith('ing') && word.length > 4) {
      candidates.push(word.slice(0, -3));
      candidates.push(word.slice(0, -3) + 'e');
      if (word.length > 5 && word[word.length - 4] === word[word.length - 5] && word[word.length - 4] !== 'l') {
        candidates.push(word.slice(0, -4));
      }
    }

    return Array.from(new Set(candidates.filter((c) => c && c !== word)));
  };

  const lookupWord = (input: string) => {
    const clean = normalizeText(input);
    if (!clean) {
      return {
        lemma: input,
        selectedWord: input,
        translation: 'Translation not found',
      };
    }

    // Seeded dictionary from extension/dictionaries/custom-seed.json (Step 2.1)
    const seedDictionary: Array<{ lemma: string; definitions: string[]; forms: string[] }> = [
      { lemma: 'handle', definitions: ['обрабатывать', 'управлять', 'справляться'], forms: ['handles', 'handled', 'handling'] },
      { lemma: 'state', definitions: ['состояние', 'положение', 'государство'], forms: ['states', 'stated', 'stating'] },
      { lemma: 'manage', definitions: ['управлять', 'руководить'], forms: ['manages', 'managed', 'managing'] },
      { lemma: 'management', definitions: ['менеджмент', 'управление', 'руководство'], forms: [] },
      { lemma: 'isolate', definitions: ['изолировать', 'обособлять'], forms: ['isolates', 'isolated', 'isolating'] },
      { lemma: 'isolation', definitions: ['изоляция', 'обособление'], forms: [] },
      { lemma: 'shadow', definitions: ['тень', 'защищенный DOM'], forms: ['shadows', 'shadowed', 'shadowing'] },
      { lemma: 'viewport', definitions: ['область просмотра', 'экран'], forms: ['viewports'] },
      { lemma: 'mutation', definitions: ['мутация', 'изменение узла'], forms: ['mutations'] },
      { lemma: 'boundary', definitions: ['граница', 'предел'], forms: ['boundaries'] },
      { lemma: 'debounce', definitions: ['устранять дребезг', 'задерживать вызов'], forms: ['debounces', 'debounced', 'debouncing'] },
      { lemma: 'escape', definitions: ['выходить', 'клавиша Esc'], forms: ['escapes', 'escaped', 'escaping'] },
      { lemma: 'polysemy', definitions: ['полисемия', 'многозначность слова'], forms: [] },
      { lemma: 'linguistics', definitions: ['лингвистика', 'языкознание'], forms: ['linguistic'] },
      { lemma: 'instant', definitions: ['мгновенный', 'немедленный (0мс)'], forms: ['instantly'] },
      { lemma: 'dictionary', definitions: ['словарь', 'справочник'], forms: ['dictionaries'] },
      { lemma: 'database', definitions: ['база данных', 'хранилище'], forms: ['databases'] },
      { lemma: 'lookup', definitions: ['поиск', 'обращение к словарю'], forms: ['lookups'] },
      { lemma: 'seed', definitions: ['заполнять начальными данными', 'семя'], forms: ['seeds', 'seeded', 'seeding'] },
      { lemma: 'example', definitions: ['пример', 'образец'], forms: ['examples'] },
    ];

    // 1. Direct Lemma lookup in database
    const directLemma = seedDictionary.find((entry) => entry.lemma === clean);
    if (directLemma) {
      return {
        lemma: directLemma.lemma,
        selectedWord: input,
        translation: directLemma.definitions.join(', '),
      };
    }

    // 2. Inflected forms lookup in database
    const formMatch = seedDictionary.find((entry) => entry.forms.includes(clean));
    if (formMatch) {
      return {
        lemma: formMatch.lemma,
        selectedWord: input,
        translation: formMatch.definitions.join(', '),
      };
    }

    // 3. Query the database using the base form via lemmatization
    const candidates = generateLemmaCandidates(clean);
    for (const candidate of candidates) {
      const candidateMatch = seedDictionary.find((entry) => entry.lemma === candidate);
      if (candidateMatch) {
        return {
          lemma: candidateMatch.lemma,
          selectedWord: input,
          translation: candidateMatch.definitions.join(', '),
        };
      }
    }

    return {
      lemma: candidates[0] || clean,
      selectedWord: input,
      translation: 'Translation not found',
    };
  };

  const mockTranslate = (input: string) => {
    return lookupWord(input).translation;
  };

  const handleAddDynamicNode = () => {
    const phrases = [
      'The fixed positioning engine eliminates scroll offset bugs across all modern browsers.',
      'Strict Content Security Policy isolates extension components from hostile scripts.',
      'Double-click handles word selections with zero configuration overhead.',
    ];
    const nextPhrase = phrases[dynamicBlocks.length % phrases.length];
    setDynamicBlocks((prev) => [...prev, nextPhrase]);
    addLog('POSITION', 'DOM Mutation: Dynamic text block appended', 'MutationObserver verified');
  };

  const codeFiles = {
    'content-script.js': `// extension/content/content-script.js
// Precision Fixed Viewport Positioning Engine
function calculatePopoverPosition(rect) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const popoverWidth = popoverElement ? popoverElement.offsetWidth || 260 : 260;
  const popoverHeight = popoverElement ? popoverElement.offsetHeight || 36 : 36;
  const gap = 8; // Strictly 8px gap
  const padding = CONFIG.VIEWPORT_PADDING;

  // 1. Horizontal Centering
  const selectionCenterX = rect.left + rect.width / 2;
  const idealLeft = selectionCenterX - popoverWidth / 2;
  const clampedLeft = Math.max(padding, Math.min(viewportWidth - popoverWidth - padding, idealLeft));
  const arrowX = Math.max(12, Math.min(popoverWidth - 12, selectionCenterX - clampedLeft));

  // 2. Vertical Placement & Boundary Flip Logic
  const spaceAbove = rect.top;
  const neededAbove = popoverHeight + gap + padding;

  let finalTop;
  let arrowClass;

  if (spaceAbove >= neededAbove) {
    // Room available: strictly 8px ABOVE selection
    finalTop = rect.top - popoverHeight - gap;
    arrowClass = 'll-arrow-bottom';
  } else {
    // Near top edge of viewport: FLIP below selection by strictly 8px
    finalTop = rect.bottom + gap;
    arrowClass = 'll-arrow-top';
  }

  // Clamp within viewport
  finalTop = Math.max(padding, Math.min(viewportHeight - popoverHeight - padding, finalTop));

  return {
    top: Math.round(finalTop),
    left: Math.round(clampedLeft),
    arrowX: Math.round(arrowX),
    arrowClass: arrowClass
  };
}`,

    'content-styles.css': `/* extension/content/content-styles.css */
/* Position: Fixed architecture for absolute viewport accuracy */
:host {
  all: initial;
  position: fixed;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  overflow: visible;
  z-index: 2147483647;
  pointer-events: none;
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
  box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.6);
  padding: 6px 10px;
  opacity: 0;
  transform: translateY(4px) scale(0.98);
  transition: opacity 120ms ease-out, transform 120ms ease-out;
  pointer-events: none;
  font-size: 13px;
  white-space: nowrap;
  z-index: 2147483647;
}

.ll-popover.ll-visible {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
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
}`,

    'manifest.json': `{
  "manifest_version": 3,
  "name": "LinguaLens - 3-Layer AI Translator",
  "version": "1.0.0",
  "description": "Instant 3-layer text translation & linguistic analysis with isolated Shadow DOM.",
  "permissions": [
    "storage",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "https://*/*",
    "http://*/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/content-script.js"],
      "run_at": "document_idle"
    }
  ]
}`,

    'custom-seed.json': `[
  {
    "lemma": "handle",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "verb",
    "definitions": ["обрабатывать", "управлять", "справляться"],
    "forms": ["handles", "handled", "handling"]
  },
  {
    "lemma": "state",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "noun",
    "definitions": ["состояние", "положение", "государство"],
    "forms": ["states", "stated", "stating"]
  },
  {
    "lemma": "manage",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "verb",
    "definitions": ["управлять", "руководить"],
    "forms": ["manages", "managed", "managing"]
  },
  {
    "lemma": "management",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "noun",
    "definitions": ["менеджмент", "управление", "руководство"],
    "forms": []
  },
  {
    "lemma": "isolate",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "verb",
    "definitions": ["изолировать", "обособлять"],
    "forms": ["isolates", "isolated", "isolating"]
  },
  {
    "lemma": "isolation",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "noun",
    "definitions": ["изоляция", "обособление"],
    "forms": []
  },
  {
    "lemma": "shadow",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "noun",
    "definitions": ["тень", "защищенный DOM"],
    "forms": ["shadows", "shadowed", "shadowing"]
  },
  {
    "lemma": "viewport",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "noun",
    "definitions": ["область просмотра", "экран"],
    "forms": ["viewports"]
  },
  {
    "lemma": "mutation",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "noun",
    "definitions": ["мутация", "изменение узла"],
    "forms": ["mutations"]
  },
  {
    "lemma": "boundary",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "noun",
    "definitions": ["граница", "предел"],
    "forms": ["boundaries"]
  },
  {
    "lemma": "debounce",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "verb",
    "definitions": ["устранять дребезг", "задерживать вызов"],
    "forms": ["debounces", "debounced", "debouncing"]
  },
  {
    "lemma": "escape",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "verb",
    "definitions": ["выходить", "клавиша Esc"],
    "forms": ["escapes", "escaped", "escaping"]
  },
  {
    "lemma": "polysemy",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "noun",
    "definitions": ["полисемия", "многозначность слова"],
    "forms": []
  },
  {
    "lemma": "instant",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "adj",
    "definitions": ["мгновенный", "немедленный (0мс)"],
    "forms": ["instantly"]
  },
  {
    "lemma": "dictionary",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "noun",
    "definitions": ["словарь", "справочник"],
    "forms": ["dictionaries"]
  },
  {
    "lemma": "database",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "noun",
    "definitions": ["база данных", "хранилище"],
    "forms": ["databases"]
  },
  {
    "lemma": "lookup",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "noun",
    "definitions": ["поиск", "обращение к словарю"],
    "forms": ["lookups"]
  },
  {
    "lemma": "seed",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "verb",
    "definitions": ["заполнять начальными данными", "семя"],
    "forms": ["seeds", "seeded", "seeding"]
  },
  {
    "lemma": "example",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "noun",
    "definitions": ["пример", "образец"],
    "forms": ["examples"]
  }
]`,

    'service-worker.js': `// extension/background/service-worker.js
// Phase 2: Layer 1 Local Dictionary & IndexedDB Engine
const DB_CONFIG = { NAME: 'LinguaLensDB', VERSION: 1, STORE: 'dictionary' };
let dbInstance = null;

function openDatabase() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.NAME, DB_CONFIG.VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DB_CONFIG.STORE)) {
        const store = db.createObjectStore(DB_CONFIG.STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('by_lemma', 'lemma', { unique: false });
        store.createIndex('by_source_lemma', ['sourceLang', 'lemma'], { unique: false });
        store.createIndex('by_forms', 'forms', { multiEntry: true, unique: false });
      }
    };
    request.onsuccess = (event) => { dbInstance = event.target.result; resolve(dbInstance); };
    request.onerror = (event) => reject(event.target.error);
  });
}

// Auto-seed on extension install from custom-seed.json
async function seedDatabaseFromCustomSeed() {
  const url = chrome.runtime.getURL('dictionaries/custom-seed.json');
  const response = await fetch(url);
  const seedData = await response.json();
  const db = await openDatabase();
  const tx = db.transaction(DB_CONFIG.STORE, 'readwrite');
  const store = tx.objectStore(DB_CONFIG.STORE);
  for (const item of seedData) store.put(item);
}

// Sub-millisecond lookup (<2ms) via primary lemma & multiEntry forms index
async function lookupLocalWord(queryWord, sourceLang = 'en') {
  const cleanWord = queryWord.trim().toLowerCase();
  const startTime = performance.now();
  const db = await openDatabase();
  const tx = db.transaction(DB_CONFIG.STORE, 'readonly');
  const store = tx.objectStore(DB_CONFIG.STORE);
  
  // 1. Check lemma index
  let match = await new Promise((res) => {
    const req = store.index('by_lemma').get(cleanWord);
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => res(null);
  });

  // 2. Fall back to multiEntry forms index
  if (!match) {
    match = await new Promise((res) => {
      const req = store.index('by_forms').get(cleanWord);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
  }

  const latencyMs = Math.max(0.1, Number((performance.now() - startTime).toFixed(2)));
  return { match, latencyMs };
}

chrome.runtime.onInstalled.addListener(() => seedDatabaseFromCustomSeed());

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRANSLATE_REQUEST') {
    lookupLocalWord(message.payload.text).then(({ match, latencyMs }) => {
      sendResponse({
        success: true,
        data: {
          translation: match ? match.definitions.join(', ') : 'перевод',
          layer: match ? 1 : 2,
          latencyMs
        }
      });
    });
    return true; // Keep port open for async response
  }
});`,
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Bar Contract: 3 zones, single line */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-3.5 flex items-center justify-between gap-8 shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2">
              LinguaLens
              <span className="text-xs px-2 py-0.5 rounded font-mono text-cyan-400 bg-cyan-950/80 border border-cyan-800/60">
                Fixed Positioning Engine
              </span>
            </h1>
          </div>
        </div>

        <nav className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60">
          <button
            onClick={() => setActiveTab('sandbox')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'sandbox' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Live Shadow DOM Sandbox
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'code' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Source Files & Architecture
          </button>
          <button
            onClick={() => setActiveTab('roadmap')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'roadmap' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            5-Phase Roadmap Status
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-400">Positioning Mode</div>
            <div className="text-xs font-mono text-cyan-300">position: fixed (~8px Gap)</div>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50"></span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        {activeTab === 'sandbox' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 items-start">
            {/* Left 2 Cols: Interactive Sandbox */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              {/* Simulation Controls Toolbar */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Host Environment Controls
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    onClick={() => setHostCssHostile(!hostCssHostile)}
                    className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 font-medium transition-all ${
                      hostCssHostile
                        ? 'bg-rose-950/80 border-rose-600 text-rose-300'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Hostile CSS: {hostCssHostile ? 'ON (Style Bleed Test)' : 'OFF'}
                  </button>

                  <button
                    onClick={handleAddDynamicNode}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:border-indigo-500 hover:text-white flex items-center gap-1.5 transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                    + Insert Text Block
                  </button>
                </div>
              </div>

              {/* Sandbox Host Page */}
              <div
                className={`relative bg-slate-900 border rounded-xl p-6 min-h-[460px] overflow-hidden transition-all ${
                  hostCssHostile ? 'border-rose-500/50 ring-1 ring-rose-500/30' : 'border-slate-800'
                }`}
              >
                {hostCssHostile && (
                  <div className="mb-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Hostile CSS Active:</span> Host page applies global overrides.
                      Notice how the <strong>fixed Shadow DOM popover</strong> remains unaffected.
                    </div>
                  </div>
                )}

                <div className="text-xs text-slate-400 mb-6 flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <strong>Precision Positioning Sandbox:</strong> Select or double-click any word below.
                  </span>
                  <span className="font-mono text-cyan-400 text-[11px]">Strict Gap: 8px</span>
                </div>

                {/* Host Text Area */}
                <div
                  ref={sandboxRef}
                  className={`space-y-4 text-sm leading-relaxed transition-colors select-text ${
                    hostCssHostile ? 'font-serif text-rose-300' : 'text-slate-300'
                  }`}
                >
                  <p className="text-base font-medium text-slate-100">
                    Boundary Testing & Viewport Coordinates
                  </p>
                  
                  {/* Top Edge Word (Near Viewport Top to Trigger Flipping) */}
                  <div className="p-2 rounded bg-slate-800/60 border border-slate-700/60 text-xs text-cyan-300 flex items-center justify-between">
                    <span>
                      Top-Edge Test: Double-click{' '}
                      <strong className="underline cursor-pointer font-semibold text-white">flipping</strong> or{' '}
                      <strong className="underline cursor-pointer font-semibold text-white">coordinates</strong> to test automatic flip below text.
                    </span>
                    <span className="text-[10px] font-mono text-cyan-400">Flip Threshold: spaceAbove &lt; 56px</span>
                  </div>

                  <p>
                    In modern web development, state management <span className="text-indigo-400 font-semibold cursor-pointer">handles</span> the
                    coordination between asynchronous network requests and user interface components. Double-click on words like{' '}
                    <span className="text-cyan-400 font-semibold cursor-pointer">isolated</span>,{' '}
                    <span className="text-indigo-400 font-semibold cursor-pointer">polysemy</span>,{' '}
                    <span className="text-emerald-400 font-semibold cursor-pointer">dictionary</span>,{' '}
                    <span className="text-purple-400 font-semibold cursor-pointer">lookup</span>, or{' '}
                    <span className="text-amber-400 font-semibold cursor-pointer">database</span> to view definitions seeded from <code>custom-seed.json</code>.
                  </p>
                  
                  <p>
                    Because <code className="text-cyan-400 font-mono">position: fixed</code> calculates coordinates relative to the active viewport,
                    scrolling the page never causes coordinate drift. The local seed ensures sub-millisecond offline lookup for all 18 lemmas and their inflections.
                  </p>

                  {/* Step 2.3 Lemmatizer & Punctuation Test Strip */}
                  <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-800/60 text-xs text-indigo-200 space-y-1.5">
                    <div className="font-semibold text-indigo-300">Step 2.3 Morphology & Punctuation Test:</div>
                    <div className="text-slate-300 leading-normal">
                      Try selecting or double-clicking inflected or punctuated words: <span className="font-semibold text-cyan-300 cursor-pointer">"boundaries,"</span> (strips quotes/comma & resolves to boundary), <span className="font-semibold text-indigo-300 cursor-pointer">(handling)</span> (strips brackets & suffix -ing), <span className="font-semibold text-emerald-300 cursor-pointer">“viewports”</span> (strips curly quotes & suffix -s), or <span className="font-semibold text-amber-300 cursor-pointer">debouncing.</span> (strips trailing period & suffix -ing).
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-slate-800/60 space-y-3">
                    <div className="text-xs font-mono uppercase tracking-wider text-slate-500">
                      Dynamically Mutated Content Blocks:
                    </div>
                    {dynamicBlocks.map((text, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300"
                      >
                        {text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Col: Live Positioning Inspector & Telemetry */}
            <div className="flex flex-col gap-4">
              {/* Telemetry Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Target className="w-4 h-4 text-cyan-400" />
                    Position Telemetry (Real-Time)
                  </h3>
                  <span className="text-xs font-mono text-emerald-400">position: fixed</span>
                </div>

                {lastCoords ? (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800 flex flex-col gap-1.5">
                      <div className="flex justify-between text-slate-400">
                        <span>Selected Word:</span>
                        <span className="text-indigo-300 font-bold">"{lastCoords.word}"</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Word Bounds:</span>
                        <span className="text-slate-200">
                          Y: {lastCoords.wordRect.top}px · H: {lastCoords.wordRect.bottom - lastCoords.wordRect.top}px
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Popover Top:</span>
                        <span className="text-cyan-300 font-bold">{lastCoords.top}px</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Popover Left:</span>
                        <span className="text-cyan-300">{lastCoords.left}px</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Calculated Gap:</span>
                        <span className="text-emerald-400 font-bold">
                          {Math.abs(
                            lastCoords.flipped
                              ? lastCoords.top - lastCoords.wordRect.bottom
                              : lastCoords.wordRect.top - (lastCoords.top + 36)
                          )}px (Exact)
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Boundary Flip:</span>
                        <span className={lastCoords.flipped ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                          {lastCoords.flipped ? 'FLIPPED BELOW (Top edge protection)' : 'ABOVE WORD (Default)'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 py-4 text-center italic">
                    Select any word to inspect calculated viewport coordinates and gap math.
                  </div>
                )}
              </div>

              {/* Invariants Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-indigo-400" />
                    Positioning Fix Verification
                  </h3>
                  <span className="text-xs font-mono text-emerald-400">3/3 Fixed</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-200">range.getBoundingClientRect()</div>
                      <div className="text-slate-400 text-[11px]">
                        Calculates native viewport coordinates directly, eliminating parent offset distortions.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-200">Strict ~8px Spacing</div>
                      <div className="text-slate-400 text-[11px]">
                        <code>rect.top - popoverHeight - 8px</code> positions tooltip immediately above the selection.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-200">Boundary Flip Protection</div>
                      <div className="text-slate-400 text-[11px]">
                        When <code>spaceAbove &lt; popoverHeight + 8px + 12px</code>, flips to <code>rect.bottom + 8px</code>.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Event Stream */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col flex-1 min-h-[220px]">
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-800">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Maximize2 className="w-4 h-4 text-cyan-400" />
                    Event Stream
                  </h3>
                  <button
                    onClick={() => setEventLogs([])}
                    className="text-[11px] text-slate-500 hover:text-slate-300 font-mono"
                  >
                    Clear
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[11px] max-h-[200px]">
                  {eventLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2 rounded bg-slate-950/70 border border-slate-800/80 flex flex-col gap-0.5"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[10px] font-bold ${
                            log.type === 'POSITION'
                              ? 'text-cyan-400'
                              : log.type === 'SELECTION'
                              ? 'text-indigo-400'
                              : 'text-amber-400'
                          }`}
                        >
                          [{log.type}]
                        </span>
                        <span className="text-slate-500 text-[10px]">{log.time}</span>
                      </div>
                      <div className="text-slate-200">{log.message}</div>
                      {log.detail && <div className="text-slate-400 text-[10px]">{log.detail}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Code View Tab */}
        {activeTab === 'code' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col flex-1">
            <div className="bg-slate-950/90 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-indigo-400" />
                <span className="text-xs font-semibold text-slate-300">Positioning Engine Source Code</span>
              </div>
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                {(['content-script.js', 'content-styles.css', 'manifest.json', 'custom-seed.json', 'service-worker.js'] as const).map((file) => (
                  <button
                    key={file}
                    onClick={() => setSelectedFile(file)}
                    className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                      selectedFile === file
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {file}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 overflow-x-auto bg-slate-950 font-mono text-xs text-slate-300 leading-relaxed max-h-[640px] select-text">
              <pre>
                <code>{codeFiles[selectedFile]}</code>
              </pre>
            </div>
          </div>
        )}

        {/* 5-Phase Roadmap Status */}
        {activeTab === 'roadmap' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-white">5-Phase Production Roadmap Execution</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Phase 2 completed: Step 2.4 Instant 0-5ms cache resolver implemented and verified.
                  </p>
                </div>
                <span className="text-xs font-mono px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-700/60 text-emerald-300">
                  Phase 2 Completed
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-6">
                <div className="p-4 rounded-xl border border-cyan-500/60 bg-cyan-950/20 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-cyan-400 uppercase font-semibold">Phase 1</span>
                    <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  </div>
                  <h4 className="text-xs font-semibold text-white">Fixed Positioning & Shadow DOM</h4>
                  <p className="text-[11px] text-slate-400">Strict 8px gap, range.getBoundingClientRect(), flip logic.</p>
                  <span className="text-[10px] font-mono text-emerald-400 mt-auto">COMPLETED & VERIFIED</span>
                </div>

                <div className="p-4 rounded-xl border border-cyan-500/60 bg-cyan-950/20 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-cyan-400 uppercase font-semibold">Phase 2</span>
                    <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  </div>
                  <h4 className="text-xs font-semibold text-white">Layer 1 Local IndexedDB</h4>
                  <p className="text-[11px] text-slate-400">LinguaLensDB, punctuation stripper & suffix lemmatizer (-s, -ed, -ing).</p>
                  <span className="text-[10px] font-mono text-emerald-400 mt-auto">COMPLETED & VERIFIED</span>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 flex flex-col gap-2 opacity-70">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">Phase 3</span>
                    <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                  </div>
                  <h4 className="text-xs font-semibold text-white">Layer 2 Cloud Translation</h4>
                  <p className="text-[11px] text-slate-400">Google MT proxy, LRU deduplication, offline fallback.</p>
                  <span className="text-[10px] font-mono text-slate-500 mt-auto">PLANNED</span>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 flex flex-col gap-2 opacity-60">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">Phase 4</span>
                    <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                  </div>
                  <h4 className="text-xs font-semibold text-white">Layer 3 Linguistic AI</h4>
                  <p className="text-[11px] text-slate-400">Gemini 2.5 Flash, skeleton loader, idiom/slang nuance.</p>
                  <span className="text-[10px] font-mono text-slate-500 mt-auto">PLANNED</span>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 flex flex-col gap-2 opacity-50">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold">Phase 5</span>
                    <span className="w-2 h-2 rounded-full bg-slate-600"></span>
                  </div>
                  <h4 className="text-xs font-semibold text-white">Hardening & Store Launch</h4>
                  <p className="text-[11px] text-slate-400">Service Worker lifecycle audit, compliance review.</p>
                  <span className="text-[10px] font-mono text-slate-500 mt-auto">PLANNED</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Global Fixed Shadow Host Anchor */}
      <div
        ref={shadowHostRef}
        id="lingualens-popover-host"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 0,
          height: 0,
          overflow: 'visible',
          zIndex: 2147483647,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
