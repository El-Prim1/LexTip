# Chrome Extension (Manifest v3) Translation & Analysis: Technical Roadmap & Architecture

A production-grade, 5-phase engineering roadmap and interactive project dashboard for developing a high-performance text translation and linguistic analysis Chrome Extension with a 3-layer tiered translation engine, isolated Shadow DOM floating tooltip UI, and dynamic DOM mutation handling.

***

### User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Project Specifications**:
> - **Visual Theme**: Sleek Dark Mode with Indigo (`#6366F1`) and Cyan (`#06B6D4`) accent palette on deep neutral slate (`#0F172A`).
> - **Interactive Demonstrators**: All 3 simulation modules included — (1) 3-Layer Translation Engine Simulator with live latency/fallback diagnostics, (2) Chrome Extension Manifest v3 Architecture & Event Stream Inspector, and (3) Local IndexedDB & Cache Performance Inspector.
> - **Roadmap Depth**: Comprehensive 5-Phase Production Roadmap covering initial prototype, local storage dictionary seed, cloud APIs, AI deep analysis, through Chrome Web Store publication and telemetry.

***

## 1. Overview & Core Concept

### What It Does
A browser extension (Manifest v3) that provides zero-friction, context-aware translations upon web text selection or double-click. It uses a **3-Layer Translation Tiering Engine**:
1. **Layer 1 (Local IndexedDB Dictionary)**: 0ms latency lookup for single words and root lemmas offline, seeded via a lightweight custom JSON file (`custom-seed.json`) without bloating initial bundle size.
2. **Layer 2 (Google Translate Cloud API)**: Fast, reliable MT translation (<150ms) for multi-word phrases and sentences with automatic language detection and session-level request deduplication.
3. **Layer 3 (LLM Analysis API - Gemini 2.5 Flash)**: Deep linguistic breakdown for idioms, slang, grammatical nuances, and contextual explanations rendered inside an expanded popover window with smooth skeleton loaders.

### Target Audience & Persona
- Language learners and polyglots reading authentic foreign news and literature.
- Knowledge workers and researchers parsing foreign documentation and articles without switching tabs.
- Developers and enterprise users needing accurate technical nuance and idiom decoding.

### Key Value Proposition
- **Instantaneous (0ms)** for high-frequency vocabulary without hammering external APIs.
- **Zero Style Bleed**: Shadow DOM isolation ensures web page CSS never distorts tooltip typography or positioning.
- **SPA Resilience**: `MutationObserver` integration ensures text selection works seamlessly on modern dynamic web applications (Notion, Twitter, React/Vue SPAs).

***

## 2. User Experience & Visual Design

### Key User Flows
1. **Selection & Instant Popover**:
   - User highlights text or double-clicks a word on any web page (monitored safely via dynamic MutationObservers).
   - A lightweight trigger pin or instant tooltip appears directly above the selection, anchored via `getBoundingClientRect()`.
2. **Tier 1 / Tier 2 Rapid Translation**:
   - The popover displays primary translation, part of speech, and phonetic transcription.
   - Local dictionary hits resolve in <5ms; cloud requests resolve asynchronously.
3. **Deep Linguistic Deep-Dive (Layer 3)**:
   - User clicks `"Explain Nuance / Slang"` or presses a hotkey (`Alt+E`).
   - The popover displays a skeleton loader during the 500–1500ms AI latency window, expanding smoothly into structured analysis cards (Grammar, Cultural Context, Idiomatic Meaning, Example Sentences).
4. **Extension Options & Personalization**:
   - Target languages (e.g., Spanish, Japanese, German, Russian, French).
   - Hotkey bindings, auto-speak audio (Web Speech API), and custom offline dictionary downloads.

### Visual Identity & Theme
- **Theme**: Dark Modern Engineering Console (`#0F172A` canvas, `#1E293B` card surfaces, `#334155` subtle hairline borders).
- **Accents**: Indigo (`#6366F1`) for primary actions and Layer 2 MT, Cyan (`#06B6D4`) for Layer 1 instant local cache, and Violet/Purple (`#A855F7`) for Layer 3 LLM AI analysis.
- **Typography**: `Plus Jakarta Sans` for clean structural UI headers and controls; `DM Sans` for body copy and translation definitions; `JetBrains Mono` with `tabular-nums` for latency measurements, quota counters, and API payloads.
- **Discipline**: Strict 60-30-10 color allocation, unboxed metadata typography with typographic dot separators (`·`), no generic pill badges on card headers, and single-line responsive button controls.

***

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Manifest v3 Service Worker & Content Script Separation
- **Chosen Approach**: The Content Script strictly handles DOM selection events, Shadow DOM tooltip rendering, and coordinate math. All API requests and IndexedDB queries pass through the background `service-worker.js` via `chrome.runtime.sendMessage`.
- **Why**: Manifest v3 restricts cross-origin network requests from content scripts and forbids eval/remote code. Isolating API keys and token refreshes in the background service worker prevents token leakage to malicious web page scripts.
- **Alternative Considered**: Performing fetch inside the content script was rejected due to CORS limitations on arbitrary host domains and security risks.

### Decision 2: Shadow DOM vs. Iframe for Floating Tooltip
- **Chosen Approach**: Closed `attachShadow({ mode: 'closed' })` attached to a single top-level container element (`<div id="__trans-popover-host">`).
- **Why**: Complete CSS encapsulation prevents host styles (e.g. `p { font-size: 8px !important; }`) from corrupting the extension, while maintaining fast DOM access without the heavy memory overhead and scroll desynchronization of `<iframe>`. Includes graceful fallback handling for strict CSP (Content Security Policy) environments.
- **Alternative Considered**: Plain injected `<div>` with aggressive `!important` CSS classes, which frequently breaks on complex sites like Wikipedia, GitHub, or Notion.

### Decision 3: Local IndexedDB Seeded Dictionary
- **Chosen Approach**: Client-side IndexedDB initialized from a lightweight seed file (`custom-seed.json`) upon extension installation.
- **Why**: Keeps initial bundle size minimal while allowing easy manual expansion or programmatic updates without overloading storage limits (`chrome.storage` 10MB quota constraints).

***

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

┌─────────────────────────────────────────────────────────────────────────────┐
│                       HOST WEB PAGE (Content Script)                        │
│                                                                             │
│  [DOM MutationObserver] ──> [Text Selection / Double-Click Event Listener]  │
│                                                   │                         │
│                                                   ▼                         │
│                                    [Coordinate Calculator]                  │
│                                    (Window & Viewport Bounds)               │
│                                                   │                         │
│                                                   ▼                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     SHADOW DOM HOST CONTAINER                         │  │
│  │  #shadow-root (closed)                                                │  │
│  │   ┌───────────────────────────────────────────────────────────────┐   │  │
│  │   │  [Floating Popover UI]                                        │   │  │
│  │   │   ├── Primary Translation & Skeleton Loader (Layer 3 wait)    │   │  │
│  │   │   ├── Audio Pronunciation Button (TTS)                        │   │  │
│  │   │   └── Layer 3 "Explain Context & Idioms" Expandable Panel     │   │  │
│  │   └───────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────┬───────────────────────────────────────┘
│ chrome.runtime.sendMessage
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 MANIFEST V3 BACKGROUND SERVICE WORKER                       │
│                                                                             │
│   [Message Router & Session Deduplication Cache]                            │
│     │                                                                       │
│     ├─── [Layer 1: Single Word?] ───> [IndexedDB Local Dictionary] (0-5ms)  │
│     │                                      │ (Miss or multi-word)           │
│     ├─── [Layer 2: Standard Phrase] ──> [Google Translate API Proxy] (<150ms)
│     │                                                                       │
│     └─── [Layer 3: Nuance / Slang] ───> [Gemini 2.5 Flash LLM Service]      │
└─────────────────────────────────────┬───────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BACKEND & CLOUD SERVICES PROXY                           │
│   ├── /api/translate       (Google Cloud Translation API v3)               │
│   └── /api/analyze         (Google Gemini 2.5 Flash Structured JSON)        │
└─────────────────────────────────────────────────────────────────────────────┘


### Data Structures & Schemas

#### 1. Manifest (`manifest.json`)
```json
{
  "manifest_version": 3,
  "name": "LexTip - 3-Layer AI Translator",
  "version": "1.0.0",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": ["https://*/*"],
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
  ],
  "action": {
    "default_popup": "popup/popup.html"
  },
  "web_accessible_resources": [
    {
      "resources": ["assets/*", "dictionaries/*"],
      "matches": ["<all_urls>"]
    }
  ]
}
2. Local Dictionary Seed Entry (custom-seed.json)
JSON
[
  {
    "lemma": "example",
    "sourceLang": "en",
    "targetLang": "ru",
    "pos": "noun",
    "definitions": ["пример", "образец"]
  }
]
3. Translation & Analysis Payloads
TypeScript
interface TranslationRequest {
  text: string;
  sourceLang?: string;       // 'auto' or ISO code
  targetLang: string;
  requestLayer: 'auto' | 'layer1_only' | 'layer2_force' | 'layer3_explain';
  contextUrl?: string;
}

interface AnalysisResult {
  text: string;
  translation: string;
  resolvedLayer: 1 | 2 | 3;
  latencyMs: number;
  linguisticBreakdown?: {
    idiomMeaning?: string;
    slangContext?: string;
    grammaticalNuance?: string;
    formality: 'casual' | 'formal' | 'slang' | 'neutral';
    examples: Array<{ foreign: string; translated: string }>;
  };
}
5. Comprehensive 5-Phase Production Roadmap
Phase 1: Core Content Script & Isolated Shadow DOM Engine
Task 1.1: Implement text selection listener with debouncing (150ms) and double-click event handling. Filter out input/textarea selections unless explicitly enabled.

Task 1.2: Integrate MutationObserver to ensure event listeners and selection handlers attach correctly to dynamically rendered elements in SPAs (React, Vue, Notion).

Task 1.3: Build viewport boundary calculation logic to keep the popover inside window bounds (flipping below text if selection is near the top edge) and handle strict CSP error boundaries.

Task 1.4: Construct the Shadow DOM container with attachShadow({ mode: 'closed' }) and load isolated styles with CSS custom properties.

Task 1.5: Establish chrome.runtime.sendMessage message passing contract between Content Script and Service Worker.

Risks & Mitigations:

Risk: Sticky headers or transformed parents (transform: scale()) offset the tooltip coordinates.

Mitigation: Anchor coordinates to window.scrollX / window.scrollY + range.getBoundingClientRect().

Phase 2: Layer 1 Local Dictionary & IndexedDB Engine
Task 2.1: Set up background IndexedDB schema with indexes on [sourceLang, lemma].

Task 2.2: Implement chrome.runtime.onInstalled listener to fetch and seed IndexedDB from custom-seed.json.

Task 2.3: Build text normalizer (strip punctuation, lower-case, basic stemming/lemmatization).

Task 2.4: Create instant 0-5ms cache resolver that returns immediate translation before any network call fires.

Risks & Mitigations:

Risk: Initial IndexedDB population slows extension installation.

Mitigation: Stream parse seed file asynchronously on first language selection.

Phase 3: Layer 2 Cloud Translation & Fallback Pipeline
Task 3.1: Integrate Google Cloud Translation API via a secure backend proxy (/api/translate).

Task 3.2: Implement automatic source language detection and confidence scoring.

Task 3.3: Implement session-level LRU cache and request deduplication to prevent redundant network calls on rapid selections.

Task 3.4: Build Tiering Controller:

If single word & found in Layer 1 -> Return Layer 1 immediately.

If phrase, sentence, or Layer 1 miss -> Call Layer 2 Cloud API.

If offline (navigator.onLine === false) -> Fallback gracefully to Layer 1.

Risks & Mitigations:

Risk: High API bill from accidental runaway selection loops.

Mitigation: Content script request throttle (max 3 req/sec) and client-side LRU cache.

Phase 4: Layer 3 Deep Linguistic AI & Polished UI Experience
Task 4.1: Implement Gemini 2.5 Flash prompt for structured idiom/slang/grammar extraction (responseSchema).

Task 4.2: Design interactive popover expansion panel with smooth CSS transitions and skeleton loaders during the 500–1500ms AI latency window.

Task 4.3: Web Speech API audio synthesis for instant pronunciation.

Task 4.4: Accessibility (WCAG 2.1 AA keyboard navigation: Esc to close, arrow keys inside popover).

Risks & Mitigations:

Risk: Users spamming AI explain button causing latency spikes.

Mitigation: Debounce explain trigger and display persistent skeleton state.

Phase 5: Production Hardening, Compliance & Store Launch
Task 5.1: Audit Manifest v3 service worker lifecycle (handle termination/idle sleep without dropping active fetch requests).

Task 5.2: Prepare Chrome Web Store compliance package (privacy policy, single purpose justification, permissions justification).

Risks & Mitigations:

Risk: Chrome Web Store rejection due to host_permissions: ["<all_urls>"].

Mitigation: Provide explicit justification video and documentation demonstrating in-page translation requirement.

6. Interactive Architecture & Roadmap Dashboard Web Application Plan
The web application in AI Studio will serve as an Interactive Architecture & Roadmap Dashboard:

Interactive 3-Layer Simulator:

Live text input testing (e.g. single word "run", slang "no cap", idiom "bite the bullet", full sentence).

Real-time simulation of Layer 1 (0ms IndexedDB), Layer 2 (Google MT), and Layer 3 (Gemini AI explanation).

Live latency measurement counter and fallback diagnostics.

Interactive Shadow DOM Popover Sandbox:

Preview of how the closed Shadow DOM renders across different sample web environments without CSS inheritance.

Draggable text selection simulator.

5-Phase Actionable Roadmap & Milestone Checklist:

Interactive milestone viewer with completed task tracking, code snippets, architectural notes, and risk matrix.

Manifest v3 Config & Architecture Inspector:

Live inspector for manifest.json, service worker message dispatch, and cache manager.