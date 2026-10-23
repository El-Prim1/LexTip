import assert from "assert";
import { app, server } from "../server/index";

// Setup Mock Chrome Storage
const memoryStore = {};
global.chrome = {
  storage: {
    local: {
      async get(key: string) {
        return {
          [key]: memoryStore[key]
            ? JSON.parse(JSON.stringify(memoryStore[key]))
            : {},
        };
      },
      async set(items: Record<string, unknown>) {
        Object.assign(memoryStore, JSON.parse(JSON.stringify(items)));
      },
    },
  },
  runtime: {
    onInstalled: { addListener: () => {} },
    onMessage: { addListener: () => {} },
  },
};

// Setup global CONFIG
global.CONFIG = {
  BACKEND_URL: "http://localhost:3000",
  LAYER3_TIMEOUT_MS: 10000,
  LAYER3_MAX_RETRIES: 2,
};

// Setup Mock Layer 1 Dictionary
global.lookupWord = async (word: string) => {
  if (word.toLowerCase() === "cat") {
    return {
      found: true,
      translation: "кот",
      lemma: "cat",
      selectedWord: word,
      partOfSpeech: "noun",
      analysis: null,
    };
  }
  return { found: false, lemma: word, selectedWord: word };
};

// Load Layer 2 Cache
await import("../extension/background/translation-cache.js");
const { getCachedTranslation, setCachedTranslation } =
  (globalThis as any).TranslationCache;
global.getCachedTranslation = getCachedTranslation;
global.setCachedTranslation = setCachedTranslation;

async function executeE2ETest() {
  console.log("[E2E Test] Starting end-to-end live pipeline verification...");

  // Helper matching service worker handleTranslation logic
  async function translate(text: string) {
    const startTime = performance.now();
    const trimmed = text.trim();

    // Layer 1
    const dictResult = await (global as any).lookupWord(trimmed);
    if (dictResult && dictResult.found) {
      return {
        translation: dictResult.translation,
        layer: 1,
        latencyMs: Math.max(
          0.1,
          Number((performance.now() - startTime).toFixed(2)),
        ),
      };
    }

    // Layer 2
    const cached = await (global as any).getCachedTranslation(trimmed);
    if (cached && cached.translatedText) {
      return {
        translation: cached.translatedText,
        layer: 2,
        latencyMs: Math.max(
          0.1,
          Number((performance.now() - startTime).toFixed(2)),
        ),
      };
    }

    // Layer 3
    const response = await fetch(
      `${(global as any).CONFIG.BACKEND_URL}/api/translate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      },
    );

    if (!response.ok) {
      throw new Error(`Backend returned HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data && data.translatedText) {
      await (global as any).setCachedTranslation(trimmed, {
        translatedText: data.translatedText,
        layer: 3,
      });

      return {
        translation: data.translatedText,
        layer: 3,
        latencyMs: Math.max(
          0.1,
          Number((performance.now() - startTime).toFixed(2)),
        ),
      };
    }

    throw new Error("Unexpected translation response");
  }

  // 1. Layer 1 Check (Local Dictionary)
  const layer1Result = await translate("cat");
  console.log("Layer 1 Result:", layer1Result);
  assert.strictEqual(layer1Result.layer, 1);
  assert.strictEqual(layer1Result.translation, "кот");

  // 2. Layer 3 Check (Live Backend Request)
  const phrase = "artificial intelligence";
  const layer3Result = await translate(phrase);
  console.log("Layer 3 Live Result:", layer3Result);
  assert.strictEqual(layer3Result.layer, 3);
  assert.ok(
    layer3Result.translation.toLowerCase().includes("интеллект"),
    "Translation must contain Russian translation",
  );

  // 3. Layer 2 Check (Cache Hit on repeated lookup)
  const layer2Result = await translate(phrase);
  console.log("Layer 2 Cache Result:", layer2Result);
  assert.strictEqual(layer2Result.layer, 2);
  assert.strictEqual(layer2Result.translation, layer3Result.translation);
  assert.ok(
    layer2Result.latencyMs < layer3Result.latencyMs,
    "Cache lookup must be faster than network call",
  );

  console.log(
    "[E2E Test] All end-to-end integration tests passed successfully!",
  );
}

executeE2ETest()
  .then(() => {
    server.close();
  })
  .catch((err) => {
    console.error("[E2E Test Error]:", err);
    server.close();
    process.exitCode = 1;
  });
