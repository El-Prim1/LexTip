# HOW MUST YOU WORK

## 1. Core Principles & Tone
- **Strictly Pragmatic & Engineering-Focused:** No fluff, no excessive apologies, no empty politeness. Less talk, more exact facts and code.
- **Directness:** If you don't know something 100%, state directly: "Insufficient data," instead of inventing hidden settings or writing fake configs. Search the web/docs for actual current data.
- **Language Matching:** Match the user's language (if the query/instruction is in Russian, reply in Russian; if in English, reply in English).

## 2. Step-by-Step Execution (Пошаговое выполнение)
- **Granular Decomposition:** Never try to implement a complex feature or fix everything in one giant monolithic blob of code. Break every task down into sequential micro-steps.
- **Step-by-Step Protocol:** 
  1. Present the implementation plan (steps 1, 2, 3...) before writing code.
  2. Execute **only one step at a time**, apply the changes, and verify them.
  3. Wait for confirmation or test results before moving to the next step.
- **Progress Tracking:** Clearly state which step is currently being executed and what the expected outcome is.

## 3. Code & Architecture Rules (Anti-Vibe-Mess)
- **No Guessing / No "A-vos" ("на авось"):** Never make rushed conclusions or offer blind solutions. 
- **Low-Level Analysis:** If an error log or stack trace is provided, parse it line-by-line down to the system calls or language modules. Do not guess based on the error text alone.
- **Triple Verification Rule:** Before suggesting any solution or config, verify it against three criteria:
  1. Does it contradict the operating system's logic?
  2. Does the specific library / runtime version actually support this solution?
  3. Are these configuration parameters documented in the official documentation?
-**Clear code:** Don't dublicate existing logic and code - first you must check files that you want to change and ensure that you are
  not going to make dublicates of an existing code, then you can apply changes directly to files.

- **Simplicity & Clarity:** Explain things in simple terms, but calibrated to the user's technical level.

## 4. Execution & File Management
- **Atomic Changes:** Keep edits focused and minimal. Do not rewrite whole files if a localized patch is enough.
- **Verification:** Always provide instructions on how to test or verify the code you wrote for the current step.

## 5. Output Constraints (Ограничения вывода)
- **No Code Blocks:** Do not output code snippets or full code blocks. 
- **Changelog Only:** State strictly what and where was fixed (file name, function, or logic block) in 1-2 concise sentences. No explanations.
- Answer using that language which user uses in a prompt

#HOW SHOULD YOU MAKE ENGINEERING DECISIONS

## 1. Project-Specific Rules: Browser Translation Extension
### Project Context
- **Product:** Chrome/Chromium browser extension that displays a translation popup when the user double-clicks a word or selects text.
- **Current language pair:** English → Russian. The architecture should support additional language pairs without unnecessary rewrites.
- **Core components:** Text selection, normalization, lemmatization, dictionary repository, lookup service, popup UI, and eventually external translation APIs.
- **Current priority:** Build a reliable dictionary lookup pipeline before implementing additional features.

### Architecture
- Keep text processing, lemmatization, dictionary access, translation providers, and UI logic separated.
- Reuse existing modules and interfaces. Never create a second implementation of functionality that already exists.
- Preserve the existing production dictionary format whenever possible. Introduce adapters and incremental migrations instead of rewriting large datasets unnecessarily.
- Keep dictionary lookup independent of any specific translation API or AI provider.
- Do not add dependencies, storage systems, background services, or architectural layers without a concrete need.

### Dictionary and Linguistic Logic
- Treat lemmatization, dictionary lookup, and translation as distinct operations.
- Never assume that one word form corresponds to exactly one lemma, grammatical category, or meaning.
- Preserve alternative lemmas, parts of speech, dictionary senses, and translations when ambiguity exists.
- Use exact normalized matching for dictionary phrases. Do not treat arbitrary sentences as dictionary entries.
- Include the source and target languages in lookup logic and index keys.
- Do not fabricate lemmas, definitions, translations, grammatical information, or confidence scores.
- Preserve the original selected text separately from normalized lookup keys.
- Keep legacy entries usable even when metadata such as part of speech or sense definitions is unavailable.
- Do not implement contextual AI disambiguation, translation APIs, subscription logic, or VIP functionality unless explicitly requested.

### Performance and Browser Compatibility
- Prioritize fast local dictionary lookups and avoid rebuilding indexes for every request.
- Reuse initialized NLP models and loaded resources.
- Verify that dependencies and assets work within the extension's actual runtime and build configuration.
- Avoid unnecessary DOM manipulation and prevent changes to the website being translated.
- Keep API credentials out of browser-accessible code when external services are introduced.

### Scope Control
- Implement only the currently requested development step.
- Preserve working extension functionality and existing data.
- Prefer small, reversible changes over broad refactoring.
- Do not advance to the next architectural step without the required verification and user confirmation.
- Before changing an existing component, identify its current role and dependencies to avoid breaking the active lookup path.